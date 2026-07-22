import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  candidateIdentifierForProfileUrl,
  type CandidateIdentifier,
} from "../app/domain/discovery";
import { createOpportunityBriefService } from "../app/server/opportunity-brief-service";
import type {
  SubmitRepositoryInput,
} from "../app/server/opportunity-brief-service";
import { closeDb, getDb, type MewtualsDatabase } from "../db/client";
import { createOpportunityBriefRepository } from "../db/repositories/opportunity-brief-repository";
import * as databaseSchema from "../db/schema";
import {
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  opportunityBriefRequests,
  opportunityBriefSubmissionAttempts,
} from "../db/schema";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

const database = getDb();
const repository = createOpportunityBriefRepository(database);
const testId = randomUUID();
const compactTestId = testId.replaceAll("-", "");
const testProfilePattern = `%${compactTestId}%`;
const testGeography = `Opportunity Brief acceptance ${testId}`;
const testAdminEmail = `opportunity-brief-${testId}@example.test`;
const baseTime = new Date("2026-07-22T06:30:00.000Z");

type IndependentDatabase = {
  client: Sql;
  database: MewtualsDatabase;
};

function profileUrl(suffix: string): string {
  return `https://profile-${compactTestId}.example/${suffix}`;
}

function submissionInput(
  suffix: string,
  overrides: Partial<SubmitRepositoryInput> = {},
): SubmitRepositoryInput {
  const normalizedProfileUrl = profileUrl(suffix);
  return {
    participantType: "company",
    profileUrl: normalizedProfileUrl,
    email: `founder-${suffix}@example.test`,
    phoneNumber: null,
    openToText: "Distribution and co-marketing partnerships",
    source: `source-${suffix}`,
    utm: { source: "acceptance", campaign: suffix },
    requesterHash: `requester-${testId}-${suffix}`,
    submittedAt: baseTime,
    candidateIdentifier: candidateIdentifierForProfileUrl(normalizedProfileUrl),
    ...overrides,
  };
}

function createIndependentDatabase(label: string): IndependentDatabase {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connection: { application_name: `opportunity-brief-${label}` },
  });
  return {
    client,
    database: drizzle(client, { schema: databaseSchema }),
  };
}

async function closeIndependentDatabases(
  connections: readonly IndependentDatabase[],
) {
  await Promise.all(
    connections.map(({ client }) => client.end({ timeout: 5 })),
  );
}

async function assertAcceptanceDatabase() {
  const [current] = await database.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (current?.databaseName !== "mewtuals_test") {
    throw new Error(
      `Refusing Opportunity Brief cleanup in ${current?.databaseName ?? "an unknown database"}.`,
    );
  }
}

async function cleanupAcceptanceRows() {
  await assertAcceptanceDatabase();
  await database
    .delete(opportunityBriefRequests)
    .where(like(opportunityBriefRequests.normalizedProfileUrl, testProfilePattern));

  const candidates = await database
    .select({ id: discoveryCandidates.id, runId: discoveryCandidates.mostRecentRunId })
    .from(discoveryCandidates)
    .where(eq(discoveryCandidates.geography, testGeography));
  const candidateIds = candidates.map(({ id }) => id);
  const runIds = [...new Set(candidates.map(({ runId }) => runId))];
  if (candidateIds.length > 0) {
    await database
      .delete(discoveryCandidateSources)
      .where(inArray(discoveryCandidateSources.candidateId, candidateIds));
    await database
      .delete(discoveryCandidateIdentifiers)
      .where(inArray(discoveryCandidateIdentifiers.candidateId, candidateIds));
    await database
      .delete(discoveryCandidates)
      .where(inArray(discoveryCandidates.id, candidateIds));
  }
  if (runIds.length > 0) {
    await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, runIds));
  }
}

async function createDiscoveryCandidate(input: {
  type: "company" | "creator";
  identifier: CandidateIdentifier;
  sourceSupported?: boolean;
}) {
  const [run] = await database
    .insert(discoveryRuns)
    .values({
      externalRunKey: `opportunity-brief-${testId}-${randomUUID()}`,
      trigger: "manual",
      status: "succeeded",
      startedAt: baseTime,
      completedAt: baseTime,
      geography: testGeography,
      candidateType: input.type,
      sourcesUsed: ["acceptance"],
      requestedCount: 1,
      companyPercentage: input.type === "company" ? 100 : 0,
      foundCount: 1,
      newCount: 1,
      requestedByEmail: testAdminEmail,
      createdAt: baseTime,
      updatedAt: baseTime,
    })
    .returning();
  if (!run) throw new Error("Discovery run was not created.");

  const canonicalUrl = profileUrl(`candidate-${randomUUID()}`);
  const [candidate] = await database
    .insert(discoveryCandidates)
    .values({
      type: input.type,
      name: `Acceptance ${input.type}`,
      normalizedName: `acceptance ${input.type}`,
      canonicalIdentityKey: `${input.identifier.kind}:${input.identifier.value}`,
      canonicalUrl,
      websiteUrl: canonicalUrl,
      primarySocialUrl: null,
      linkedinUrl: null,
      discoveredDescription: "Source-supported acceptance candidate.",
      category: "acceptance",
      geography: testGeography,
      firstSourceName: "acceptance",
      firstSourceUrl: canonicalUrl,
      discoveredAt: baseTime,
      lastSeenAt: baseTime,
      mostRecentRunId: run.id,
      discoveryScore: 80,
      createdAt: baseTime,
      updatedAt: baseTime,
    })
    .returning();
  if (!candidate) throw new Error("Discovery candidate was not created.");

  await database.insert(discoveryCandidateIdentifiers).values({
    candidateId: candidate.id,
    candidateType: input.type,
    kind: input.identifier.kind,
    normalizedValue: input.identifier.value,
    createdAt: baseTime,
  });
  if (input.sourceSupported !== false) {
    await database.insert(discoveryCandidateSources).values({
      candidateId: candidate.id,
      discoveryRunId: run.id,
      sourceName: "acceptance",
      sourceUrl: canonicalUrl,
      firstSeenAt: baseTime,
      lastSeenAt: baseTime,
      createdAt: baseTime,
    });
  }
  return candidate;
}

