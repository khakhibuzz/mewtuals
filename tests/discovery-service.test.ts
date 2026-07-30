import { describe, expect, it, vi } from "vitest";

import type { DiscoveryRepository } from "../db/repositories/discovery-repository";
import {
  createDiscoveryService,
  discoveryOutputSchema,
  discoveryV1OutputSchema,
  discoveryV2OutputSchema,
} from "../app/server/discovery-service";
import {
  hashDiscoveryToken,
  verifyDiscoveryBearer,
} from "../app/server/discovery-worker-auth";

function createRepositoryDouble(): DiscoveryRepository {
  return {
    queueRun: vi.fn(),
    claimRun: vi.fn(),
    getRun: vi.fn(async (runId: string) => ({
      id: runId,
      requestedCount: 20,
    }) as never),
    completeRun: vi.fn(),
    failRun: vi.fn(),
    abandonRun: vi.fn(),
    updateCandidateStatus: vi.fn(),
    getCandidateResearchVersions: vi.fn(),
    getAdminSummary: vi.fn(),
  };
}

function companyCandidate(index: number) {
  return {
    type: "company" as const,
    name: `Company ${index}`,
    canonicalUrl: `https://company-${index}.example.com`,
    websiteUrl: `https://company-${index}.example.com`,
    discoveredDescription: "A public technology company.",
    category: "technology",
    geography: "India",
    sourceName: "codex_web",
    sourceUrl: `https://source.example.com/company-${index}`,
    discoveryScore: 80,
    rawMetadata: {},
  };
}

function creatorCandidate(index: number) {
  return {
    type: "creator" as const,
    name: `Creator ${index}`,
    canonicalUrl: `https://youtube.com/@creator${index}`,
    primarySocialUrl: `https://youtube.com/@creator${index}`,
    discoveredDescription: "A public technology creator.",
    category: "technology",
    geography: "India",
    sourceName: "codex_web",
    sourceUrl: `https://youtube.com/@creator${index}/about`,
    discoveryScore: 75,
    rawMetadata: {},
  };
}

function physicalAiCandidate(index: number) {
  return {
    ...companyCandidate(index),
    category: "components and actuation",
    research: {
      summary:
        "An Indian robotics participant connecting dependable components to complete robot behaviour.",
      findings:
        "1. Domain and category\n" +
        "Evidence-backed physical-AI systems finding [S1].\n".repeat(30),
      sourceUrls: [`https://evidence-${index}.example.com/company`],
      analysisVersion: "physical-ai-v1" as const,
    },
  };
}

