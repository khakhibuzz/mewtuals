import { describe, expect, it, vi } from "vitest";

import { createApplicationPostHandler } from "../app/server/application-route";
import { createApplicationService } from "../app/server/application-service";
import type {
  FormNotificationManager,
  FormSubmissionRepository,
  StoredFormSubmission,
} from "../app/server/form-notification-contracts";

const id = "b1ff1525-4d36-4ed1-a152-4f0ab8e8cb78";
const now = new Date("2026-11-19T10:00:00Z");
const normalizedApplication = {
  companyUrl: "https://example.com/",
  workEmail: "owner@example.com",
  phone: "+918872052031",
};
const stored: StoredFormSubmission = {
  id,
  form: "apply",
  payloadHash: "hash",
  payload: normalizedApplication,
  message: {
    from: "login@mewtuals.com",
    to: "keshav@mewtuals.com",
    subject: "Application",
    text: "Test",
    html: "<p>Test</p>",
  },
  createdAt: now,
  requesterHash: "opaque",
  requestId: null,
  status: null,
  firstAttemptAt: null,
  acceptedAt: null,
  providerMessageId: null,
  lastError: null,
  attemptCount: 0,
};
const body = {
  companyUrl: "example.com",
  workEmail: "OWNER@example.com",
  phone: "+91 8872052031",
  website: "",
};

function setup() {
  const repository: FormSubmissionRepository = {
    saveApplication: vi.fn(async () => ({
      outcome: "accepted" as const,
      submission: stored,
    })),
    startAttempt: vi.fn(),
    recordAccepted: vi.fn(),
    recordFailure: vi.fn(),
    listPending: vi.fn(),
  };
  const notifications: FormNotificationManager = {
    prepare: vi.fn(() => stored),
    deliver: vi.fn(async () => ({ ok: true as const })),
  };
  const service = createApplicationService({
    repository,
    notifications,
    now: () => now,
  });
  return { repository, notifications, service };
}

describe("representation application service", () => {
  it("validates and durably saves the normalized application before owner delivery", async () => {
    const { repository, notifications, service } = setup();

    expect(await service.submit(body, "opaque", id)).toEqual({ ok: true });
    expect(notifications.prepare).toHaveBeenCalledWith(
      "apply", id, normalizedApplication, now,
    );
    expect(repository.saveApplication).toHaveBeenCalledWith(stored, "opaque");
    expect(notifications.deliver).toHaveBeenCalledWith(stored);
    expect(vi.mocked(repository.saveApplication).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(notifications.deliver).mock.invocationCallOrder[0]);
  });

  it.each([
    null,
    { ...body, workEmail: 5 },
    { ...body, website: "spam" },
    { ...body, extra: "unapproved" },
  ])("rejects invalid runtime input before saving", async (input) => {
    const { repository, service } = setup();

    expect(await service.submit(input, "opaque", id))
      .toMatchObject({ ok: false, status: 400 });
    expect(repository.saveApplication).not.toHaveBeenCalled();
  });

  it("returns a field error for consecutive email dots before preparing a notification", async () => {
    const { repository, notifications, service } = setup();

    expect(await service.submit({ ...body, workEmail: "a..b@example.com" }, "opaque", id))
      .toMatchObject({
        ok: false,
        status: 400,
        errors: { workEmail: "Enter a valid work email." },
      });
    expect(notifications.prepare).not.toHaveBeenCalled();
    expect(repository.saveApplication).not.toHaveBeenCalled();
    expect(notifications.deliver).not.toHaveBeenCalled();
  });

  it.each([
    ["rate_limited", 429],
    ["idempotency_conflict", 409],
  ] as const)("does not send on %s", async (outcome, status) => {
    const { repository, notifications, service } = setup();
    vi.mocked(repository.saveApplication).mockResolvedValue({ outcome });

    expect(await service.submit(body, "opaque", id))
      .toMatchObject({ ok: false, status });
    expect(notifications.deliver).not.toHaveBeenCalled();
  });

  it("keeps an email failure distinct from a save failure", async () => {
    const { notifications, service } = setup();
    vi.mocked(notifications.deliver).mockResolvedValue({
      ok: false,
      error: "Your details are saved, but we couldn’t email Keshav yet. Please try again.",
      reconciliationNeeded: false,
    });

    expect(await service.submit(body, "opaque", id)).toMatchObject({
      ok: false,
      status: 503,
      error: expect.stringContaining("saved"),
    });
  });

  it("does not expose database errors or send if persistence failed", async () => {
    const { repository, notifications, service } = setup();
    vi.mocked(repository.saveApplication).mockRejectedValue(new Error("private-db-secret"));

    expect(await service.submit(body, "opaque", id)).toMatchObject({
      ok: false,
      status: 500,
      error: "We could not save your application. Please try again.",
    });
    expect(notifications.deliver).not.toHaveBeenCalled();
  });
});

describe("application route", () => {
  function request(headers: Record<string, string> = {}, value: unknown = body) {
    return new Request("https://mewtuals.com/api/applications", {
      method: "POST",
      headers: {
        Origin: "https://mewtuals.com",
        "Content-Type": "application/json",
        "Idempotency-Key": id,
        ...headers,
      },
      body: JSON.stringify(value),
    });
  }

  function handler() {
    const submit = vi.fn(async () => ({ ok: true as const }));
    return {
      submit,
      post: createApplicationPostHandler({
        environment: "test",
        sessionSecret: "test-secret-with-more-than-thirty-two-characters",
        submit,
      }),
    };
  }

  it("forwards a valid retry ID and protects the public response", async () => {
    const { submit, post } = handler();
    const response = await post(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(submit).toHaveBeenCalledWith(
      body, expect.stringMatching(/^[a-f0-9]{64}$/), id,
    );
  });

  it.each([
    [{ Origin: "https://attacker.example" }, 403],
    [{ "Content-Type": "text/plain" }, 415],
    [{ "Idempotency-Key": "bad" }, 400],
  ] as const)("rejects unsafe request %j", async (headers, status) => {
    const { submit, post } = handler();

    expect((await post(request(headers))).status).toBe(status);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an oversized body and honeypot without saving", async () => {
    const { post, submit } = handler();

    expect((await post(request({}, { ...body, website: "spam" }))).status).toBe(400);
    expect((await post(request({}, { ...body, companyUrl: "x".repeat(20_000) }))).status).toBe(413);
    expect(submit).not.toHaveBeenCalled();
  });
});