async function storedRequest(suffix: string) {
  const [request] = await database
    .select()
    .from(opportunityBriefRequests)
    .where(
      and(
        eq(opportunityBriefRequests.participantType, "company"),
        eq(opportunityBriefRequests.normalizedProfileUrl, profileUrl(suffix)),
      ),
    )
    .limit(1);
  return request ?? null;
}

beforeEach(cleanupAcceptanceRows);

afterAll(async () => {
  try {
    await cleanupAcceptanceRows();
  } finally {
    await closeDb();
  }
});

describe("Opportunity Brief database-suite selection", () => {
  it("runs only in the guarded database and acceptance suites", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:unit"]).toContain(
      "--exclude tests/opportunity-brief-repository.integration.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "tests/opportunity-brief-repository.integration.test.ts",
    );
    expect(packageJson.scripts["test:acceptance"]).toContain(
      "tests/opportunity-brief-repository.integration.test.ts",
    );
  });
});

describe("Opportunity Brief transactional submission persistence", () => {
  it("persists the service-normalized identity and returns only a public-safe confirmation", async () => {
    const service = createOpportunityBriefService({
      repository,
      acknowledgementSender: {
        async sendAcknowledgement() {
          return { status: "pending" as const };
        },
      },
      adminEmails: [],
      now: () => baseTime,
    });

    const result = await service.submit(
      {
        participantType: "company",
        profileUrl: ` HTTPS://WWW.Profile-${compactTestId}.EXAMPLE/normalized/?utm_source=qr#top `,
        email: " Current@Example.TEST ",
        phoneNumber: "",
        openToText: "  Creator distribution  ",
        source: " qr ",
        utm: { source: " meetup " },
        website: "",
      },
      `normalized-${testId}`,
    );

    expect(result).toEqual({
      ok: true,
      requestId: expect.any(String),
      status: "submitted",
      submission: {
        participantType: "company",
        profileUrl: profileUrl("normalized"),
        email: "current@example.test",
        phoneNumber: null,
        openToText: "Creator distribution",
        source: "qr",
        utm: { source: "meetup" },
      },
    });
    const request = await storedRequest("normalized");
    expect(request).toMatchObject({
      profileUrl: profileUrl("normalized"),
      normalizedProfileUrl: profileUrl("normalized"),
      email: "current@example.test",
      normalizedEmail: "current@example.test",
      acknowledgementStatus: "pending",
      acknowledgementEmail: "current@example.test",
      submissionCount: 1,
      lastSubmittedAt: baseTime,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
    expect(request?.sourceHistory).toEqual([
      { source: "qr", utm: { source: "meetup" } },
    ]);
    const publicJson = JSON.stringify(result);
    expect(publicJson).not.toContain("requester");
    expect(publicJson).not.toContain("acknowledgement");
    expect(publicJson).not.toContain("linkedCandidateId");
  });

  it("forms a merged confirmation from current input without exposing stored contacts", async () => {
    let now = baseTime;
    const service = createOpportunityBriefService({
      repository,
      adminEmails: [],
      now: () => now,
    });
    await service.submit(
      {
        participantType: "company",
        profileUrl: profileUrl("private-merge"),
        email: "stored-private@example.test",
        phoneNumber: "+919111111111",
        openToText: "Stored private context",
        source: "private-first",
        utm: {},
        website: "",
      },
      `private-first-${testId}`,
    );
    now = new Date(baseTime.getTime() + 1_000);
    const result = await service.submit(
      {
        participantType: "company",
        profileUrl: profileUrl("private-merge"),
        email: "",
        phoneNumber: "+919222222222",
        openToText: "Current public context",
        source: "private-repeat",
        utm: { campaign: "repeat" },
        website: "",
      },
      `private-repeat-${testId}`,
    );

    expect(result).toMatchObject({
      ok: true,
      submission: {
        email: null,
        phoneNumber: "+919222222222",
        openToText: "Current public context",
      },
    });
    expect(await storedRequest("private-merge")).toMatchObject({
      email: "stored-private@example.test",
      phoneNumber: "+919222222222",
    });
    expect(JSON.stringify(result)).not.toContain("stored-private@example.test");
    expect(JSON.stringify(result)).not.toContain("+919111111111");
  });

  it("keeps invalid and honeypot submissions outside the repository boundary", async () => {
    const service = createOpportunityBriefService({
      repository,
      adminEmails: [],
      now: () => baseTime,
    });
    const invalid = await service.submit(
      {
        participantType: "company",
        profileUrl: profileUrl("invalid"),
        email: "",
        phoneNumber: "",
        openToText: "",
        source: "invalid",
        utm: {},
        website: "",
      },
      `invalid-${testId}`,
    );
    const honeypot = await service.submit(
      {
        participantType: "company",
        profileUrl: profileUrl("honeypot"),
        email: "valid@example.test",
        phoneNumber: "",
        openToText: "",
        source: "honeypot",
        utm: {},
        website: "spam.example",
      },
      `honeypot-${testId}`,
    );

    expect(invalid).toMatchObject({ ok: false, status: 400 });
    expect(honeypot).toMatchObject({ ok: false, status: 400 });
    const requests = await database
      .select({ id: opportunityBriefRequests.id })
      .from(opportunityBriefRequests)
      .where(like(opportunityBriefRequests.normalizedProfileUrl, testProfilePattern));
    const attempts = await database
      .select({ id: opportunityBriefSubmissionAttempts.id })
      .from(opportunityBriefSubmissionAttempts)
      .where(
        inArray(opportunityBriefSubmissionAttempts.requesterHash, [
          `invalid-${testId}`,
          `honeypot-${testId}`,
        ]),
      );
    expect(requests).toHaveLength(0);
    expect(attempts).toHaveLength(0);
  });

  it("upserts only by participant and normalized profile while refreshing current non-empty fields", async () => {
    await repository.submit(
      submissionInput("merged", {
        email: "first@example.test",
        phoneNumber: "+919999999999",
        source: "initial",
        utm: { source: "initial" },
      }),
    );
    const mergedAt = new Date(baseTime.getTime() + 1_000);
    const merged = await repository.submit(
      submissionInput("merged", {
        email: "replacement@example.test",
        phoneNumber: null,
        openToText: "New current opportunity",
        source: "repeat",
        utm: { source: "repeat", campaign: "second" },
        requesterHash: `merged-repeat-${testId}`,
        submittedAt: mergedAt,
      }),
    );

    expect(merged).toMatchObject({
      outcome: "accepted",
      persistence: "merged",
      acknowledgement: {
        status: "pending",
        delivery: {
          email: "replacement@example.test",
          expectedUpdatedAt: mergedAt,
        },
      },
    });
    const request = await storedRequest("merged");
    expect(request).toMatchObject({
      email: "replacement@example.test",
      normalizedEmail: "replacement@example.test",
      phoneNumber: "+919999999999",
      normalizedPhoneNumber: "+919999999999",
      openToText: "New current opportunity",
      source: "repeat",
      utm: { source: "repeat", campaign: "second" },
      submissionCount: 2,
      lastSubmittedAt: mergedAt,
      updatedAt: mergedAt,
    });

    for (let index = 0; index < 22; index += 1) {
      await repository.submit(
        submissionInput("merged", {
          email: null,
          phoneNumber: `+91900000${String(index).padStart(4, "0")}`,
          source: `history-${String(index).padStart(2, "0")}`,
          utm: { campaign: `history-${index}` },
          requesterHash: `history-${testId}-${index}`,
          submittedAt: new Date(baseTime.getTime() + 2_000 + index),
        }),
      );
    }
    const bounded = await storedRequest("merged");
    expect(bounded?.submissionCount).toBe(24);
    expect(bounded?.sourceHistory).toHaveLength(20);
    expect(bounded?.sourceHistory[0]).toEqual({
      source: "history-02",
      utm: { campaign: "history-2" },
    });
    expect(bounded?.sourceHistory[19]).toEqual({
      source: "history-21",
      utm: { campaign: "history-21" },
    });
  });

  it("bounds accumulated attribution metadata by serialized size before JSON storage", async () => {
    const maximumValue = "x".repeat(200);
    for (let index = 0; index < 12; index += 1) {
      await repository.submit(
        submissionInput("metadata-bytes", {
          utm: {
            source: maximumValue,
            medium: maximumValue,
            campaign: `${String(index).padStart(2, "0")}${"c".repeat(198)}`,
            term: maximumValue,
            content: maximumValue,
          },
          requesterHash: `metadata-bytes-${testId}-${index}`,
          submittedAt: new Date(baseTime.getTime() + index),
        }),
      );
    }

    const request = await storedRequest("metadata-bytes");
    const serializedBytes = new TextEncoder().encode(
      JSON.stringify({ utm: request?.utm, history: request?.sourceHistory }),
    ).byteLength;
    expect(serializedBytes).toBeLessThanOrEqual(8 * 1_024);
    expect(request?.sourceHistory.length).toBeLessThan(12);
    expect(request?.sourceHistory.at(-1)?.utm.campaign).toBe(
      `11${"c".repeat(198)}`,
    );
  });

  it("does not merge contact reuse across different profile identities", async () => {
    const email = "shared-contact@example.test";
    const [first, second] = await Promise.all([
      repository.submit(submissionInput("contact-a", { email })),
      repository.submit(submissionInput("contact-b", { email })),
    ]);

    expect(first).toMatchObject({ outcome: "accepted", persistence: "created" });
    expect(second).toMatchObject({ outcome: "accepted", persistence: "created" });
    const rows = await database
      .select({ id: opportunityBriefRequests.id })
      .from(opportunityBriefRequests)
      .where(eq(opportunityBriefRequests.normalizedEmail, email));
    expect(rows).toHaveLength(2);
  });

  it("serializes requester counting so eight concurrent writes succeed and the ninth mutates nothing", async () => {
    const connections = Array.from({ length: 9 }, (_, index) =>
      createIndependentDatabase(`rate-${testId}-${index}`),
    );
    const requesterHash = `rate-limit-${testId}`;
    try {
      const results = await Promise.all(
        connections.map(({ database: connection }, index) =>
          createOpportunityBriefRepository(connection).submit(
            submissionInput(`rate-${index}`, {
              requesterHash,
              submittedAt: new Date(baseTime.getTime() + index),
            }),
          ),
        ),
      );
      expect(results.filter(({ outcome }) => outcome === "accepted")).toHaveLength(8);
      expect(results.filter(({ outcome }) => outcome === "rate_limited")).toHaveLength(1);

      const [requests, attempts] = await Promise.all([
        database
          .select({ id: opportunityBriefRequests.id })
          .from(opportunityBriefRequests)
          .where(like(opportunityBriefRequests.normalizedProfileUrl, testProfilePattern)),
        database
          .select({ requestId: opportunityBriefSubmissionAttempts.requestId })
          .from(opportunityBriefSubmissionAttempts)
          .where(eq(opportunityBriefSubmissionAttempts.requesterHash, requesterHash)),
      ]);
      expect(requests).toHaveLength(8);
      expect(attempts).toHaveLength(8);
    } finally {
      await closeIndependentDatabases(connections);
    }
  }, 20_000);

  it("expires an attempt exactly at the rolling boundary but counts one just inside", async () => {
    const submittedAt = new Date(baseTime.getTime() + 15 * 60 * 1_000);
    const exactBoundaryRequester = `rate-boundary-exact-${testId}`;
    for (let index = 0; index < 8; index += 1) {
      await repository.submit(
        submissionInput(`rate-boundary-exact-${index}`, {
          requesterHash: exactBoundaryRequester,
          submittedAt: baseTime,
        }),
      );
    }
    await expect(
      repository.submit(
        submissionInput("rate-boundary-exact-new", {
          requesterHash: exactBoundaryRequester,
          submittedAt,
        }),
      ),
    ).resolves.toMatchObject({ outcome: "accepted" });

    const insideRequester = `rate-boundary-inside-${testId}`;
    const justInside = new Date(baseTime.getTime() + 1);
    for (let index = 0; index < 8; index += 1) {
      await repository.submit(
        submissionInput(`rate-boundary-inside-${index}`, {
          requesterHash: insideRequester,
          submittedAt: justInside,
        }),
      );
    }
    await expect(
      repository.submit(
        submissionInput("rate-boundary-inside-new", {
          requesterHash: insideRequester,
          submittedAt,
        }),
      ),
    ).resolves.toEqual({ outcome: "rate_limited" });
    expect(await storedRequest("rate-boundary-inside-new")).toBeNull();
  });

  it("atomically merges concurrent duplicates without unique failures", async () => {
    const connections = Array.from({ length: 8 }, (_, index) =>
      createIndependentDatabase(`duplicate-${testId}-${index}`),
    );
    try {
      const results = await Promise.all(
        connections.map(({ database: connection }, index) =>
          createOpportunityBriefRepository(connection).submit(
            submissionInput("concurrent", {
              email: `concurrent-${index}@example.test`,
              source: `concurrent-${index}`,
              requesterHash: `concurrent-${testId}-${index}`,
              submittedAt: new Date(baseTime.getTime() + index),
            }),
          ),
        ),
      );
      expect(results).toHaveLength(8);
      expect(results.every(({ outcome }) => outcome === "accepted")).toBe(true);
      expect(
        results.filter(
          (result) => result.outcome === "accepted" && result.persistence === "created",
        ),
      ).toHaveLength(1);

      const request = await storedRequest("concurrent");
      expect(request?.submissionCount).toBe(8);
      expect(request?.sourceHistory).toHaveLength(8);
      const attempts = await database
        .select({ id: opportunityBriefSubmissionAttempts.id })
        .from(opportunityBriefSubmissionAttempts)
        .where(eq(opportunityBriefSubmissionAttempts.requestId, request!.id));
      expect(attempts).toHaveLength(8);
    } finally {
      await closeIndependentDatabases(connections);
    }
  }, 20_000);

  it("links only an exact same-type, same-kind, source-supported Discovery identifier", async () => {
    const exactUrl = profileUrl("exact-candidate");
    const exactIdentifier = candidateIdentifierForProfileUrl(exactUrl);
    const exactCandidate = await createDiscoveryCandidate({
      type: "company",
      identifier: exactIdentifier,
    });
    const unsupportedUrl = profileUrl("unsupported-candidate");
    await createDiscoveryCandidate({
      type: "company",
      identifier: candidateIdentifierForProfileUrl(unsupportedUrl),
      sourceSupported: false,
    });

    const exact = await repository.submit(
      submissionInput("exact-candidate", { candidateIdentifier: exactIdentifier }),
    );
    const wrongKind = await repository.submit(
      submissionInput("wrong-kind", {
        candidateIdentifier: {
          kind:
            exactIdentifier.kind === "canonical" ? "social_url" : "canonical",
          value: exactIdentifier.value,
        },
      }),
    );
    const wrongType = await repository.submit(
      submissionInput("wrong-type", {
        participantType: "creator",
        candidateIdentifier: exactIdentifier,
      }),
    );
    const unsupported = await repository.submit(
      submissionInput("unsupported-candidate", {
        candidateIdentifier: candidateIdentifierForProfileUrl(unsupportedUrl),
      }),
    );
    const unmatched = await repository.submit(submissionInput("unmatched"));

    expect(exact).toMatchObject({
      outcome: "accepted",
      linkedCandidateId: exactCandidate.id,
    });
    for (const result of [wrongKind, wrongType, unsupported, unmatched]) {
      expect(result).toMatchObject({ outcome: "accepted", linkedCandidateId: null });
    }
    const fakeCandidate = await database
      .select({ id: discoveryCandidates.id })
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.canonicalUrl, profileUrl("unmatched")));
    expect(fakeCandidate).toHaveLength(0);
  });
});