describe("discovery service", () => {
  it("derives a strict worker output contract and communicates custom bounds", () => {
    expect(discoveryOutputSchema).toMatchObject({
      additionalProperties: false,
      description: expect.stringContaining("1048576 bytes"),
      required: [
        "runId",
        "leaseToken",
        "sourceErrors",
        "promptVersion",
        "candidates",
      ],
      properties: {
        candidates: {
          maxItems: 50,
          items: {
            additionalProperties: false,
            required: [
              "type",
              "name",
              "canonicalUrl",
              "discoveredDescription",
              "category",
              "geography",
              "sourceName",
              "sourceUrl",
              "discoveryScore",
              "research",
            ],
            properties: {
              canonicalUrl: {
                description: expect.stringMatching(/public HTTP\(S\).*stable.*article/i),
              },
              discoveryScore: {
                type: "integer",
                minimum: 0,
                maximum: 100,
              },
              rawMetadata: {
                maxProperties: 20,
                propertyNames: { maxLength: 64 },
                description: expect.stringMatching(
                  /depth 3.*20 total keys.*64 characters.*8192 bytes/i,
                ),
              },
              research: {
                required: [
                  "summary",
                  "findings",
                  "sourceUrls",
                  "analysisVersion",
                ],
              },
            },
          },
        },
        sourceErrors: {
          maxItems: 20,
          items: { additionalProperties: false },
        },
      },
    });
    expect(discoveryV1OutputSchema).not.toEqual(discoveryV2OutputSchema);
  });

  it("authenticates exact worker bearer tokens without storing the raw token", () => {
    expect(verifyDiscoveryBearer("Bearer worker-secret", "worker-secret")).toBe(
      true,
    );
    expect(verifyDiscoveryBearer("Bearer wrong-secret", "worker-secret")).toBe(
      false,
    );
    expect(verifyDiscoveryBearer("Basic worker-secret", "worker-secret")).toBe(
      false,
    );
    expect(hashDiscoveryToken("worker-secret", "lease-token")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(hashDiscoveryToken("worker-secret", "lease-token")).not.toContain(
      "lease-token",
    );
  });

  it("exposes worker authentication through the composed service boundary", () => {
    const service = createDiscoveryService({
      repository: createRepositoryDouble(),
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    expect(service.authenticateWorker("Bearer worker-secret")).toBe(true);
    expect(service.authenticateWorker("Bearer wrong-secret")).toBe(false);
  });

  it("allows only configured administrators to queue a manual run", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
      token: () => "opaque-token",
    });

    const denied = await service.queueManualRun({
      userId: "member",
      email: "member@example.com",
    });

    expect(denied).toEqual({
      ok: false,
      status: 403,
      error: "Administrator access is required.",
    });
    expect(repository.queueRun).not.toHaveBeenCalled();
  });

  it("queues an administrator manual run with the configured allocation", async () => {
    const repository = createRepositoryDouble();
    const queuedRun = {
      id: "00000000-0000-4000-8000-000000000001",
      leaseTokenHash: null,
      submissionHash: null,
      leaseExpiresAt: null,
    };
    vi.mocked(repository.queueRun).mockResolvedValue(queuedRun as never);
    const now = new Date("2026-07-22T03:00:00.000Z");
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => now,
      token: () => "opaque-token",
    });

    const result = await service.queueManualRun({
      userId: "admin",
      email: "ADMIN@example.com",
    });

    expect(repository.queueRun).toHaveBeenCalledWith({
      externalRunKey: "discovery:manual:general_discovery:opaque-token",
      campaignKey: "general_discovery",
      trigger: "manual",
      now,
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
      requestedByEmail: "admin@example.com",
    });
    expect(result).toMatchObject({ ok: true, run: { id: queuedRun.id } });
    expect(JSON.stringify(result)).not.toMatch(
      /leaseTokenHash|submissionHash|leaseExpiresAt/,
    );
  });

  it("queues an idempotent India-local daily run and claims it for two hours", async () => {
    const repository = createRepositoryDouble();
    const now = new Date("2026-07-21T20:00:00.000Z");
    const claimedRun = {
      id: "00000000-0000-4000-8000-000000000002",
      geography: "India",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    };
    vi.mocked(repository.claimRun).mockResolvedValue(claimedRun as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => now,
      token: () => "lease-token",
    });

    const result = await service.claimRun("scheduled");

    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(repository.claimRun).toHaveBeenLastCalledWith({
      now,
      leaseTokenHash: hashDiscoveryToken("worker-secret", "lease-token"),
      leaseExpiresAt: new Date("2026-07-21T22:00:00.000Z"),
      triggers: ["manual"],
      fallbackExternalRunKey:
        "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
      queueIfMissing: {
        externalRunKey: "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
        campaignKey: "general_discovery",
        trigger: "scheduled",
        now,
        geography: "India",
        candidateType: "both",
        sourcesUsed: ["codex_web"],
        requestedCount: 20,
        companyPercentage: 50,
        requestedByEmail: null,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      claimed: true,
      runId: claimedRun.id,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      config: {
        totalCandidates: 20,
        allocation: { companies: 10, creators: 10 },
      },
    });
    expect(JSON.stringify(result)).not.toContain(
      hashDiscoveryToken("worker-secret", "lease-token"),
    );
  });

  it("claims the oldest queued manual run before creating a scheduled daily run", async () => {
    const repository = createRepositoryDouble();
    const manual = {
      id: "00000000-0000-4000-8000-000000000020",
      trigger: "manual",
      geography: "Bengaluru",
      sourcesUsed: ["persisted_source"],
      requestedCount: 7,
      companyPercentage: 40,
    };
    vi.mocked(repository.claimRun).mockResolvedValueOnce(manual as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["current-config-geography"],
        companyCategories: ["technology"],
        creatorCategories: ["lifestyle"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["current_source"],
        workerApiBaseUrl: "https://mewtuals.com",
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
      token: () => "manual-lease",
    });

    const result = await service.claimRun("scheduled");

    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        triggers: ["manual"],
        fallbackExternalRunKey:
          "discovery:scheduled:general_discovery:2026-07-22:current-config-geography:both:20:50",
        queueIfMissing: expect.objectContaining({
          externalRunKey:
            "discovery:scheduled:general_discovery:2026-07-22:current-config-geography:both:20:50",
          trigger: "scheduled",
        }),
      }),
    );
    expect(result).toMatchObject({
      claimed: true,
      runId: manual.id,
      config: {
        campaignKey: "general_discovery",
        geographies: ["Bengaluru"],
        enabledSources: ["persisted_source"],
        totalCandidates: 7,
        companyPercentage: 40,
        allocation: { companies: 3, creators: 4 },
        companyCategories: ["technology"],
        creatorCategories: ["lifestyle"],
        workerApiBaseUrl: "https://mewtuals.com",
      },
    });
  });

  it("makes one atomic manual-or-daily claim decision after queueing the fallback", async () => {
    const repository = createRepositoryDouble();
    const manual = {
      id: "00000000-0000-4000-8000-000000000038",
      trigger: "manual",
      geography: "India",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    };
    vi.mocked(repository.claimRun).mockImplementation(async (input) =>
      "fallbackExternalRunKey" in input ? (manual as never) : null,
    );
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
      token: () => "lease-token",
    });

    const result = await service.claimRun("scheduled");

    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(repository.claimRun).toHaveBeenCalledTimes(1);
    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        triggers: ["manual"],
        fallbackExternalRunKey:
          "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
        queueIfMissing: expect.objectContaining({
          externalRunKey: "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
          trigger: "scheduled",
        }),
      }),
    );
    expect(result).toMatchObject({ claimed: true, runId: manual.id });
  });

  it("reuses the same daily external key across repeated scheduled claims", async () => {
    const repository = createRepositoryDouble();
    const daily = {
      id: "00000000-0000-4000-8000-000000000023",
      externalRunKey: "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
      geography: "India",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    };
    vi.mocked(repository.claimRun)
      .mockResolvedValueOnce(daily as never)
      .mockResolvedValueOnce(null);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
      token: () => "lease-token",
    });

    const first = await service.claimRun("scheduled");
    const replay = await service.claimRun("scheduled");

    expect(first).toMatchObject({ claimed: true, runId: daily.id });
    expect(replay).toEqual({ ok: true, claimed: false });
    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(
      vi.mocked(repository.claimRun).mock.calls.map(
        ([input]) => input.queueIfMissing?.externalRunKey,
      ),
    ).toEqual([daily.externalRunKey, daily.externalRunKey]);
    expect(repository.claimRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        triggers: ["manual"],
        fallbackExternalRunKey: daily.externalRunKey,
        queueIfMissing: expect.objectContaining({
          externalRunKey: daily.externalRunKey,
          trigger: "scheduled",
        }),
      }),
    );
  });

  it("creates a unique trial run before claiming work", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.claimRun).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000003",
    } as never);
    const tokens = ["trial-key", "trial-lease"];
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
      token: () => tokens.shift()!,
    });

    const result = await service.claimRun("trial");

    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRunKey: "discovery:trial:general_discovery:trial-key",
        queueIfMissing: expect.objectContaining({
          externalRunKey: "discovery:trial:general_discovery:trial-key",
          trigger: "trial",
        }),
      }),
    );
    expect(result).toMatchObject({
      claimed: true,
      leaseToken: "trial-lease",
    });
  });

  it("validates and completes a leased discovery batch with hashed secrets", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "completed",
      run: { status: "partial" },
    } as never);
    const now = new Date("2026-07-22T03:00:00.000Z");
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => now,
    });
    const runId = "00000000-0000-4000-8000-000000000004";
    const body = {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [
        {
          type: "company",
          name: "Acme India",
          canonicalUrl: "https://acme.example.com",
          websiteUrl: "https://acme.example.com",
          discoveredDescription: "A public technology company.",
          category: "technology",
          geography: "India",
          sourceName: "codex_web",
          sourceUrl: "https://source.example.com/acme",
          discoveryScore: 80,
          rawMetadata: {},
        },
      ],
      sourceErrors: [
        { sourceName: "directory", message: "Directory was unavailable." },
      ],
    };

    const result = await service.completeRun(runId, body);

    expect(repository.completeRun).toHaveBeenCalledWith({
      runId,
      leaseTokenHash: hashDiscoveryToken("worker-secret", "lease-token"),
      submissionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      now,
      candidates: body.candidates,
      sourceErrors: body.sourceErrors,
    });
    expect(result).toMatchObject({
      ok: true,
      outcome: "completed",
      run: { status: "partial" },
    });
    expect(JSON.stringify(result)).not.toContain("lease-token");
  });

  it("enforces the persisted run allocation when current configuration drifts", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.getRun).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000021",
      requestedCount: 1,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const runId = "00000000-0000-4000-8000-000000000021";
    const candidate = {
      type: "company" as const,
      name: "Persisted Allocation Candidate",
      canonicalUrl: "https://persisted-allocation.example.com",
      websiteUrl: "https://persisted-allocation.example.com",
      discoveredDescription: "A public technology company.",
      category: "technology",
      geography: "India",
      sourceName: "codex_web",
      sourceUrl: "https://source.example.com/persisted-allocation",
      discoveryScore: 80,
      rawMetadata: {},
    };

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [
        candidate,
        {
          ...candidate,
          name: "Second Candidate",
          canonicalUrl: "https://second-persisted.example.com",
          websiteUrl: "https://second-persisted.example.com",
        },
      ],
      sourceErrors: [],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Discovery batch exceeds the claimed candidate allocation.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("rejects twenty companies from a persisted ten-company ten-creator run", async () => {
    const repository = createRepositoryDouble();
    const runId = "00000000-0000-4000-8000-000000000035";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      candidateType: "both",
      requestedCount: 20,
      companyPercentage: 50,
    } as never);
    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "completed",
      run: { id: runId, status: "succeeded" },
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: Array.from({ length: 20 }, (_, index) =>
        companyCandidate(index),
      ),
      sourceErrors: [],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Discovery batch exceeds the claimed company allocation.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("rejects a creator from a persisted company-only run", async () => {
    const repository = createRepositoryDouble();
    const runId = "00000000-0000-4000-8000-000000000036";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      candidateType: "company",
      requestedCount: 20,
      companyPercentage: 100,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [creatorCandidate(1)],
      sourceErrors: [],
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Discovery batch contains creators outside the claimed company run.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("allows honest per-type underfill within a persisted split allocation", async () => {
    const repository = createRepositoryDouble();
    const runId = "00000000-0000-4000-8000-000000000037";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      candidateType: "both",
      requestedCount: 20,
      companyPercentage: 50,
    } as never);
    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "completed",
      run: { id: runId, status: "succeeded", foundCount: 7 },
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [
        ...Array.from({ length: 3 }, (_, index) => companyCandidate(index)),
        ...Array.from({ length: 4 }, (_, index) => creatorCandidate(index)),
      ],
      sourceErrors: [],
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: "completed",
      run: { foundCount: 7 },
    });
    expect(repository.completeRun).toHaveBeenCalledOnce();
  });

  it("fails a leased run with a bounded worker message and hashed lease", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.failRun).mockResolvedValue({
      outcome: "failed",
      run: { status: "failed" },
    } as never);
    const now = new Date("2026-07-22T03:00:00.000Z");
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => now,
    });
    const runId = "00000000-0000-4000-8000-000000000005";

    const result = await service.failRun(runId, {
      runId,
      leaseToken: "lease-token",
      message: "  Public search could not complete.  ",
    });

    expect(repository.failRun).toHaveBeenCalledWith({
      runId,
      leaseTokenHash: hashDiscoveryToken("worker-secret", "lease-token"),
      now,
      message: "Public search could not complete.",
    });
    expect(result).toMatchObject({ ok: true, outcome: "failed" });
    expect(JSON.stringify(result)).not.toContain("lease-token");
  });

  it("abandons an orphaned run without requiring its lost lease", async () => {
    const repository = createRepositoryDouble() as DiscoveryRepository & {
      abandonRun: ReturnType<typeof vi.fn>;
    };
    repository.abandonRun = vi.fn().mockResolvedValue({
      outcome: "failed",
      run: { status: "failed" },
    });
    const now = new Date("2026-07-22T03:30:00.000Z");
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => now,
    });
    const runId = "00000000-0000-4000-8000-000000000045";

    const result = await service.abandonRun(runId, {
      runId,
      message: "  Lost lease after a confirmed submit failure.  ",
    });

    expect(repository.abandonRun).toHaveBeenCalledWith({
      runId,
      now,
      message: "Lost lease after a confirmed submit failure.",
    });
    expect(result).toMatchObject({ ok: true, outcome: "failed" });
  });

  it("rejects unknown failure fields instead of hashing a stripped shape", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const runId = "00000000-0000-4000-8000-000000000039";

    const result = await service.failRun(runId, {
      runId,
      leaseToken: "lease-token",
      message: "Search failed.",
      unexpected: "must reject",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "Submit a valid discovery failure.",
    });
    expect(repository.failRun).not.toHaveBeenCalled();
  });

  it("updates candidate status with the administrator expected timestamp", async () => {
    const repository = createRepositoryDouble();
    const expectedUpdatedAt = new Date("2026-07-22T02:00:00.000Z");
    const now = new Date("2026-07-22T03:00:00.000Z");
    const candidate = {
      id: "00000000-0000-4000-8000-000000000006",
      status: "shortlisted",
      updatedAt: now,
    };
    vi.mocked(repository.updateCandidateStatus).mockResolvedValue({
      outcome: "updated",
      candidate,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => now,
    });

    const result = await service.updateCandidateStatus(
      { userId: "admin", email: "admin@example.com" },
      candidate.id,
      {
        status: "shortlisted",
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      },
    );

    expect(repository.updateCandidateStatus).toHaveBeenCalledWith({
      candidateId: candidate.id,
      status: "shortlisted",
      expectedUpdatedAt,
      now,
    });
    expect(result).toEqual({ ok: true, candidate });
  });

  it("rejects invalid administrator discovery filters before repository work", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
    });

    const result = await service.getAdminSummary(
      { userId: "admin", email: "admin@example.com" },
      { type: "partner", page: "101" },
    );

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      error: "Review the discovery filters.",
    });
    expect(repository.getAdminSummary).not.toHaveBeenCalled();
  });

  it("returns an exact replay result without exposing stored hashes", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "replayed",
      run: {
        id: "00000000-0000-4000-8000-000000000007",
        status: "succeeded",
        leaseTokenHash: "stored-lease-hash",
        submissionHash: "stored-submission-hash",
        leaseExpiresAt: new Date("2026-07-22T05:00:00.000Z"),
        foundCount: 1,
        newCount: 1,
        duplicateCount: 0,
      },
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const runId = "00000000-0000-4000-8000-000000000007";

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [],
      sourceErrors: [],
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: "replayed",
      run: { id: runId, status: "succeeded", foundCount: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/leaseTokenHash|submissionHash/);
    expect(JSON.stringify(result)).not.toContain("stored-lease-hash");
  });

  it("rejects unknown replay fields before hashing the validated shape", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const runId = "00000000-0000-4000-8000-000000000043";

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [],
      sourceErrors: [],
      replayHint: "must not be stripped",
    });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(repository.getRun).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("reports no work while the repository has an active leased run", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.claimRun).mockResolvedValue(null);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:30:00.000Z"),
      token: () => "unused-lease",
    });

    const result = await service.claimRun("scheduled");

    expect(result).toEqual({ ok: true, claimed: false });
    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        triggers: ["manual"],
        fallbackExternalRunKey:
          "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
        queueIfMissing: expect.objectContaining({
          externalRunKey:
            "discovery:scheduled:general_discovery:2026-07-22:india:both:20:50",
          trigger: "scheduled",
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("unused-lease");
  });

  it("does not create a trial row while another run has an active lease", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.claimRun).mockResolvedValue(null);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      token: () => "unused-trial-token",
    });

    const result = await service.claimRun("trial");

    expect(result).toEqual({ ok: true, claimed: false });
    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(repository.claimRun).toHaveBeenCalledTimes(1);
    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRunKey: "discovery:trial:general_discovery:unused-trial-token",
        queueIfMissing: expect.objectContaining({
          externalRunKey: "discovery:trial:general_discovery:unused-trial-token",
          trigger: "trial",
        }),
      }),
    );
  });

  it.each(["lease_mismatch", "lease_expired", "submission_mismatch"] as const)(
    "maps %s repository completion conflicts without exposing the run row",
    async (reason) => {
      const repository = createRepositoryDouble();
      vi.mocked(repository.completeRun).mockResolvedValue({
        outcome: "conflict",
        reason,
        run: { leaseTokenHash: "private-hash" },
      } as never);
      const service = createDiscoveryService({
        repository,
        adminEmails: [],
        workerSecret: "worker-secret",
        config: {
          campaignKey: "general_discovery",
          geographies: ["India"],
          companyCategories: ["technology"],
          creatorCategories: ["technology"],
          totalCandidates: 20,
          companyPercentage: 50,
          enabledSources: ["codex_web"],
        },
      });
      const runId = "00000000-0000-4000-8000-000000000014";

      const result = await service.completeRun(runId, {
        runId,
        leaseToken: "lease-token",
        promptVersion: "codex-web-v1",
        candidates: [],
        sourceErrors: [],
      });

      expect(result).toEqual({
        ok: false,
        status: 409,
        error: "Discovery run cannot accept this submission.",
        reason,
      });
      expect(JSON.stringify(result)).not.toContain("private-hash");
    },
  );

  it("returns the latest candidate on a stale administrator status write", async () => {
    const repository = createRepositoryDouble();
    const latest = {
      id: "00000000-0000-4000-8000-000000000015",
      status: "rejected",
    };
    vi.mocked(repository.updateCandidateStatus).mockResolvedValue({
      outcome: "conflict",
      candidate: latest,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    const result = await service.updateCandidateStatus(
      { userId: "admin", email: "admin@example.com" },
      latest.id,
      {
        status: "shortlisted",
        expectedUpdatedAt: "2026-07-22T03:00:00.000Z",
      },
    );

    expect(result).toMatchObject({ ok: false, status: 409, candidate: latest });
  });

  it("parses valid filters and supplies the India-local start of today", async () => {
    const repository = createRepositoryDouble();
    const snapshot = { summary: { totalCompanies: 0 } };
    vi.mocked(repository.getAdminSummary).mockResolvedValue(snapshot as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-22T03:00:00.000Z"),
    });

    const result = await service.getAdminSummary(
      { userId: "admin", email: "admin@example.com" },
      { type: "company", page: "2", pageSize: "10" },
    );

    expect(repository.getAdminSummary).toHaveBeenCalledWith({
      type: "company",
      page: 2,
      pageSize: 10,
      todayStart: new Date("2026-07-21T18:30:00.000Z"),
    });
    expect(result).toEqual({ ok: true, snapshot });
  });

  it("rejects invalid discovery batch fields before reading the run", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const runId = "00000000-0000-4000-8000-000000000024";

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [{ type: "partner", name: "Invalid candidate" }],
      sourceErrors: [],
    });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(repository.getRun).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("accepts a batch exactly at the persisted allocation boundary", async () => {
    const repository = createRepositoryDouble();
    const runId = "00000000-0000-4000-8000-000000000025";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      requestedCount: 1,
    } as never);
    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "completed",
      run: { id: runId, status: "succeeded", foundCount: 1 },
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [
        {
          type: "creator",
          name: "Boundary Creator",
          canonicalUrl: "https://youtube.com/@boundarycreator",
          primarySocialUrl: "https://youtube.com/@boundarycreator",
          discoveredDescription: "A public technology creator.",
          category: "technology",
          geography: "India",
          sourceName: "codex_web",
          sourceUrl: "https://youtube.com/@boundarycreator/about",
          discoveryScore: 75,
          rawMetadata: {},
        },
      ],
      sourceErrors: [],
    });

    expect(result).toMatchObject({ ok: true, run: { foundCount: 1 } });
    expect(repository.completeRun).toHaveBeenCalledOnce();
  });

  it("denies non-admin listing and status changes without repository work", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const member = { userId: "member", email: "member@example.com" };

    await expect(service.getAdminSummary(member)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(
      service.updateCandidateStatus(
        member,
        "00000000-0000-4000-8000-000000000026",
        {
          status: "shortlisted",
          expectedUpdatedAt: "2026-07-22T03:00:00.000Z",
        },
      ),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    expect(repository.getAdminSummary).not.toHaveBeenCalled();
    expect(repository.updateCandidateStatus).not.toHaveBeenCalled();
  });

  it("rejects an unknown candidate status before repository work", async () => {
    const repository = createRepositoryDouble();
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });

    const result = await service.updateCandidateStatus(
      { userId: "admin", email: "admin@example.com" },
      "00000000-0000-4000-8000-000000000027",
      {
        status: "contacted",
        expectedUpdatedAt: "2026-07-22T03:00:00.000Z",
      },
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(repository.updateCandidateStatus).not.toHaveBeenCalled();
  });

  it("returns not found for a valid candidate id missing from persistence", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.updateCandidateStatus).mockResolvedValue({
      outcome: "not_found",
    });
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "general_discovery",
        geographies: ["India"],
        companyCategories: ["technology"],
        creatorCategories: ["technology"],
        totalCandidates: 20,
        companyPercentage: 50,
        enabledSources: ["codex_web"],
      },
    });
    const candidateId = "00000000-0000-4000-8000-000000000031";

    const result = await service.updateCandidateStatus(
      { userId: "admin", email: "admin@example.com" },
      candidateId,
      {
        status: "shortlisted",
        expectedUpdatedAt: "2026-07-22T03:00:00.000Z",
      },
    );

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Discovery candidate was not found.",
    });
    expect(repository.updateCandidateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId, status: "shortlisted" }),
    );
  });

  it("queues and claims the default physical-AI campaign with its V2 contract", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.claimRun).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000050",
      campaignKey: "robotics_hardware_india",
      trigger: "scheduled",
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 75,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "robotics_hardware_india",
        geographies: ["India"],
        companyCategories: ["robot makers and integrators"],
        creatorCategories: ["robotics engineering"],
        totalCandidates: 20,
        companyPercentage: 75,
        enabledSources: ["codex_web"],
      },
      now: () => new Date("2026-07-28T03:00:00.000Z"),
      token: () => "physical-ai-lease",
    });

    const claim = await service.claimRun({ trigger: "scheduled" });

    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackExternalRunKey:
          "discovery:scheduled:robotics_hardware_india:2026-07-28:india:both:20:75",
        queueIfMissing: expect.objectContaining({
          campaignKey: "robotics_hardware_india",
          requestedCount: 20,
          companyPercentage: 75,
        }),
      }),
    );
    expect(claim).toMatchObject({
      claimed: true,
      promptVersion: "codex-web-v2",
      config: {
        campaignKey: "robotics_hardware_india",
        allocation: { companies: 15, creators: 5 },
      },
      outputSchema: discoveryV2OutputSchema,
    });

    vi.mocked(repository.queueRun).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000051",
      campaignKey: "robotics_hardware_india",
    } as never);
    await service.queueManualRun({ userId: "admin", email: "admin@example.com" });
    expect(repository.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignKey: "robotics_hardware_india",
        externalRunKey: expect.stringContaining(
          "discovery:manual:robotics_hardware_india:",
        ),
      }),
    );
  });

  it("claims queued legacy runs with the unchanged general-discovery vocabulary", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.claimRun).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000055",
      campaignKey: "general_discovery",
      trigger: "scheduled",
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "robotics_hardware_india",
        geographies: ["India"],
        companyCategories: ["robot makers and integrators"],
        creatorCategories: ["robotics engineering"],
        totalCandidates: 20,
        companyPercentage: 75,
        enabledSources: ["codex_web"],
      },
    });

    await expect(service.claimRun({ trigger: "scheduled" })).resolves.toMatchObject({
      claimed: true,
      promptVersion: "codex-web-v1",
      config: {
        campaignKey: "general_discovery",
        companyCategories: [
          "startups",
          "consumer brands",
          "AI",
          "technology",
          "creator economy",
          "wellness",
          "fashion",
          "hardware",
          "productivity",
          "fintech",
        ],
        creatorCategories: [
          "technology",
          "startups/business",
          "AI",
          "consumer products",
          "lifestyle",
          "wellness",
          "fashion",
          "finance",
          "podcasts/interviews",
        ],
      },
      outputSchema: discoveryV1OutputSchema,
    });
  });

  it("claims the explicit 50-company robotics seed and rejects invalid preset selectors", async () => {
    const repository = createRepositoryDouble();
    vi.mocked(repository.claimRun).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000052",
      campaignKey: "robotics_hardware_india",
      trigger: "trial",
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 50,
      companyPercentage: 100,
    } as never);
    const tokens = ["seed-key", "seed-lease"];
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "robotics_hardware_india",
        geographies: ["India"],
        companyCategories: ["robot makers and integrators"],
        creatorCategories: ["robotics engineering"],
        totalCandidates: 20,
        companyPercentage: 75,
        enabledSources: ["codex_web"],
      },
      token: () => tokens.shift()!,
    });

    expect(
      await service.claimRun({ trigger: "trial", preset: "robotics-seed" }),
    ).toMatchObject({
      claimed: true,
      promptVersion: "codex-web-v2",
      config: { allocation: { companies: 50, creators: 0 } },
    });
    expect(repository.claimRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRunKey:
          "discovery:trial:robotics_hardware_india:robotics-seed:seed-key",
        queueIfMissing: expect.objectContaining({
          campaignKey: "robotics_hardware_india",
          candidateType: "company",
          requestedCount: 50,
          companyPercentage: 100,
        }),
      }),
    );

    vi.mocked(repository.claimRun).mockClear();
    await expect(
      service.claimRun({
        trigger: "scheduled",
        preset: "robotics-seed",
      }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      service.claimRun({ trigger: "trial", preset: "unknown" } as never),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    expect(repository.claimRun).not.toHaveBeenCalled();
  });

  it("uses the persisted campaign for prompt compatibility and safe duplicate conflicts", async () => {
    const repository = createRepositoryDouble();
    const runId = "00000000-0000-4000-8000-000000000053";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      campaignKey: "robotics_hardware_india",
      candidateType: "company",
      requestedCount: 50,
      companyPercentage: 100,
    } as never);
    const service = createDiscoveryService({
      repository,
      adminEmails: [],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "robotics_hardware_india",
        geographies: ["India"],
        companyCategories: ["robot makers and integrators"],
        creatorCategories: ["robotics engineering"],
        totalCandidates: 20,
        companyPercentage: 75,
        enabledSources: ["codex_web"],
      },
    });

    await expect(
      service.completeRun(runId, {
        runId,
        leaseToken: "lease-token",
        promptVersion: "codex-web-v1",
        candidates: [],
        sourceErrors: [],
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Discovery batch prompt version does not match the claimed run.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();

    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "conflict",
      reason: "duplicate_candidate_in_batch",
      details: { candidateIndexes: [0, 1] },
      run: { id: runId, status: "running" },
    } as never);
    const result = await service.completeRun(runId, {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v2",
      candidates: [physicalAiCandidate(0), physicalAiCandidate(1)],
      sourceErrors: [],
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Discovery run cannot accept this submission.",
      reason: "duplicate_candidate_in_batch",
      details: { candidateIndexes: [0, 1] },
    });
    expect(JSON.stringify(result)).not.toContain("Company 0");
  });

  it("returns authorized research DTOs and distinguishes invalid, missing, and empty history", async () => {
    const repository = createRepositoryDouble();
    const candidateId = "00000000-0000-4000-8000-000000000054";
    const service = createDiscoveryService({
      repository,
      adminEmails: ["admin@example.com"],
      workerSecret: "worker-secret",
      config: {
        campaignKey: "robotics_hardware_india",
        geographies: ["India"],
        companyCategories: ["robot makers and integrators"],
        creatorCategories: ["robotics engineering"],
        totalCandidates: 20,
        companyPercentage: 75,
        enabledSources: ["codex_web"],
      },
    });
    const admin = { userId: "admin", email: "admin@example.com" };
    const member = { userId: "member", email: "member@example.com" };

    await expect(service.getCandidateResearch(member, candidateId)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(service.getCandidateResearch(admin, "invalid")).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    expect(repository.getCandidateResearchVersions).not.toHaveBeenCalled();

    vi.mocked(repository.getCandidateResearchVersions).mockResolvedValueOnce(null);
    await expect(service.getCandidateResearch(admin, candidateId)).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    vi.mocked(repository.getCandidateResearchVersions).mockResolvedValueOnce({
      candidateId,
      latest: null,
      history: [],
    });
    await expect(service.getCandidateResearch(admin, candidateId)).resolves.toEqual({
      ok: true,
      research: { candidateId, latest: null, history: [] },
    });

    const latest = {
      id: "00000000-0000-4000-8000-000000000055",
      candidateId,
      discoveryRunId: "00000000-0000-4000-8000-000000000056",
      summary: physicalAiCandidate(0).research.summary,
      findings: physicalAiCandidate(0).research.findings,
      sourceUrls: physicalAiCandidate(0).research.sourceUrls,
      analysisVersion: "physical-ai-v1",
      createdAt: new Date("2026-07-28T06:00:00.000Z"),
    };
    vi.mocked(repository.getCandidateResearchVersions).mockResolvedValueOnce({
      candidateId,
      latest,
      history: [],
    });
    await expect(service.getCandidateResearch(admin, candidateId)).resolves.toMatchObject({
      ok: true,
      research: {
        latest: { createdAt: "2026-07-28T06:00:00.000Z" },
      },
    });
    expect(repository.getCandidateResearchVersions).toHaveBeenLastCalledWith(
      candidateId,
      25,
    );
  });
});
