import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const workerScript = resolve("scripts/discovery-worker.ts");
const tsxExecutable = resolve("node_modules/.bin/tsx");
const temporaryDirectories: string[] = [];
const apiServers: ReturnType<typeof createServer>[] = [];

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function runWorker(
  arguments_: readonly string[],
  environment: Record<string, string> = {},
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(tsxExecutable, [workerScript, ...arguments_], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...environment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolveResult({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mewtuals-discovery-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

function validBatch() {
  return {
    runId: "00000000-0000-4000-8000-000000000101",
    leaseToken: "test-lease-token",
    promptVersion: "codex-web-v1" as const,
    candidates: [
      {
        type: "company" as const,
        name: "India Public Company",
        canonicalUrl: "https://india-public-company.example.com",
        websiteUrl: "https://india-public-company.example.com",
        discoveredDescription:
          "An India-based technology company supported by public evidence.",
        category: "technology",
        geography: "India",
        sourceName: "codex_web",
        sourceUrl: "https://source.example.com/india-public-company",
        discoveryScore: 82,
        rawMetadata: { evidence: "Public company page" },
      },
    ],
    sourceErrors: [],
  };
}

function writeBatch(batch: unknown): string {
  const file = join(createTemporaryDirectory(), "batch.json");
  writeFileSync(file, JSON.stringify(batch), "utf8");
  return file;
}

function writeMalformedBatch(contents: string): string {
  const file = join(createTemporaryDirectory(), "batch.json");
  writeFileSync(file, contents, "utf8");
  return file;
}

type CapturedRequest = {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
};

async function startApiServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
    body: string,
  ) => void | Promise<void>,
) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    await handler(request, response, Buffer.concat(chunks).toString("utf8"));
  });
  apiServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function jsonResponse(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function closeApiServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
  });
}