describe("Opportunity Brief acknowledgement persistence", () => {
  it("requests email only for new or changed addresses and keeps phone-only not requested", async () => {
    const phoneOnly = await repository.submit(
      submissionInput("ack", { email: null, phoneNumber: "+919876543210" }),
    );
    expect(phoneOnly).toMatchObject({
      outcome: "accepted",
      acknowledgement: { status: "not_requested", delivery: null },
    });

    const addedAt = new Date(baseTime.getTime() + 1_000);
    const added = await repository.submit(
      submissionInput("ack", {
        email: "added@example.test",
        phoneNumber: null,
        requesterHash: `ack-added-${testId}`,
        submittedAt: addedAt,
      }),
    );
    expect(added).toMatchObject({
      outcome: "accepted",
      persistence: "merged",
      acknowledgement: {
        status: "pending",
        delivery: { email: "added@example.test", expectedUpdatedAt: addedAt },
      },
    });

    const same = await repository.submit(
      submissionInput("ack", {
        email: "added@example.test",
        requesterHash: `ack-same-${testId}`,
        submittedAt: new Date(baseTime.getTime() + 2_000),
      }),
    );
    expect(same).toMatchObject({
      outcome: "accepted",
      acknowledgement: { status: "pending", delivery: null },
    });

    const replacedAt = new Date(baseTime.getTime() + 3_000);
    const replaced = await repository.submit(
      submissionInput("ack", {
        email: "replacement@example.test",
        requesterHash: `ack-replaced-${testId}`,
        submittedAt: replacedAt,
      }),
    );
    expect(replaced).toMatchObject({
      outcome: "accepted",
      acknowledgement: {
        status: "pending",
        delivery: {
          email: "replacement@example.test",
          expectedUpdatedAt: replacedAt,
        },
      },
    });
  });

  it("guards acknowledgement outcomes against delayed addresses and records safe fields", async () => {
    const emailA = await repository.submit(
      submissionInput("ack-race", { email: "a@example.test" }),
    );
    if (emailA.outcome !== "accepted" || !emailA.acknowledgement.delivery) {
      throw new Error("Email A delivery descriptor was required.");
    }
    const emailBAt = new Date(baseTime.getTime() + 1_000);
    const emailB = await repository.submit(
      submissionInput("ack-race", {
        email: "b@example.test",
        requesterHash: `ack-b-${testId}`,
        submittedAt: emailBAt,
      }),
    );
    if (emailB.outcome !== "accepted" || !emailB.acknowledgement.delivery) {
      throw new Error("Email B delivery descriptor was required.");
    }
    const sentAt = new Date(baseTime.getTime() + 2_000);
    await expect(
      repository.recordAcknowledgement({
        requestId: emailB.requestId,
        attemptedEmail: "b@example.test",
        expectedUpdatedAt: emailB.acknowledgement.delivery.expectedUpdatedAt,
        outcome: { status: "sent", at: sentAt },
      }),
    ).resolves.toEqual({ outcome: "recorded" });
    await expect(
      repository.recordAcknowledgement({
        requestId: emailA.requestId,
        attemptedEmail: "a@example.test",
        expectedUpdatedAt: emailA.acknowledgement.delivery.expectedUpdatedAt,
        outcome: { status: "failed", error: "delayed private failure" },
      }),
    ).resolves.toEqual({ outcome: "stale" });

    expect(await storedRequest("ack-race")).toMatchObject({
      acknowledgementStatus: "sent",
      acknowledgementEmail: "b@example.test",
      acknowledgementSentAt: sentAt,
      acknowledgementError: null,
    });

    const emailCAt = new Date(baseTime.getTime() + 3_000);
    const emailC = await repository.submit(
      submissionInput("ack-race", {
        email: "c@example.test",
        requesterHash: `ack-c-${testId}`,
        submittedAt: emailCAt,
      }),
    );
    if (emailC.outcome !== "accepted" || !emailC.acknowledgement.delivery) {
      throw new Error("Email C delivery descriptor was required.");
    }
    await expect(
      repository.recordAcknowledgement({
        requestId: emailC.requestId,
        attemptedEmail: "c@example.test",
        expectedUpdatedAt: emailC.acknowledgement.delivery.expectedUpdatedAt,
        outcome: { status: "failed", error: "Delivery rejected safely." },
      }),
    ).resolves.toEqual({ outcome: "recorded" });
    expect(await storedRequest("ack-race")).toMatchObject({
      acknowledgementStatus: "failed",
      acknowledgementSentAt: null,
      acknowledgementError: "Delivery rejected safely.",
    });
  });

  it.each([
    "request_id",
    "pending_status",
    "attempted_email",
    "expected_updated_at",
    "matching",
  ] as const)(
    "isolates the %s acknowledgement guard predicate",
    async (predicate) => {
      const suffix = `ack-guard-${predicate}`;
      const accepted = await repository.submit(
        submissionInput(suffix, { email: `${predicate}@example.test` }),
      );
      if (
        accepted.outcome !== "accepted" ||
        !accepted.acknowledgement.delivery
      ) {
        throw new Error("Acknowledgement delivery descriptor was required.");
      }
      const delivery = accepted.acknowledgement.delivery;
      if (predicate === "pending_status") {
        await database
          .update(opportunityBriefRequests)
          .set({
            acknowledgementStatus: "failed",
            acknowledgementError: "Existing failure",
          })
          .where(eq(opportunityBriefRequests.id, accepted.requestId));
      }
      const before = await storedRequest(suffix);
      const sentAt = new Date(baseTime.getTime() + 5_000);
      const result = await repository.recordAcknowledgement({
        requestId:
          predicate === "request_id" ? randomUUID() : accepted.requestId,
        attemptedEmail:
          predicate === "attempted_email"
            ? "different@example.test"
            : delivery.email,
        expectedUpdatedAt:
          predicate === "expected_updated_at"
            ? new Date(delivery.expectedUpdatedAt.getTime() + 1)
            : delivery.expectedUpdatedAt,
        outcome: { status: "sent", at: sentAt },
      });

      if (predicate === "matching") {
        expect(result).toEqual({ outcome: "recorded" });
        expect(await storedRequest(suffix)).toMatchObject({
          acknowledgementStatus: "sent",
          acknowledgementSentAt: sentAt,
          acknowledgementError: null,
        });
      } else {
        expect(result).toEqual({ outcome: "stale" });
        expect(await storedRequest(suffix)).toEqual(before);
      }
    },
  );
});

