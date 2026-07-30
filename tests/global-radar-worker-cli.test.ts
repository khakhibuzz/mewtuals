import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dirname } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_GLOBAL_RADAR_WORKER_FILE_BYTES,
  runGlobalRadarWorkerCli,
  type GlobalRadarWorkerRuntime,
} from "../scripts/global-radar-worker";
import {
  generateGlobalRadarQueries,
  planGlobalRadarRun,
} from "../app/domain/global-radar";

const validBatchFile = resolve(
  "tests/fixtures/global-radar-valid-batch.json",
);
const temporaryDirectories: string[] = [];

type CapturedCommand = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

function defaultRuntime(
  overrides: Partial<GlobalRadarWorkerRuntime> = {},
): GlobalRadarWorkerRuntime {
  return {
    environment: {
      GLOBAL_RADAR_API_BASE_URL: "https://mewtuals.example",
      GLOBAL_RADAR_WORKER_SECRET: "radar-worker-secret",
    },
    fetch: vi.fn(async () => {
      throw new Error("Unexpected network request.");
    }),
    timeoutSignal: vi.fn(() => new AbortController().signal),
    ...overrides,
  };
}

async function runCommand(
  arguments_: readonly string[],
  runtime: GlobalRadarWorkerRuntime = defaultRuntime(),
): Promise<CapturedCommand> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runGlobalRadarWorkerCli(arguments_, runtime, {
    writeStdout(value) {
      stdout += value;
    },
    writeStderr(value) {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
}

function temporaryFile(contents: string, name = "document.json"): string {
  const directory = mkdtempSync(join(tmpdir(), "mewtuals-radar-cli-test-"));
  temporaryDirectories.push(directory);
  const file = join(directory, name);
  writeFileSync(file, contents, "utf8");
  return file;
}

function claimedResponse() {
  const plan = planGlobalRadarRun({
    now: new Date("2026-07-31T00:00:00.000Z"),
    scanMode: "daily",
    config: {
      countries: ["United States", "China"],
      languages: ["en", "zh-CN"],
      themes: ["robot_teleoperation_demonstrations"],
      enabledSourceAdapters: ["codex_public_web"],
      sourceFamilies: ["official_company_material"],
      resultLimit: 20,
      scoreVersion: "global-radar-score-v1",
      thresholds: {
        version: "global-radar-thresholds-v1",
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    },
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist: [],
  });
  return {
    ok: true,
    outcome: "claimed",
    claim: {
      runId: "00000000-0000-4000-8000-000000000150",
      leaseToken: "private-radar-lease-token",
      leaseExpiresAt: "2026-07-31T06:00:00.000Z",
      versions: {
        prompt: "codex-public-web-v1",
        schema: "global-radar-batch-v1",
        taxonomy: "global-radar-v1",
        scoring: "global-radar-score-v1",
        plan: "global-radar-plan-v1",
        query: "global-radar-query-v1",
      },
      plan,
      queries: generateGlobalRadarQueries(plan),
      config: {
        countries: ["United States", "China"],
        languages: ["en", "zh-CN"],
        themes: ["robot_teleoperation_demonstrations"],
        enabledSources: ["codex_public_web"],
        resultLimit: 20,
        thresholds: {
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
      },
      outputSchema: {
        schemaId: "global-radar-rich-worker-proposal-v1",
        additionalProperties: false,
      },
    },
  } as const;
}

function terminalRun(
  status: "succeeded" | "partial" | "failed" = "succeeded",
) {
  return {
    id: "00000000-0000-4000-8000-000000000150",
    trigger: "scheduled",
    scanMode: "daily",
    status,
    startedAt: "2026-07-31T05:00:00.000Z",
    completedAt: "2026-07-31T05:03:00.000Z",
    sourceCountries: ["United States", "China"],
    sourceLanguages: ["en", "zh-CN"],
    targetDomains: ["robot_learning_and_manipulation"],
    targetSignalTypes: ["direct_demand"],
    sourcesUsed: ["codex_public_web"],
    counts: {
      resultsExamined: 2,
      entitiesObserved: 1,
      signalsFound: 0,
      directDemands: 0,
      precursors: 0,
      momentumRecords: 0,
      new: 0,
      updated: 0,
      duplicates: 0,
      rejectedForWeakEvidence: 0,
      sourceErrors: 0,
    },
    notices: [],
    createdAt: "2026-07-31T05:00:00.000Z",
    updatedAt: "2026-07-31T05:03:00.000Z",
  } as const;
}

function privateClaimFile(
  overrides: Record<string, unknown> = {},
): string {
  const claim = { ...claimedResponse().claim, ...overrides };
  return temporaryFile(JSON.stringify(claim), "claim.json");
}

function submissionBatchFile(): string {
  const batch = JSON.parse(readFileSync(validBatchFile, "utf8")) as Record<
    string,
    unknown
  >;
  batch.planFingerprint = claimedResponse().claim.plan.fingerprint;
  return temporaryFile(`${JSON.stringify(batch, null, 2)}\n`, "batch.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Global Radar worker CLI submission", () => {
  it("validates once and sends the exact batch bytes with the private lease header", async () => {
    const batchFile = submissionBatchFile();
    const claimFile = privateClaimFile();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const runtime = defaultRuntime({
      fetch: vi.fn(async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json({
          ok: true,
          outcome: "completed",
          run: terminalRun(),
        });
      }),
    });

    const result = await runCommand(
      ["submit", "--claim-file", claimFile, "--file", batchFile],
      runtime,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "submit",
      outcome: "completed",
      run: terminalRun(),
    });
    expect(result.stderr).toBe("");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      "https://mewtuals.example/api/global-radar/worker/runs/00000000-0000-4000-8000-000000000150/complete",
    );
    expect(requests[0]!.init.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer radar-worker-secret",
        "Content-Type": "application/json",
        "X-Global-Radar-Lease-Token": "private-radar-lease-token",
      }),
    );
    expect(Buffer.from(requests[0]!.init.body as Uint8Array)).toEqual(
      readFileSync(batchFile),
    );
    expect(runtime.timeoutSignal).toHaveBeenCalledWith(120_000);
  });

  it("accepts idempotent replay and validates the complete safe run DTO", async () => {
    const result = await runCommand(
      [
        "submit",
        "--claim-file",
        privateClaimFile(),
        "--file",
        submissionBatchFile(),
      ],
      defaultRuntime({
        fetch: vi.fn(async () =>
          Response.json({
            ok: true,
            outcome: "replayed",
            run: terminalRun("partial"),
          }),
        ),
      }),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "submit",
      outcome: "replayed",
      run: { status: "partial" },
    });
  });

  it("rejects malformed claims and run-id mismatches before network access", async () => {
    const fetch = vi.fn();
    const malformedClaim = temporaryFile(
      '{"runId":"private-token-must-not-print"}',
      "malformed-claim.json",
    );
    const mismatchedClaim = privateClaimFile({
      runId: "00000000-0000-4000-8000-000000000151",
    });

    const malformed = await runCommand(
      [
        "submit",
        "--claim-file",
        malformedClaim,
        "--file",
        submissionBatchFile(),
      ],
      defaultRuntime({ fetch }),
    );
    const mismatch = await runCommand(
      [
        "submit",
        "--claim-file",
        mismatchedClaim,
        "--file",
        validBatchFile,
      ],
      defaultRuntime({ fetch }),
    );

    expect(malformed.exitCode).toBe(1);
    expect(malformed.stderr).not.toContain("private-token-must-not-print");
    expect(JSON.parse(mismatch.stderr)).toEqual({
      ok: false,
      error:
        "The Global Radar batch run id does not match the private claim file.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the exact claim and batch files after an unknown submission outcome", async () => {
    const claimFile = privateClaimFile();
    const batchFile = submissionBatchFile();
    const claimBefore = readFileSync(claimFile);
    const batchBefore = readFileSync(batchFile);

    const result = await runCommand(
      ["submit", "--claim-file", claimFile, "--file", batchFile],
      defaultRuntime({
        fetch: vi.fn(async () => {
          throw new DOMException("private upstream detail", "AbortError");
        }),
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The Global Radar API could not be reached for submit.",
      reason: "request_aborted",
    });
    expect(result.stderr).not.toContain("private upstream detail");
    expect(readFileSync(claimFile)).toEqual(claimBefore);
    expect(readFileSync(batchFile)).toEqual(batchBefore);
  });
});

describe("Global Radar worker CLI failure and orphan recovery", () => {
  it("fails a leased run with a bounded reason and never puts the lease in the body", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const runtime = defaultRuntime({
      fetch: vi.fn(async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json({
          ok: true,
          outcome: "completed",
          run: terminalRun("failed"),
        });
      }),
    });

    const result = await runCommand(
      [
        "fail",
        "--claim-file",
        privateClaimFile(),
        "--message",
        "Public source adapter failed.",
      ],
      runtime,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "fail",
      outcome: "completed",
      run: { status: "failed" },
    });
    expect(requests[0]!.url).toMatch(/\/fail$/);
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({
      runId: "00000000-0000-4000-8000-000000000150",
      reason: "Public source adapter failed.",
    });
    expect(String(requests[0]!.init.body)).not.toContain(
      "private-radar-lease-token",
    );
    expect(requests[0]!.init.headers).toEqual(
      expect.objectContaining({
        "X-Global-Radar-Lease-Token": "private-radar-lease-token",
      }),
    );
    expect(runtime.timeoutSignal).toHaveBeenCalledWith(30_000);
  });

  it("abandons only an explicit run id without any lease header or artifact", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const runtime = defaultRuntime({
      fetch: vi.fn(async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json({
          ok: true,
          outcome: "replayed",
          run: terminalRun("failed"),
        });
      }),
    });

    const result = await runCommand(
      [
        "abandon",
        "--run-id",
        "00000000-0000-4000-8000-000000000150",
        "--message",
        "Claim artifact was irrecoverably lost.",
      ],
      runtime,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "abandon",
      outcome: "replayed",
    });
    expect(requests[0]!.url).toMatch(/\/abandon$/);
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({
      runId: "00000000-0000-4000-8000-000000000150",
      reason: "Claim artifact was irrecoverably lost.",
    });
    const headers = requests[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer radar-worker-secret");
    expect(headers["X-Global-Radar-Lease-Token"]).toBeUndefined();
  });

  it("rejects invalid run ids and overlong terminal messages before network access", async () => {
    const fetch = vi.fn();

    const invalidRun = await runCommand(
      ["abandon", "--run-id", "not-a-uuid", "--message", "lost"],
      defaultRuntime({ fetch }),
    );
    const longFail = await runCommand(
      [
        "fail",
        "--claim-file",
        privateClaimFile(),
        "--message",
        "x".repeat(1_001),
      ],
      defaultRuntime({ fetch }),
    );

    expect(invalidRun.exitCode).toBe(1);
    expect(longFail.exitCode).toBe(1);
    expect(longFail.stderr).not.toContain("xxxxx");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Global Radar worker CLI response safety", () => {
  it("reports only allowlisted conflict metadata and never echoes response bodies", async () => {
    const privateValue = "private-response-body-and-token";
    const result = await runCommand(
      [
        "submit",
        "--claim-file",
        privateClaimFile(),
        "--file",
        submissionBatchFile(),
      ],
      defaultRuntime({
        fetch: vi.fn(async () =>
          Response.json(
            {
              ok: false,
              outcome: "conflict",
              reason: "lease_mismatch",
              rawPayload: privateValue,
              leaseToken: privateValue,
            },
            { status: 409 },
          ),
        ),
      }),
    );

    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The Global Radar API rejected submit with HTTP 409.",
      httpStatus: 409,
      outcome: "conflict",
      reason: "lease_mismatch",
    });
    expect(result.stderr).not.toContain(privateValue);
    expect(result.stdout).toBe("");
  });

  it("rejects non-JSON and malformed success responses without printing them", async () => {
    const privateBody = "private full source response";
    const nonJson = await runCommand(
      ["claim"],
      defaultRuntime({
        fetch: vi.fn(async () => new Response(privateBody, { status: 200 })),
      }),
    );
    const malformedSuccess = await runCommand(
      [
        "fail",
        "--claim-file",
        privateClaimFile(),
        "--message",
        "Source failed.",
      ],
      defaultRuntime({
        fetch: vi.fn(async () =>
          Response.json({
            ok: true,
            outcome: "completed",
            run: { ...terminalRun("failed"), rawPayload: privateBody },
          }),
        ),
      }),
    );

    expect(nonJson.exitCode).toBe(1);
    expect(malformedSuccess.exitCode).toBe(1);
    expect(nonJson.stderr).not.toContain(privateBody);
    expect(malformedSuccess.stderr).not.toContain(privateBody);
  });

  it("requires credential-free HTTP(S) configuration only for network commands", async () => {
    const validated = await runCommand(
      ["validate", "--file", validBatchFile],
      defaultRuntime({ environment: {} }),
    );
    const missing = await runCommand(
      ["claim"],
      defaultRuntime({ environment: {} }),
    );
    const credentials = await runCommand(
      ["claim"],
      defaultRuntime({
        environment: {
          GLOBAL_RADAR_API_BASE_URL: "https://user:password@mewtuals.example",
          GLOBAL_RADAR_WORKER_SECRET: "private-secret",
        },
      }),
    );

    expect(validated.exitCode).toBe(0);
    expect(missing.exitCode).toBe(1);
    expect(credentials.exitCode).toBe(1);
    expect(credentials.stderr).not.toContain("password");
    expect(credentials.stderr).not.toContain("private-secret");
  });
});