afterEach(async () => {
  await Promise.all(apiServers.splice(0).map(closeApiServer));
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("discovery worker CLI", () => {
  it("accepts a valid batch with the authoritative discovery schema", async () => {
    const file = writeBatch(validBatch());

    const result = await runWorker(["validate", "--file", file]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "validate",
      runId: validBatch().runId,
      candidateCount: 1,
      sourceErrorCount: 0,
    });
    expect(result.stderr).toBe("");
  });

  it("rejects a candidate with a non-public URL without echoing the URL", async () => {
    const batch = validBatch();
    batch.candidates[0].sourceUrl = "http://127.0.0.1/private-evidence";
    const file = writeBatch(batch);

    const result = await runWorker(["validate", "--file", file]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery batch failed validation.",
      issues: [
        {
          path: "candidates.0.sourceUrl",
          message: "Discovery URL must use a public host.",
        },
      ],
    });
    expect(result.stderr).not.toContain("127.0.0.1");
  });

  it("rejects an unsupported candidate type", async () => {
    const batch = validBatch();
    (batch.candidates[0] as { type: string }).type = "partner";

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      issues: [{ path: "candidates.0.type" }],
    });
    expect(result.stderr).not.toContain('"partner"');
  });

  it("rejects a discovery score outside the zero-to-one-hundred range", async () => {
    const batch = validBatch();
    batch.candidates[0].discoveryScore = 101;

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      issues: [
        {
          path: "candidates.0.discoveryScore",
          message: "Discovery score must be an integer from 0 to 100.",
        },
      ],
    });
  });

  it("rejects an article-only canonical identity", async () => {
    const batch = validBatch();
    batch.candidates[0].canonicalUrl =
      "https://news.example.com/2026/07/22/company-launches";

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      issues: [
        {
          path: "candidates.0.canonicalUrl",
          message: "Canonical URL must identify a stable public profile.",
        },
      ],
    });
  });

  it("rejects raw metadata deeper than three JSON levels", async () => {
    const batch = validBatch();
    (batch.candidates[0] as { rawMetadata: Record<string, unknown> }).rawMetadata =
      { levelTwo: { levelThree: { levelFour: { tooDeep: true } } } };

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      issues: [
        {
          path: "candidates.0.rawMetadata",
          message: "Candidate raw metadata must have JSON depth at most 3.",
        },
      ],
    });
  });

  it("rejects raw metadata with more than twenty total keys", async () => {
    const batch = validBatch();
    (batch.candidates[0] as { rawMetadata: Record<string, unknown> }).rawMetadata =
      Object.fromEntries(
        Array.from({ length: 21 }, (_, index) => [`key${index}`, index]),
      );

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      issues: [
        {
          path: "candidates.0.rawMetadata",
          message: "Candidate raw metadata must contain at most 20 keys.",
        },
      ],
    });
  });

  it("rejects raw metadata larger than 8192 serialized bytes", async () => {
    const batch = validBatch();
    (batch.candidates[0] as { rawMetadata: Record<string, unknown> }).rawMetadata =
      { evidence: "x".repeat(8_192) };

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      issues: [
        {
          path: "candidates.0.rawMetadata",
          message: "Candidate raw metadata must be at most 8192 bytes.",
        },
      ],
    });
  });

  it("rejects more than fifty candidates", async () => {
    const batch = validBatch();
    batch.candidates = Array.from({ length: 51 }, () => ({
      ...batch.candidates[0],
    }));

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      issues: [
        {
          path: "candidates",
          message: "Discovery batch must contain at most 50 candidates.",
        },
      ],
    });
  });

  it("rejects more than twenty source errors", async () => {
    const batch = validBatch();
    (
      batch as {
        sourceErrors: Array<{ sourceName: string; message: string }>;
      }
    ).sourceErrors = Array.from({ length: 21 }, (_, index) => ({
      sourceName: `source-${index}`,
      message: "Public source was unavailable.",
    }));

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      issues: [
        {
          path: "sourceErrors",
          message: "Discovery batch must contain at most 20 source errors.",
        },
      ],
    });
  });

  it("rejects a serialized batch file larger than 512 KiB", async () => {
    const batch = validBatch();
    batch.candidates[0].canonicalUrl =
      `https://india-public-company.example.com/${"x".repeat(524_288)}`;

    const result = await runWorker([
      "validate",
      "--file",
      writeBatch(batch),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery batch file must be at most 524288 bytes.",
    });
  });

  it("rejects a batch file over 512 KiB even when excess bytes are whitespace", async () => {
    const batch = validBatch();
    const paddedContents = `${JSON.stringify(batch)}${" ".repeat(524_288)}`;

    const result = await runWorker([
      "validate",
      "--file",
      writeMalformedBatch(paddedContents),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery batch file must be at most 524288 bytes.",
    });
  });

  it("rejects malformed JSON without echoing rejected contents", async () => {
    const rejectedContents = '{"leaseToken":"never-print-this"';

    const result = await runWorker([
      "validate",
      "--file",
      writeMalformedBatch(rejectedContents),
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery JSON file is not valid JSON.",
    });
    expect(result.stderr).not.toContain("never-print-this");
  });

  it("claims scheduled work and stores the lease in a private temporary file", async () => {
    const workerSecret = "scheduled-worker-secret-never-print";
    const leaseToken = "scheduled-lease-token-never-print";
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, {
        ok: true,
        claimed: true,
        runId: validBatch().runId,
        leaseToken,
        promptVersion: "codex-web-v1",
        config: {
          geographies: ["India"],
          totalCandidates: 20,
          allocation: { companies: 10, creators: 10 },
        },
        outputSchema: { type: "object" },
      });
    });

    const result = await runWorker(["claim"], {
      DISCOVERY_API_BASE_URL: apiBaseUrl,
      DISCOVERY_WORKER_SECRET: workerSecret,
    });

    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([
      {
        method: "POST",
        url: "/api/discovery/worker/claim",
        authorization: `Bearer ${workerSecret}`,
        contentType: "application/json",
        body: "{}",
      },
    ]);
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(output).toMatchObject({
      ok: true,
      command: "claim",
      claimed: true,
      runId: validBatch().runId,
      promptVersion: "codex-web-v1",
      config: {
        geographies: ["India"],
        totalCandidates: 20,
        allocation: { companies: 10, creators: 10 },
      },
      outputSchema: { type: "object" },
    });
    expect(output).not.toHaveProperty("leaseToken");
    expect(typeof output.claimFile).toBe("string");
    const claimFile = String(output.claimFile);
    temporaryDirectories.push(dirname(claimFile));
    expect(JSON.parse(readFileSync(claimFile, "utf8"))).toMatchObject({
      runId: validBatch().runId,
      leaseToken,
    });
    expect(statSync(claimFile).mode & 0o777).toBe(0o600);
    expect(`${result.stdout}${result.stderr}`).not.toContain(workerSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(leaseToken);
  });

  it("requests an explicit trial claim", async () => {
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, { ok: true, claimed: false });
    });

    const result = await runWorker(["claim", "--trigger", "trial"], {
      DISCOVERY_API_BASE_URL: apiBaseUrl,
      DISCOVERY_WORKER_SECRET: "trial-worker-secret",
    });

    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "/api/discovery/worker/claim",
      authorization: "Bearer trial-worker-secret",
      contentType: "application/json",
      body: '{"trigger":"trial"}',
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "claim",
      claimed: false,
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      "trial-worker-secret",
    );
  });

  it("submits the validated batch without changing its JSON bytes", async () => {
    const batch = validBatch();
    const batchContents = `${JSON.stringify(batch, null, 2)}\n`;
    const batchFile = writeMalformedBatch(batchContents);
    const workerSecret = "submit-worker-secret-never-print";
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, {
        ok: true,
        outcome: "completed",
        run: {
          id: batch.runId,
          trigger: "trial",
          status: "succeeded",
          completedAt: "2026-07-22T06:00:00.000Z",
          requestedCount: 20,
          foundCount: 1,
          newCount: 1,
          duplicateCount: 0,
          errorSummary: { privateServerDetail: batch.leaseToken },
        },
      });
    });

    const result = await runWorker(
      [
        "submit",
        "--run-id",
        batch.runId,
        "--lease-token",
        batch.leaseToken,
        "--file",
        batchFile,
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: workerSecret,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([
      {
        method: "POST",
        url: `/api/discovery/worker/runs/${batch.runId}/complete`,
        authorization: `Bearer ${workerSecret}`,
        contentType: "application/json",
        body: batchContents,
      },
    ]);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "submit",
      outcome: "completed",
      run: {
        id: batch.runId,
        trigger: "trial",
        status: "succeeded",
        completedAt: "2026-07-22T06:00:00.000Z",
        requestedCount: 20,
        foundCount: 1,
        newCount: 1,
        duplicateCount: 0,
      },
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(workerSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(batch.leaseToken);
  });

  it("submits with credentials read from the private claim file", async () => {
    const batch = validBatch();
    const claimFile = join(createTemporaryDirectory(), "claim.json");
    writeFileSync(
      claimFile,
      JSON.stringify({
        ok: true,
        claimed: true,
        runId: batch.runId,
        leaseToken: batch.leaseToken,
        promptVersion: batch.promptVersion,
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, {
        ok: true,
        outcome: "completed",
        run: { id: batch.runId, status: "succeeded" },
      });
    });

    const result = await runWorker(
      [
        "submit",
        "--claim-file",
        claimFile,
        "--file",
        writeBatch(batch),
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: "claim-file-worker-secret",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(requests[0]?.url).toBe(
      `/api/discovery/worker/runs/${batch.runId}/complete`,
    );
    expect(JSON.parse(requests[0]?.body ?? "null")).toEqual(batch);
    expect(`${result.stdout}${result.stderr}`).not.toContain(batch.leaseToken);
  });

  it("rejects a successful submit response with an unsupported outcome", async () => {
    const batch = validBatch();
    const apiBaseUrl = await startApiServer((_request, response) => {
      jsonResponse(response, 200, {
        ok: true,
        outcome: "teleported",
        run: { id: batch.runId, status: "succeeded" },
      });
    });

    const result = await runWorker(
      [
        "submit",
        "--run-id",
        batch.runId,
        "--lease-token",
        batch.leaseToken,
        "--file",
        writeBatch(batch),
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: "malformed-response-secret",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery API returned an invalid response for submit.",
    });
  });

  it("rejects a successful submit response for a different run", async () => {
    const batch = validBatch();
    const apiBaseUrl = await startApiServer((_request, response) => {
      jsonResponse(response, 200, {
        ok: true,
        outcome: "completed",
        run: {
          id: "00000000-0000-4000-8000-000000000999",
          status: "succeeded",
        },
      });
    });

    const result = await runWorker(
      [
        "submit",
        "--run-id",
        batch.runId,
        "--lease-token",
        batch.leaseToken,
        "--file",
        writeBatch(batch),
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: "wrong-run-response-secret",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery API returned an invalid response for submit.",
    });
  });

  it("rejects a successful submit response with a non-terminal run status", async () => {
    const batch = validBatch();
    const apiBaseUrl = await startApiServer((_request, response) => {
      jsonResponse(response, 200, {
        ok: true,
        outcome: "completed",
        run: { id: batch.runId, status: "running" },
      });
    });

    const result = await runWorker(
      [
        "submit",
        "--run-id",
        batch.runId,
        "--lease-token",
        batch.leaseToken,
        "--file",
        writeBatch(batch),
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: "non-terminal-response-secret",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery API returned an invalid response for submit.",
    });
  });

  it("reports a claimed run failure without logging the lease or message", async () => {
    const batch = validBatch();
    const workerSecret = "fail-worker-secret-never-print";
    const failureMessage = "source failed with rejected-payload-never-print";
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, {
        ok: true,
        outcome: "failed",
        run: {
          id: batch.runId,
          trigger: "trial",
          status: "failed",
          completedAt: "2026-07-22T06:05:00.000Z",
          requestedCount: 20,
          foundCount: 0,
          newCount: 0,
          duplicateCount: 0,
          errorSummary: { message: failureMessage },
        },
      });
    });

    const result = await runWorker(
      [
        "fail",
        "--run-id",
        batch.runId,
        "--lease-token",
        batch.leaseToken,
        "--message",
        failureMessage,
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: workerSecret,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([
      {
        method: "POST",
        url: `/api/discovery/worker/runs/${batch.runId}/fail`,
        authorization: `Bearer ${workerSecret}`,
        contentType: "application/json",
        body: JSON.stringify({
          runId: batch.runId,
          leaseToken: batch.leaseToken,
          message: failureMessage,
        }),
      },
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "fail",
      outcome: "failed",
      run: { id: batch.runId, status: "failed" },
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(workerSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(batch.leaseToken);
    expect(`${result.stdout}${result.stderr}`).not.toContain(failureMessage);
  });

  it("reports failure with credentials read from the private claim file", async () => {
    const batch = validBatch();
    const claimFile = join(createTemporaryDirectory(), "claim.json");
    writeFileSync(
      claimFile,
      JSON.stringify({
        ok: true,
        claimed: true,
        runId: batch.runId,
        leaseToken: batch.leaseToken,
        promptVersion: batch.promptVersion,
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, {
        ok: true,
        outcome: "failed",
        run: { id: batch.runId, status: "failed" },
      });
    });

    const result = await runWorker(
      [
        "fail",
        "--claim-file",
        claimFile,
        "--message",
        "No valid public evidence was available.",
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: "claim-file-fail-secret",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(requests[0]?.body ?? "null")).toEqual({
      runId: batch.runId,
      leaseToken: batch.leaseToken,
      message: "No valid public evidence was available.",
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(batch.leaseToken);
  });

  it("abandons an orphaned run without logging the recovery message", async () => {
    const batch = validBatch();
    const workerSecret = "abandon-worker-secret-never-print";
    const recoveryMessage = "lost lease after confirmed submit failure";
    const requests: CapturedRequest[] = [];
    const apiBaseUrl = await startApiServer((request, response, body) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      });
      jsonResponse(response, 200, {
        ok: true,
        outcome: "failed",
        run: { id: batch.runId, status: "failed" },
      });
    });

    const result = await runWorker(
      [
        "abandon",
        "--run-id",
        batch.runId,
        "--message",
        recoveryMessage,
      ],
      {
        DISCOVERY_API_BASE_URL: apiBaseUrl,
        DISCOVERY_WORKER_SECRET: workerSecret,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([
      {
        method: "POST",
        url: `/api/discovery/worker/runs/${batch.runId}/abandon`,
        authorization: `Bearer ${workerSecret}`,
        contentType: "application/json",
        body: JSON.stringify({ runId: batch.runId, message: recoveryMessage }),
      },
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "abandon",
      outcome: "failed",
      run: { id: batch.runId, status: "failed" },
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(workerSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(recoveryMessage);
  });

  it("fails non-zero on a non-2xx API response without logging its body", async () => {
    const workerSecret = "rejected-worker-secret-never-print";
    const rejectedBodySecret = "rejected-server-body-never-print";
    const apiBaseUrl = await startApiServer((_request, response) => {
      jsonResponse(response, 503, {
        ok: false,
        error: `Upstream failed with ${workerSecret} ${rejectedBodySecret}`,
      });
    });

    const result = await runWorker(["claim"], {
      DISCOVERY_API_BASE_URL: apiBaseUrl,
      DISCOVERY_WORKER_SECRET: workerSecret,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "The discovery API rejected claim with HTTP 503.",
    });
    expect(result.stderr).not.toContain(workerSecret);
    expect(result.stderr).not.toContain(rejectedBodySecret);
  });

  it("fails before the network when the API base URL is missing", async () => {
    const result = await runWorker(["claim"], {
      DISCOVERY_API_BASE_URL: "",
      DISCOVERY_WORKER_SECRET: "configured-worker-secret",
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "DISCOVERY_API_BASE_URL is required for network commands.",
    });
  });

  it("fails before the network when the worker secret is missing", async () => {
    const result = await runWorker(["claim"], {
      DISCOVERY_API_BASE_URL: "https://mewtuals.example.com",
      DISCOVERY_WORKER_SECRET: "",
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: "DISCOVERY_WORKER_SECRET is required for network commands.",
    });
  });
});