describe("Opportunity Brief administrator persistence", () => {
  it("returns global summary plus stable, bounded, half-open filtered pages without private attempts", async () => {
    const beforeIstDay = new Date("2026-07-21T18:29:59.999Z");
    const atIstDay = new Date("2026-07-21T18:30:00.000Z");
    const laterIstDay = new Date("2026-07-22T10:00:00.000Z");
    const companyBefore = await repository.submit(
      submissionInput("admin-before", {
        source: "admin-alpha",
        submittedAt: beforeIstDay,
      }),
    );
    const creatorToday = await repository.submit(
      submissionInput("admin-creator", {
        participantType: "creator",
        source: "admin-beta",
        submittedAt: atIstDay,
      }),
    );
    const companyToday = await repository.submit(
      submissionInput("admin-company", {
        source: "admin-alpha",
        submittedAt: laterIstDay,
      }),
    );
    if (
      companyBefore.outcome !== "accepted" ||
      creatorToday.outcome !== "accepted" ||
      companyToday.outcome !== "accepted"
    ) {
      throw new Error("Administrator fixtures were not accepted.");
    }
    const candidate = await createDiscoveryCandidate({
      type: "company",
      identifier: candidateIdentifierForProfileUrl(profileUrl("admin-link-target")),
    });
    const currentCompany = await repository.getAdminRequest(companyToday.requestId);
    if (!currentCompany) throw new Error("Company fixture was not readable.");
    const linked = await repository.applyAdminMutation({
      kind: "candidate",
      requestId: currentCompany.id,
      candidateId: candidate.id,
      expectedUpdatedAt: currentCompany.updatedAt,
      updatedAt: new Date(laterIstDay.getTime() + 1_000),
    });
    expect(linked).toMatchObject({ outcome: "updated" });
    const linkedRequest = linked.outcome === "updated" ? linked.request : null;
    await repository.applyAdminMutation({
      kind: "status",
      requestId: companyToday.requestId,
      status: "researching",
      expectedStatus: "submitted",
      expectedUpdatedAt: linkedRequest!.updatedAt,
      updatedAt: new Date(laterIstDay.getTime() + 2_000),
    });

    const snapshot = await repository.getAdminSnapshot(
      new Date("2026-07-22T12:00:00.000Z"),
      {
        participantType: "company",
        status: "researching",
        source: "admin-alpha",
        submittedAtGte: atIstDay,
        submittedAtLt: new Date("2026-07-22T18:30:00.000Z"),
        linked: true,
        page: 1,
        pageSize: 1_000,
      },
    );
    expect(snapshot.summary).toEqual({
      total: 3,
      newToday: 2,
      companies: 2,
      creators: 1,
      awaitingResearch: 2,
      linkedCandidates: 1,
      sources: { "admin-alpha": 2, "admin-beta": 1 },
    });
    expect(snapshot).toMatchObject({ page: 1, pageSize: 100, totalPages: 1 });
    expect(snapshot.requests).toHaveLength(1);
    expect(snapshot.requests[0]).toMatchObject({
      id: companyToday.requestId,
      participantType: "company",
      status: "researching",
      linkedCandidateId: candidate.id,
    });
    const snapshotJson = JSON.stringify(snapshot);
    expect(snapshotJson).not.toContain(`requester-${testId}`);
    expect(snapshotJson).not.toContain("requesterHash");
    expect(snapshotJson).not.toContain("attempts");

    const firstPage = await repository.getAdminSnapshot(baseTime, {
      page: 1,
      pageSize: 2,
    });
    const secondPage = await repository.getAdminSnapshot(baseTime, {
      page: 2,
      pageSize: 2,
    });
    expect(firstPage.requests).toHaveLength(2);
    expect(secondPage.requests).toHaveLength(1);
    expect(
      new Set([...firstPage.requests, ...secondPage.requests].map(({ id }) => id)).size,
    ).toBe(3);
  });

  it("keeps summary, sources, filtered totals, and page rows on one repeatable snapshot", async () => {
    await repository.submit(
      submissionInput("snapshot-before", { source: "snapshot-source" }),
    );
    const summaryRead = Promise.withResolvers<void>();
    const continueSnapshot = Promise.withResolvers<void>();
    const controlledRepository = createOpportunityBriefRepository(database, {
      async afterAdminSummaryRead() {
        summaryRead.resolve();
        await continueSnapshot.promise;
      },
    });
    const writer = createIndependentDatabase(`snapshot-writer-${testId}`);
    try {
      const snapshotPromise = controlledRepository.getAdminSnapshot(baseTime, {
        source: "snapshot-source",
      });
      await summaryRead.promise;
      await createOpportunityBriefRepository(writer.database).submit(
        submissionInput("snapshot-after", {
          source: "snapshot-source",
          requesterHash: `snapshot-writer-${testId}`,
          submittedAt: new Date(baseTime.getTime() + 1_000),
        }),
      );
      continueSnapshot.resolve();

      const snapshot = await snapshotPromise;
      expect(snapshot.summary).toMatchObject({
        total: 1,
        sources: { "snapshot-source": 1 },
      });
      expect(snapshot).toMatchObject({ totalPages: 1 });
      expect(snapshot.requests).toHaveLength(1);
      expect(snapshot.requests[0]?.profileUrl).toBe(profileUrl("snapshot-before"));
      expect(await storedRequest("snapshot-after")).not.toBeNull();
    } finally {
      continueSnapshot.resolve();
      await closeIndependentDatabases([writer]);
    }
  });

  it("reads candidate types and applies approved notes, status, link, and unlink mutations atomically", async () => {
    const submitted = await repository.submit(submissionInput("admin-mutations"));
    if (submitted.outcome !== "accepted") throw new Error("Fixture was rate limited.");
    const candidate = await createDiscoveryCandidate({
      type: "company",
      identifier: candidateIdentifierForProfileUrl(profileUrl("admin-mutation-candidate")),
    });

    await expect(repository.getCandidateType(candidate.id)).resolves.toBe("company");
    await expect(repository.getCandidateType(randomUUID())).resolves.toBeNull();
    let current = await repository.getAdminRequest(submitted.requestId);
    expect(current).toMatchObject({ status: "submitted", adminNotes: null });

    const notesAt = new Date(baseTime.getTime() + 1_000);
    const notes = await repository.applyAdminMutation({
      kind: "notes",
      requestId: submitted.requestId,
      notes: "Research the India launch.",
      expectedUpdatedAt: current!.updatedAt,
      updatedAt: notesAt,
    });
    expect(notes).toMatchObject({
      outcome: "updated",
      request: { adminNotes: "Research the India launch.", updatedAt: notesAt },
    });
    current = notes.outcome === "updated" ? notes.request : null;

    const statusAt = new Date(baseTime.getTime() + 2_000);
    const status = await repository.applyAdminMutation({
      kind: "status",
      requestId: submitted.requestId,
      status: "converted",
      expectedStatus: "submitted",
      expectedUpdatedAt: current!.updatedAt,
      updatedAt: statusAt,
    });
    expect(status).toMatchObject({
      outcome: "updated",
      request: { status: "converted", updatedAt: statusAt },
    });
    current = status.outcome === "updated" ? status.request : null;

    const linked = await repository.applyAdminMutation({
      kind: "candidate",
      requestId: submitted.requestId,
      candidateId: candidate.id,
      expectedUpdatedAt: current!.updatedAt,
      updatedAt: new Date(baseTime.getTime() + 3_000),
    });
    expect(linked).toMatchObject({
      outcome: "updated",
      request: { linkedCandidateId: candidate.id },
    });
    current = linked.outcome === "updated" ? linked.request : null;

    const unlinked = await repository.applyAdminMutation({
      kind: "candidate",
      requestId: submitted.requestId,
      candidateId: null,
      expectedUpdatedAt: current!.updatedAt,
      updatedAt: new Date(baseTime.getTime() + 4_000),
    });
    expect(unlinked).toMatchObject({
      outcome: "updated",
      request: { linkedCandidateId: null },
    });

    await expect(
      repository.applyAdminMutation({
        kind: "candidate",
        requestId: submitted.requestId,
        candidateId: randomUUID(),
        expectedUpdatedAt:
          unlinked.outcome === "updated" ? unlinked.request.updatedAt : baseTime,
        updatedAt: new Date(baseTime.getTime() + 5_000),
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("lets the service reject a concrete mismatched candidate type without linking", async () => {
    const submitted = await repository.submit(
      submissionInput("candidate-type-service", { participantType: "company" }),
    );
    if (submitted.outcome !== "accepted") throw new Error("Fixture was rate limited.");
    const creator = await createDiscoveryCandidate({
      type: "creator",
      identifier: candidateIdentifierForProfileUrl(
        profileUrl("candidate-type-service-creator"),
      ),
    });
    const current = await repository.getAdminRequest(submitted.requestId);
    if (!current) throw new Error("Fixture was not readable.");
    const service = createOpportunityBriefService({
      repository,
      adminEmails: [testAdminEmail],
      now: () => new Date(baseTime.getTime() + 1_000),
    });

    await expect(
      service.linkCandidate(
        { userId: `admin-${testId}`, email: testAdminEmail },
        submitted.requestId,
        {
          candidateId: creator.id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
        },
      ),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error:
        "Discovery candidate type does not match the request participant type.",
    });
    expect(await repository.getAdminRequest(submitted.requestId)).toMatchObject({
      linkedCandidateId: null,
    });
  });

  it("returns the current row on a real optimistic race and guards expected status", async () => {
    const submitted = await repository.submit(submissionInput("admin-conflict"));
    if (submitted.outcome !== "accepted") throw new Error("Fixture was rate limited.");
    const read = await repository.getAdminRequest(submitted.requestId);
    if (!read) throw new Error("Fixture was not readable.");

    const racedAt = new Date(baseTime.getTime() + 10_000);
    await database
      .update(opportunityBriefRequests)
      .set({ adminNotes: "Concurrent administrator", updatedAt: racedAt })
      .where(eq(opportunityBriefRequests.id, read.id));
    const conflict = await repository.applyAdminMutation({
      kind: "notes",
      requestId: read.id,
      notes: "Stale update",
      expectedUpdatedAt: read.updatedAt,
      updatedAt: new Date(racedAt.getTime() + 1_000),
    });
    expect(conflict).toMatchObject({
      outcome: "conflict",
      request: { adminNotes: "Concurrent administrator", updatedAt: racedAt },
    });

    const wrongStatus = await repository.applyAdminMutation({
      kind: "status",
      requestId: read.id,
      status: "researching",
      expectedStatus: "rejected",
      expectedUpdatedAt: racedAt,
      updatedAt: new Date(racedAt.getTime() + 2_000),
    });
    expect(wrongStatus).toMatchObject({
      outcome: "conflict",
      request: { status: "submitted" },
    });
  });
});

describe("Opportunity Brief acceptance cleanup", () => {
  it("is isolated and can be rerun after cleanup", async () => {
    await repository.submit(submissionInput("cleanup"));
    await cleanupAcceptanceRows();
    await cleanupAcceptanceRows();

    const requests = await database
      .select({ id: opportunityBriefRequests.id })
      .from(opportunityBriefRequests)
      .where(like(opportunityBriefRequests.normalizedProfileUrl, testProfilePattern));
    expect(requests).toHaveLength(0);
  });
});