describe("Global Radar package commands", () => {
  it("adds exactly five Radar worker scripts without replacing Discovery", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve("package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const radarScripts = Object.fromEntries(
      Object.entries(packageJson.scripts).filter(([name]) =>
        name.startsWith("global-radar:"),
      ),
    );

    expect(radarScripts).toEqual({
      "global-radar:claim":
        "node --import tsx scripts/global-radar-worker.ts claim",
      "global-radar:validate":
        "node --import tsx scripts/global-radar-worker.ts validate",
      "global-radar:submit":
        "node --import tsx scripts/global-radar-worker.ts submit",
      "global-radar:fail":
        "node --import tsx scripts/global-radar-worker.ts fail",
      "global-radar:abandon":
        "node --import tsx scripts/global-radar-worker.ts abandon",
    });
    expect(packageJson.scripts).toMatchObject({
      "discovery:claim": "tsx scripts/discovery-worker.ts claim",
      "discovery:validate": "tsx scripts/discovery-worker.ts validate",
      "discovery:submit": "tsx scripts/discovery-worker.ts submit",
      "discovery:fail": "tsx scripts/discovery-worker.ts fail",
      "discovery:abandon": "tsx scripts/discovery-worker.ts abandon",
    });
  });
});

describe("Global Radar worker CLI validation and arguments", () => {
  it("validates a minimal reserved-domain rich worker proposal", async () => {
    const result = await runCommand(["validate", "--file", validBatchFile]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "validate",
      runId: "00000000-0000-4000-8000-000000000150",
      entityCount: 1,
      signalCount: 0,
      evidenceCount: 0,
      requirementCount: 0,
      executedQueryCount: 0,
      sourceErrorCount: 0,
    });
    expect(result.stderr).toBe("");
  });

  it("reports at most twenty bounded schema issues without echoing rejected content", async () => {
    const batch = JSON.parse(readFileSync(validBatchFile, "utf8")) as Record<
      string,
      unknown
    >;
    batch.workerSecret = "must-never-be-printed";
    batch["private-key-name-must-not-print"] = true;
    const file = temporaryFile(JSON.stringify(batch));

    const result = await runCommand(["validate", "--file", file]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: "The Global Radar batch failed validation.",
      issues: [{ path: "", message: expect.any(String) }],
    });
    expect(JSON.parse(result.stderr).issues).toHaveLength(1);
    expect(result.stderr).not.toContain("must-never-be-printed");
    expect(result.stderr).not.toContain("private-key-name-must-not-print");
  });

  it("rejects malformed and oversized files without printing their contents", async () => {
    const malformed = temporaryFile("not-json private-source-body", "bad.json");
    const oversized = temporaryFile(
      `{"private":"${"x".repeat(MAX_GLOBAL_RADAR_WORKER_FILE_BYTES)}"}`,
      "large.json",
    );

    const malformedResult = await runCommand([
      "validate",
      "--file",
      malformed,
    ]);
    const oversizedResult = await runCommand([
      "validate",
      "--file",
      oversized,
    ]);

    expect(JSON.parse(malformedResult.stderr)).toEqual({
      ok: false,
      error: "The Global Radar JSON file is not valid JSON.",
    });
    expect(malformedResult.stderr).not.toContain("private-source-body");
    expect(JSON.parse(oversizedResult.stderr)).toEqual({
      ok: false,
      error: `The Global Radar file must be at most ${MAX_GLOBAL_RADAR_WORKER_FILE_BYTES} bytes.`,
    });
    expect(oversizedResult.stderr).not.toContain("xxxxx");
  });

  it("rejects unknown, duplicate, missing, and cross-command options", async () => {
    const cases = [
      ["validate"],
      ["validate", "--file", validBatchFile, "--file", validBatchFile],
      ["validate", "--claim-file", validBatchFile],
      ["claim", "--unknown", "value"],
      ["submit", "--claim-file", validBatchFile],
      ["fail", "--claim-file", validBatchFile, "--file", validBatchFile],
      ["abandon", "--run-id", "id", "--lease-token", "secret"],
      ["abandon", "--claim-file", validBatchFile, "--message", "lost"],
    ] as const;

    for (const arguments_ of cases) {
      const result = await runCommand(arguments_);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        error: expect.any(String),
      });
      expect(result.stderr).not.toContain("radar-worker-secret");
    }
  });

  it("accepts only locked claim selectors and applies scheduled daily defaults", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const runtime = defaultRuntime({
      fetch: vi.fn(async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json({ ok: true, outcome: "no_work", reason: "empty_queue" });
      }),
    });

    const defaults = await runCommand(["claim"], runtime);
    const thematicTrial = await runCommand(
      ["claim", "--trigger", "trial", "--scan-mode", "thematic"],
      runtime,
    );
    const badTrigger = await runCommand(
      ["claim", "--trigger", "manual"],
      runtime,
    );
    const badMode = await runCommand(
      ["claim", "--scan-mode", "manual"],
      runtime,
    );

    expect(JSON.parse(defaults.stdout)).toMatchObject({
      ok: true,
      command: "claim",
      claimed: false,
      reason: "empty_queue",
    });
    expect(JSON.parse(thematicTrial.stdout)).toMatchObject({ claimed: false });
    expect(requests.map(({ init }) => JSON.parse(String(init.body)))).toEqual([
      { trigger: "scheduled", scanMode: "daily" },
      { trigger: "trial", scanMode: "thematic" },
    ]);
    expect(badTrigger.exitCode).toBe(1);
    expect(badMode.exitCode).toBe(1);
  });

  it("strictly validates no-work responses without exposing an active run", async () => {
    const activeRun = {
      ...terminalRun(),
      status: "running",
      completedAt: null,
    };
    const valid = await runCommand(
      ["claim"],
      defaultRuntime({
        fetch: vi.fn(async () =>
          Response.json({
            ok: true,
            outcome: "no_work",
            reason: "active_run",
            run: activeRun,
          }),
        ),
      }),
    );
    const unsafe = await runCommand(
      ["claim"],
      defaultRuntime({
        fetch: vi.fn(async () =>
          Response.json({
            ok: true,
            outcome: "no_work",
            reason: "active_run",
            run: activeRun,
            leaseToken: "must-not-print",
          }),
        ),
      }),
    );

    expect(JSON.parse(valid.stdout)).toEqual({
      ok: true,
      command: "claim",
      claimed: false,
      reason: "active_run",
    });
    expect(unsafe.exitCode).toBe(1);
    expect(unsafe.stderr).not.toContain("must-not-print");
  });

  it("stores only the validated claim in a private artifact and prints a bounded summary", async () => {
    const response = claimedResponse();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const runtime = defaultRuntime({
      fetch: vi.fn(async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json(response);
      }),
    });

    const result = await runCommand(["claim"], runtime);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(output).toEqual({
      ok: true,
      command: "claim",
      claimed: true,
      runId: response.claim.runId,
      leaseExpiresAt: response.claim.leaseExpiresAt,
      versions: response.claim.versions,
      plan: {
        scanMode: "daily",
        fingerprint: response.claim.plan.fingerprint,
        countryCount: 2,
        languageCount: 2,
        themeCount: 1,
        sourceAdapterCount: 1,
        sourceFamilyCount: 1,
        watchlistCount: 0,
        resultLimit: 20,
        dateWindow: response.claim.plan.dateWindow,
      },
      queries: { count: response.claim.queries.length },
      config: {
        countryCount: 2,
        languageCount: 2,
        themeCount: 1,
        enabledSources: ["codex_public_web"],
        resultLimit: 20,
        thresholds: response.claim.config.thresholds,
      },
      claimFile: expect.any(String),
    });
    const claimFile = String(output.claimFile);
    temporaryDirectories.push(dirname(claimFile));
    expect(JSON.parse(readFileSync(claimFile, "utf8"))).toEqual(response.claim);
    expect(statSync(dirname(claimFile)).mode & 0o777).toBe(0o700);
    expect(statSync(claimFile).mode & 0o777).toBe(0o600);
    expect(result.stdout).not.toContain(response.claim.leaseToken);
    expect(result.stdout).not.toContain(response.claim.queries[0]!.query);
    expect(result.stdout).not.toContain("global-radar-rich-worker-proposal-v1");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://mewtuals.example/api/global-radar/worker/claim",
      init: {
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer radar-worker-secret",
          "Content-Type": "application/json",
        }),
      },
    });
    expect(runtime.timeoutSignal).toHaveBeenCalledWith(30_000);
  });

  it("rejects malformed claimed responses before writing a secret artifact", async () => {
    const response = claimedResponse();
    const invalidResponses = [
      { ...response, claim: { ...response.claim, runId: "not-a-uuid" } },
      {
        ...response,
        claim: { ...response.claim, leaseExpiresAt: "not-a-date" },
      },
      {
        ...response,
        claim: { ...response.claim, leaseExpiresAt: "July 31, 2026" },
      },
      {
        ...response,
        claim: {
          ...response.claim,
          queries: response.claim.queries.slice(1),
        },
      },
      {
        ...response,
        claim: { ...response.claim, hiddenSecret: "do-not-write" },
      },
    ];

    for (const invalidResponse of invalidResponses) {
      const result = await runCommand(
        ["claim"],
        defaultRuntime({
          fetch: vi.fn(async () => Response.json(invalidResponse)),
        }),
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toEqual({
        ok: false,
        error: "The Global Radar API returned an invalid response for claim.",
      });
      expect(result.stderr).not.toContain("do-not-write");
      expect(result.stderr).not.toContain(response.claim.leaseToken);
    }
  });
});
