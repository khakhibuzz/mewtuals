import { describe, expect, it } from "vitest";

import {
  createOpportunityBriefService,
  type AcknowledgementOutcome,
  type AcknowledgementSender,
  type AdminMutationResult,
  type AdminRequest,
  type AdminSnapshot,
  type AtomicAdminMutation,
  type OpportunityBriefRepository,
  type SubmitRepositoryInput,
  type SubmitRepositoryResult,
} from "../app/server/opportunity-brief-service";

const now = new Date("2026-07-22T06:30:00.000Z");
const requestId = "00000000-0000-4000-8000-000000000101";
const candidateId = "00000000-0000-4000-8000-000000000202";
const expectedUpdatedAt = new Date("2026-07-22T06:00:00.000Z");

type AcceptedSubmitResult = Extract<
  SubmitRepositoryResult,
  { outcome: "accepted" }
>;

function acceptedSubmitResult(
  overrides: Partial<AcceptedSubmitResult> = {},
): AcceptedSubmitResult {
  return {
    outcome: "accepted",
    requestId,
    status: "submitted",
    linkedCandidateId: null,
    persistence: "created",
    acknowledgement: { status: "pending", shouldSend: true },
    ...overrides,
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    participantType: "company",
    profileUrl:
      " HTTPS://WWW.Example.COM/Creators/Ada/?utm_source=meetup#profile ",
    email: " Founder@Example.COM ",
    phoneNumber: " +91 (98765) 43210 ",
    openToText: " Podcast swaps and live events ",
    source: " bengaluru-meetup ",
    utm: { source: " meetup ", campaign: " launch " },
    website: "",
    ...overrides,
  };
}

function adminRequest(
  overrides: Partial<AdminRequest> = {},
): AdminRequest {
  return {
    id: requestId,
    participantType: "company",
    profileUrl: "https://example.com/Creators/Ada",
    email: "founder@example.com",
    phoneNumber: "+919876543210",
    openToText: "Podcast swaps and live events",
    source: "bengaluru-meetup",
    utm: { source: "meetup", campaign: "launch" },
    linkedCandidateId: null,
    status: "submitted",
    adminNotes: null,
    acknowledgementStatus: "pending",
    acknowledgementSentAt: null,
    acknowledgementError: null,
    submissionCount: 1,
    lastSubmittedAt: now,
    createdAt: now,
    updatedAt: expectedUpdatedAt,
    ...overrides,
  };
}

const emptySnapshot: AdminSnapshot = {
  summary: {
    total: 0,
    newToday: 0,
    companies: 0,
    creators: 0,
    awaitingResearch: 0,
    linkedCandidates: 0,
    sources: {},
  },
  requests: [],
  page: 1,
  pageSize: 25,
  totalPages: 0,
};

class MemoryRepository implements OpportunityBriefRepository {
  submissions: SubmitRepositoryInput[] = [];
  acknowledgements: Array<{ id: string; outcome: AcknowledgementOutcome }> = [];
  adminSnapshotCalls: Array<{ actorTime: Date; filters: unknown }> = [];
  mutations: AtomicAdminMutation[] = [];
  request: AdminRequest | null = adminRequest();
  candidateType: "company" | "creator" | null = "company";
  submitResult: SubmitRepositoryResult = acceptedSubmitResult();
  mutationResult: AdminMutationResult = {
    outcome: "updated",
    request: adminRequest({ updatedAt: now }),
  };

  async submit(input: SubmitRepositoryInput): Promise<SubmitRepositoryResult> {
    this.submissions.push(input);
    return this.submitResult;
  }

  async recordAcknowledgement(
    id: string,
    outcome: AcknowledgementOutcome,
  ): Promise<void> {
    this.acknowledgements.push({ id, outcome });
  }

  async getAdminSnapshot(actorTime: Date, filters: unknown) {
    this.adminSnapshotCalls.push({ actorTime, filters });
    return emptySnapshot;
  }

  async getAdminRequest(id: string) {
    return this.request?.id === id ? this.request : null;
  }

  async getCandidateType(id: string) {
    return id === candidateId ? this.candidateType : null;
  }

  async applyAdminMutation(input: AtomicAdminMutation) {
    this.mutations.push(input);
    return this.mutationResult;
  }
}

