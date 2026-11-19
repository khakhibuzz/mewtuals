import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplicationService } from "../app/server/application-service";
import type { ServerEnvironment } from "../app/server/env";
import { getFormNotificationDependencies } from "../app/server/form-notification-composition";
import type { FormSubmissionRepository, StoredFormSubmission } from "../app/server/form-notification-contracts";
import { createFormSubmissionRepository } from "../db/repositories/form-submission-repository";

vi.mock("../db/repositories/form-submission-repository", () => ({
  createFormSubmissionRepository: vi.fn(),
}));

const submissionId = "bf48e379-78d6-44ec-a8f6-e31b2fa3f53c";
const providerMessageId = "166a115f-df79-4d7a-a9c3-e7f78322b886";
const submittedAt = new Date("2026-11-19T10:00:00.000Z");
const application = {
  companyUrl: "https://example.com/",
  workEmail: "visitor@example.com",
  phone: "+918872052031",
  website: "",
};

function setup(overrides: Partial<ServerEnvironment>, requestUrl?: string) {
  let saved: StoredFormSubmission | undefined;
  const repository: FormSubmissionRepository = {
    saveApplication: vi.fn<FormSubmissionRepository["saveApplication"]>(async (input, requesterHash) => {
      const submission: StoredFormSubmission = {
        ...input,
        requesterHash,
        requestId: null,
        status: null,
        firstAttemptAt: null,
        acceptedAt: null,
        providerMessageId: null,
        lastError: null,
        attemptCount: 0,
      };
      saved = submission;
      return { outcome: "accepted", submission };
    }),
    startAttempt: vi.fn(async (_id, at) => {
      if (!saved) throw new Error("Expected a persisted submission.");
      saved = { ...saved, firstAttemptAt: saved.firstAttemptAt ?? at, attemptCount: saved.attemptCount + 1 };
      return saved;
    }),
    recordAccepted: vi.fn(async (_id, messageId, at) => {
      if (!saved) throw new Error("Expected a persisted submission.");
      saved = { ...saved, acceptedAt: at, providerMessageId: messageId, lastError: null };
    }),
    recordFailure: vi.fn(async (_id, error) => {
      if (saved && !saved.acceptedAt) saved = { ...saved, lastError: error };
    }),
    listPending: vi.fn(async () => saved && !saved.acceptedAt ? [saved] : []),
  };
  vi.mocked(createFormSubmissionRepository).mockReturnValue(repository);
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ id: providerMessageId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetch);
  const environment: ServerEnvironment = {
    environment: "development",
    sessionSecret: "composition-test-secret-longer-than-thirty-two-characters",
    emailFrom: "Mewtuals <notifications@mewtuals.com>",
    adminEmails: [],
    developmentAuthEnabled: true,
    ...overrides,
  };
  const dependencies = getFormNotificationDependencies(undefined, environment, requestUrl);
  const service = createApplicationService({ ...dependencies, now: () => submittedAt });
  return { repository, fetch, service, saved: () => saved };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("form notification composition", () => {
  it.each([
    "http://localhost:4000/api/applications",
    "http://127.0.0.1:4000/api/applications",
    "http://[::1]:4000/api/applications",
  ])("simulates delivery only for explicitly enabled local development at %s", async (url) => {
    const context = setup({ emailFrom: undefined }, url);
    expect(await context.service.submit(application, "requester", submissionId)).toEqual({ ok: true });
    expect(context.repository.saveApplication).toHaveBeenCalledTimes(1);
    expect(context.repository.recordAccepted).toHaveBeenCalledWith(submissionId, submissionId, expect.any(Date));
    expect(context.saved()?.message.from).toBe("Mewtuals development <notifications@example.test>");
    expect(context.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { name: "production loopback", environment: "production" as const, developmentAuthEnabled: true, url: "http://localhost:4000/api/applications" },
    { name: "production site", environment: "production" as const, developmentAuthEnabled: true, url: "https://mewtuals.com/api/applications" },
    { name: "development public site", environment: "development" as const, developmentAuthEnabled: true, url: "https://mewtuals.com/api/applications" },
    { name: "disabled local shortcut", environment: "development" as const, developmentAuthEnabled: false, url: "http://localhost:4000/api/applications" },
    { name: "loopback-like public hostname", environment: "development" as const, developmentAuthEnabled: true, url: "https://localhost.attacker.example/api/applications" },
    { name: "missing request origin", environment: "development" as const, developmentAuthEnabled: true, url: undefined },
  ])("does not fabricate acceptance for $name without a Resend key", async ({ environment, developmentAuthEnabled, url }) => {
    const context = setup({ environment, developmentAuthEnabled }, url);
    expect(await context.service.submit(application, "requester", submissionId)).toMatchObject({ ok: false, status: 503 });
    expect(context.repository.saveApplication).toHaveBeenCalledTimes(1);
    expect(context.repository.recordAccepted).not.toHaveBeenCalled();
    expect(context.saved()?.acceptedAt).toBeNull();
    expect(context.fetch).not.toHaveBeenCalled();
  });

  it("uses real transport whenever credentials exist, even with the local shortcut enabled", async () => {
    const context = setup({ resendApiKey: "re_composition_test" }, "http://localhost:4000/api/applications");
    expect(await context.service.submit(application, "requester", submissionId)).toEqual({ ok: true });
    expect(context.fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer re_composition_test" }),
    }));
    expect(context.repository.recordAccepted).toHaveBeenCalledWith(submissionId, providerMessageId, expect.any(Date));
    expect(context.saved()?.providerMessageId).toBe(providerMessageId);
  });

  it("does not fall back to simulated acceptance when configured real transport rejects delivery", async () => {
    const context = setup({ resendApiKey: "re_composition_test" }, "http://localhost:4000/api/applications");
    context.fetch.mockResolvedValueOnce(new Response("Rejected", { status: 503 }));
    expect(await context.service.submit(application, "requester", submissionId)).toMatchObject({ ok: false, status: 503 });
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.repository.recordAccepted).not.toHaveBeenCalled();
  });

  it.each([undefined, "re_composition_test"])("refuses a production submission with no sender identity before persistence (key: %s)", async (resendApiKey) => {
    const context = setup({ environment: "production", emailFrom: undefined, resendApiKey }, "https://mewtuals.com/api/applications");
    expect(await context.service.submit(application, "requester", submissionId)).toMatchObject({ ok: false, status: 500 });
    expect(context.repository.saveApplication).not.toHaveBeenCalled();
    expect(context.repository.startAttempt).not.toHaveBeenCalled();
    expect(context.repository.recordAccepted).not.toHaveBeenCalled();
    expect(context.fetch).not.toHaveBeenCalled();
  });
});