class MemorySender implements AcknowledgementSender {
  deliveries: Array<{ email: string; profileUrl: string }> = [];
  outcome: AcknowledgementOutcome = { status: "sent" };
  error: Error | null = null;

  async sendAcknowledgement(delivery: {
    email: string;
    profileUrl: string;
  }): Promise<AcknowledgementOutcome> {
    this.deliveries.push(delivery);
    if (this.error) throw this.error;
    return this.outcome;
  }
}

function createService(
  repository: MemoryRepository,
  sender = new MemorySender(),
) {
  return {
    sender,
    service: createOpportunityBriefService({
      repository,
      acknowledgementSender: sender,
      adminEmails: [" admin@example.com ", "ADMIN@example.com"],
      now: () => now,
    }),
  };
}

describe("opportunity brief public submission service", () => {
  it("validates and passes only normalized submission data to persistence", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);

    const result = await service.submit(submission(), "opaque-requester-hash");

    expect(repository.submissions).toEqual([
      {
        participantType: "company",
        profileUrl: "https://example.com/Creators/Ada",
        email: "founder@example.com",
        phoneNumber: "+919876543210",
        openToText: "Podcast swaps and live events",
        source: "bengaluru-meetup",
        utm: { source: "meetup", campaign: "launch" },
        requesterHash: "opaque-requester-hash",
        submittedAt: now,
        candidateIdentifier: {
          kind: "canonical",
          value: "https://example.com/Creators/Ada",
        },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      requestId,
      status: "submitted",
      submission: {
        participantType: "company",
        profileUrl: "https://example.com/Creators/Ada",
        email: "founder@example.com",
        phoneNumber: "+919876543210",
        openToText: "Podcast swaps and live events",
        source: "bengaluru-meetup",
        utm: { source: "meetup", campaign: "launch" },
      },
    });
  });

  it.each([candidateId, null])(
    "accepts repository candidate linkage %s without exposing it publicly",
    async (linkedCandidateId) => {
      const repository = new MemoryRepository();
      repository.submitResult = acceptedSubmitResult({
        linkedCandidateId,
        acknowledgement: { status: "pending", shouldSend: false },
      });
      const { service } = createService(repository);

      const result = await service.submit(submission(), "requester-hash");

      expect(result).toMatchObject({ ok: true, requestId, status: "submitted" });
      expect(JSON.stringify(result)).not.toContain("linkedCandidateId");
      expect(JSON.stringify(result)).not.toContain(candidateId);
    },
  );

  it("forms merged confirmations from the current submission, never stored contacts", async () => {
    const repository = new MemoryRepository();
    repository.submitResult = {
      ...acceptedSubmitResult({
        persistence: "merged",
        acknowledgement: { status: "sent", shouldSend: false },
      }),
      storedEmail: "private-stored@example.com",
      storedPhoneNumber: "+12025550123",
      requesterHash: "private-hash",
      acknowledgementError: "private transport detail",
      adminNotes: "private note",
    } as unknown as SubmitRepositoryResult;
    const { service } = createService(repository);

    const result = await service.submit(
      submission({ email: "current@example.com", phoneNumber: "" }),
      "requester-hash",
    );

    expect(result).toMatchObject({
      ok: true,
      submission: {
        email: "current@example.com",
        phoneNumber: null,
      },
    });
    const publicJson = JSON.stringify(result);
    for (const privateValue of [
      "private-stored@example.com",
      "+12025550123",
      "private-hash",
      "private transport detail",
      "private note",
      "persistence",
      "acknowledgement",
    ]) {
      expect(publicJson).not.toContain(privateValue);
    }
  });

  it("rejects validation and honeypot failures before persistence or email", async () => {
    const repository = new MemoryRepository();
    const { service, sender } = createService(repository);

    const invalid = await service.submit(
      submission({ email: "", phoneNumber: "" }),
      "requester-hash",
    );
    const honeypot = await service.submit(
      submission({ website: "spam.example" }),
      "requester-hash",
    );

    expect(invalid).toMatchObject({ ok: false, status: 400, errors: { email: expect.any(String) } });
    expect(honeypot).toMatchObject({ ok: false, status: 400, errors: { website: expect.any(String) } });
    expect(repository.submissions).toHaveLength(0);
    expect(sender.deliveries).toHaveLength(0);
  });

  it("maps the ninth valid persisted attempt to a safe 429", async () => {
    const repository = new MemoryRepository();
    repository.submitResult = { outcome: "rate_limited" };
    const { service, sender } = createService(repository);

    const result = await service.submit(submission(), "requester-hash");

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "Too many submission attempts. Try again later.",
    });
    expect(sender.deliveries).toHaveLength(0);
  });

  it("maps unexpected repository failures without leaking details", async () => {
    const repository = new MemoryRepository();
    repository.submit = async () => {
      throw new Error("postgresql://secret@database/private");
    };
    const { service } = createService(repository);

    const result = await service.submit(submission(), "requester-hash");

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "We could not save your request. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("opportunity brief acknowledgement orchestration", () => {
  it("sends a new email once after persistence and records sent", async () => {
    const repository = new MemoryRepository();
    const { service, sender } = createService(repository);

    const result = await service.submit(submission(), "requester-hash");

    expect(result).toMatchObject({ ok: true });
    expect(repository.submissions).toHaveLength(1);
    expect(sender.deliveries).toEqual([
      {
        email: "founder@example.com",
        profileUrl: "https://example.com/Creators/Ada",
      },
    ]);
    expect(repository.acknowledgements).toEqual([
      { id: requestId, outcome: { status: "sent", at: now } },
    ]);
  });

  it("does not resend a same-email repeat", async () => {
    const repository = new MemoryRepository();
    repository.submitResult = acceptedSubmitResult({
      persistence: "merged",
      acknowledgement: { status: "sent", shouldSend: false },
    });
    const { service, sender } = createService(repository);

    await service.submit(submission(), "requester-hash");

    expect(sender.deliveries).toHaveLength(0);
    expect(repository.acknowledgements).toHaveLength(0);
  });

  it.each(["added@example.com", "replacement@example.com"])(
    "sends once when a repeat adds or replaces email with %s",
    async (email) => {
      const repository = new MemoryRepository();
      repository.submitResult = acceptedSubmitResult({
        persistence: "merged",
        acknowledgement: { status: "pending", shouldSend: true },
      });
      const { service, sender } = createService(repository);

      await service.submit(
        submission({ email, phoneNumber: "+919876543210" }),
        "requester-hash",
      );

      expect(sender.deliveries).toEqual([
        { email, profileUrl: "https://example.com/Creators/Ada" },
      ]);
      expect(repository.acknowledgements).toHaveLength(1);
    },
  );

  it("keeps WhatsApp-only acknowledgement not_requested and skips email", async () => {
    const repository = new MemoryRepository();
    repository.submitResult = acceptedSubmitResult({
      acknowledgement: { status: "not_requested", shouldSend: false },
    });
    const { service, sender } = createService(repository);

    const result = await service.submit(
      submission({ email: "", phoneNumber: "+919876543210" }),
      "requester-hash",
    );

    expect(result).toMatchObject({
      ok: true,
      submission: { email: null, phoneNumber: "+919876543210" },
    });
    expect(sender.deliveries).toHaveLength(0);
    expect(repository.acknowledgements).toHaveLength(0);
  });

  it.each([
    [{ status: "failed", error: "Resend rejected the acknowledgement (503)." }],
    [{ status: "pending" }],
  ] as const)("records sender outcome %o while preserving public success", async (outcome) => {
    const repository = new MemoryRepository();
    const { service, sender } = createService(repository);
    sender.outcome = outcome;

    const result = await service.submit(submission(), "requester-hash");

    expect(result).toMatchObject({ ok: true, requestId });
    expect(repository.acknowledgements).toEqual([
      { id: requestId, outcome },
    ]);
  });

  it("keeps durable submission successful when transport throws", async () => {
    const repository = new MemoryRepository();
    const { service, sender } = createService(repository);
    sender.error = new Error("network credentials and transport detail");

    const result = await service.submit(submission(), "requester-hash");

    expect(result).toMatchObject({ ok: true, requestId });
    expect(repository.acknowledgements).toEqual([
      {
        id: requestId,
        outcome: {
          status: "failed",
          error: "Acknowledgement delivery failed unexpectedly.",
        },
      },
    ]);
  });
});

describe("opportunity brief administrator service", () => {
  const administrator = { userId: "admin-id", email: " ADMIN@example.com " };
  const member = { userId: "member-id", email: "member@example.com" };

  it("authorizes a trimmed case-insensitive allowlist and rejects others before reads", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);

    expect(service.isAdministrator(administrator)).toBe(true);
    expect(service.isAdministrator(member)).toBe(false);
    await expect(service.getAdminSnapshot(administrator, {})).resolves.toEqual({
      ok: true,
      snapshot: emptySnapshot,
    });
    await expect(service.getAdminSnapshot(member, {})).resolves.toEqual({
      ok: false,
      status: 403,
      error: "Administrator access is required.",
    });
    expect(repository.adminSnapshotCalls).toEqual([
      { actorTime: now, filters: {} },
    ]);
  });

  it("enforces the domain status graph before an optimistic mutation", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);

    const allowed = await service.updateStatus(administrator, requestId, {
      status: "researching",
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });
    const rejected = await service.updateStatus(administrator, requestId, {
      status: "converted",
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });

    expect(allowed).toMatchObject({ ok: true });
    expect(repository.mutations[0]).toEqual({
      kind: "status",
      requestId,
      status: "researching",
      expectedStatus: "submitted",
      expectedUpdatedAt,
      updatedAt: now,
    });
    expect(rejected).toEqual({
      ok: false,
      status: 409,
      error: "That Opportunity Brief status transition is not allowed.",
    });
    expect(repository.mutations).toHaveLength(1);
  });

  it("maps optimistic status conflicts to 409", async () => {
    const repository = new MemoryRepository();
    repository.mutationResult = {
      outcome: "conflict",
      request: adminRequest({ status: "rejected", updatedAt: now }),
    };
    const { service } = createService(repository);

    const result = await service.updateStatus(administrator, requestId, {
      status: "researching",
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      request: { status: "rejected" },
    });
  });

  it("returns 404 for a missing request before an administrator mutation", async () => {
    const repository = new MemoryRepository();
    repository.request = null;
    const { service } = createService(repository);

    const result = await service.updateStatus(administrator, requestId, {
      status: "researching",
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Opportunity Brief request was not found.",
    });
    expect(repository.mutations).toHaveLength(0);
  });

  it("rejects a missing or mismatched candidate before linking", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);
    repository.candidateType = null;

    expect(
      await service.linkCandidate(administrator, requestId, {
        candidateId,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).toEqual({
      ok: false,
      status: 404,
      error: "Discovery candidate was not found.",
    });

    repository.candidateType = "creator";
    expect(
      await service.linkCandidate(administrator, requestId, {
        candidateId,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "Discovery candidate type does not match the request participant type.",
    });
    expect(repository.mutations).toHaveLength(0);
  });

  it("links and unlinks candidates with the client timestamp guard", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);

    await expect(
      service.linkCandidate(administrator, requestId, {
        candidateId,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      service.unlinkCandidate(administrator, requestId, {
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(repository.mutations).toEqual([
      {
        kind: "candidate",
        requestId,
        candidateId,
        expectedUpdatedAt,
        updatedAt: now,
      },
      {
        kind: "candidate",
        requestId,
        candidateId: null,
        expectedUpdatedAt,
        updatedAt: now,
      },
    ]);
  });

  it("updates trimmed notes with the same optimistic guard", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);

    await expect(
      service.updateNotes(administrator, requestId, {
        notes: "  Prioritise Bengaluru brand partnerships.  ",
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(repository.mutations).toEqual([
      {
        kind: "notes",
        requestId,
        notes: "Prioritise Bengaluru brand partnerships.",
        expectedUpdatedAt,
        updatedAt: now,
      },
    ]);
  });

  it("rejects malformed candidate and timestamp inputs before repository mutation", async () => {
    const repository = new MemoryRepository();
    const { service } = createService(repository);

    const result = await service.linkCandidate(administrator, requestId, {
      candidateId: "not-a-uuid",
      expectedUpdatedAt: "yesterday",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      errors: {
        candidateId: expect.any(String),
        expectedUpdatedAt: expect.any(String),
      },
    });
    expect(repository.mutations).toHaveLength(0);
  });
});
