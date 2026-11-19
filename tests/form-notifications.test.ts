import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  FormNotificationSender,
  FormSubmissionPayload,
  FormSubmissionRepository,
  NewFormSubmission,
  StoredFormSubmission,
} from "../app/server/form-notification-contracts";
import {
  createFormNotificationManager,
  createResendFormNotificationSender,
  FORM_NOTIFICATION_TIMEOUT_MS,
} from "../app/server/form-notifications";

const id = "166a115f-df79-4d7a-a9c3-e7f78322b886";
const providerMessageId = "bf48e379-78d6-44ec-a8f6-e31b2fa3f53c";
const at = new Date("2026-11-19T10:00:00.000Z");
const from = "Mewtuals <hello@mewtuals.com>";
const application = {
  companyUrl: "https://example.com/",
  workEmail: "visitor@example.com",
  phone: "+918872052031",
};
const brief = {
  participantType: "creator",
  profileUrl: "https://example.com/creator",
  email: "creator@example.com",
  phoneNumber: "+919876543210",
  openToText: "Manufacturing & robotics <research>\nLet's talk.",
  source: "factory-pilot",
  utm: { source: "site", medium: "link", campaign: "pilot", term: "robot", content: "footer" },
};

function stored(input: NewFormSubmission): StoredFormSubmission {
  return {
    ...input,
    requesterHash: "requester-hash",
    requestId: null,
    status: null,
    firstAttemptAt: null,
    acceptedAt: null,
    providerMessageId: null,
    lastError: null,
    attemptCount: 0,
  };
}

function fixture(sender?: FormNotificationSender) {
  let current: StoredFormSubmission;
  const repository: FormSubmissionRepository = {
    saveApplication: vi.fn(async (input) => {
      current = stored(input);
      return { outcome: "accepted" as const, submission: current };
    }),
    startAttempt: vi.fn(async (_id, time) => {
      if (!current.acceptedAt) {
        current = {
          ...current,
          firstAttemptAt: current.firstAttemptAt ?? time,
          attemptCount: current.attemptCount + 1,
        };
      }
      return current;
    }),
    recordAccepted: vi.fn(async (_id, messageId, time) => {
      current = { ...current, acceptedAt: time, providerMessageId: messageId, lastError: null };
    }),
    recordFailure: vi.fn(async (_id, error) => {
      if (!current.acceptedAt) current = { ...current, lastError: error };
    }),
    listPending: vi.fn(async () => current.acceptedAt ? [] : [current]),
  };
  const delivery = sender ?? {
    send: vi.fn(async () => ({ ok: true as const, providerMessageId })),
  };
  const manager = createFormNotificationManager({ repository, sender: delivery, from, now: () => at });
  current = stored(manager.prepare("apply", id, application, at));
  return {
    manager,
    repository,
    sender: delivery,
    get current() { return current; },
    replace(value: StoredFormSubmission) { current = value; },
  };
}

function captureTransport(responses: Array<Response | Error>) {
  const requests: Array<{ input: string; init: RequestInit }> = [];
  const sender = createResendFormNotificationSender({
    apiKey: "re_test_key",
    fetch: async (input, init) => {
      requests.push({ input: String(input), init: init ?? {} });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("No test response");
      return response;
    },
  });
  return { sender, requests };
}

function acceptedResponse() {
  return new Response(JSON.stringify({ id: providerMessageId }), { status: 200 });
}

afterEach(() => vi.useRealTimers());

describe("immutable form notification snapshots", () => {
  it("includes every application field, tracking value and submission time", () => {
    const { manager } = fixture();
    const submission = manager.prepare("apply", id, {
      ...application,
      source: "factory-pilot",
      utm: brief.utm,
    }, at);
    expect(submission.message).toMatchObject({
      from,
      to: "keshav@mewtuals.com",
      replyTo: "visitor@example.com",
      subject: "Mewtuals: New representation application",
    });
    for (const value of [...Object.values(application), "factory-pilot", ...Object.values(brief.utm), at.toISOString(), id, "/apply"]) {
      expect(submission.message.text).toContain(value);
      expect(submission.message.html).toContain(value);
    }
    expect(submission.message.text).toContain("Company URL:");
    expect(submission.message.text).toContain("Work email:");
    expect(submission.message.text).toContain("Phone number:");
  });

  it("distinguishes Opportunity Briefs and escapes their free text", () => {
    const { manager } = fixture();
    const submission = manager.prepare("join", id, brief, at);
    expect(submission.message.subject).toBe("Mewtuals: New Opportunity Brief submission");
    expect(submission.message.replyTo).toBe(brief.email);
    for (const value of ["/join", brief.participantType, brief.profileUrl, brief.email, brief.phoneNumber, brief.openToText, brief.source, ...Object.values(brief.utm)]) {
      expect(submission.message.text).toContain(value);
    }
    expect(submission.message.html).toContain("Manufacturing &amp; robotics &lt;research&gt;");
    expect(submission.message.html).toContain("Let&#39;s talk.");
    expect(submission.message.html).not.toContain("<research>");
  });

  it("keeps optional contact fields explicit without inventing a reply address", () => {
    const { manager } = fixture();
    const submission = manager.prepare("join", id, {
      participantType: "company", profileUrl: brief.profileUrl,
      email: null, phoneNumber: null, openToText: null, source: null, utm: {},
    }, at);
    expect(submission.message.replyTo).toBeUndefined();
    expect(submission.message.text).toContain("Email: Not supplied");
    expect(submission.message.text).toContain("WhatsApp number: Not supplied");
    expect(submission.message.text).toContain("Source: Not supplied");
    expect(submission.message.text).toContain("UTM campaign: Not supplied");
  });

  it("rejects invalid reply addresses and unexpected recipient fields", () => {
    const { manager } = fixture();
    expect(() => manager.prepare("apply", id, { ...application, workEmail: "visitor@example.com\r\nBcc: other@example.com" }, at)).toThrow();
    expect(() => manager.prepare("apply", id, { ...application, to: "other@example.com" }, at)).toThrow();
  });

  it("rejects missing sender configuration before preparing an unsendable snapshot", () => {
    const { repository, sender } = fixture();
    const manager = createFormNotificationManager({ repository, sender, from: "" });
    expect(() => manager.prepare("apply", id, application, at)).toThrow();
  });

  it("hashes normalized fields independently of key order or retry time", () => {
    const { manager } = fixture();
    const first = manager.prepare("join", id, brief, at);
    const reordered: FormSubmissionPayload = {
      utm: { content: "footer", term: "robot", campaign: "pilot", medium: "link", source: "site" },
      source: brief.source, openToText: brief.openToText, phoneNumber: brief.phoneNumber,
      email: brief.email, profileUrl: brief.profileUrl, participantType: brief.participantType,
    };
    expect(manager.prepare("join", id, reordered, new Date(at.getTime() + 1_000)).payloadHash).toBe(first.payloadHash);
    expect(manager.prepare("join", id, { ...brief, openToText: "Different request" }, at).payloadHash).not.toBe(first.payloadHash);
  });

  it("detaches the payload snapshot from caller mutation", () => {
    const { manager } = fixture();
    const payload = { ...brief, utm: { ...brief.utm } };
    const submission = manager.prepare("join", id, payload, at);
    payload.utm.source = "changed";
    payload.openToText = "changed";
    expect(submission.payload).toMatchObject({ openToText: brief.openToText, utm: brief.utm });
    expect(submission.message.text).not.toContain("changed");
  });
});

describe("Resend form notification transport", () => {
  it("sends the stored snapshot to the owner with a stable submission idempotency key", async () => {
    const { current } = fixture();
    const { sender, requests } = captureTransport([acceptedResponse(), acceptedResponse()]);
    await expect(sender.send(current)).resolves.toEqual({ ok: true, providerMessageId });
    await expect(sender.send(current)).resolves.toEqual({ ok: true, providerMessageId });
    expect(requests[0].input).toBe("https://api.resend.com/emails");
    expect(requests[0].init).toMatchObject({ method: "POST", headers: {
      Authorization: "Bearer re_test_key", "Content-Type": "application/json", "Idempotency-Key": `form-submission/${id}`,
    } });
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      from, to: ["keshav@mewtuals.com"], reply_to: application.workEmail,
      subject: current.message.subject, text: current.message.text, html: current.message.html,
    });
    expect(requests[1].init.body).toBe(requests[0].init.body);
    expect(requests[1].init.headers).toEqual(requests[0].init.headers);
  });

  it("omits reply_to when the visitor did not provide email", async () => {
    const { manager } = fixture();
    const submission = manager.prepare("join", id, { ...brief, email: null }, at);
    const { sender, requests } = captureTransport([acceptedResponse()]);
    await sender.send(submission);
    expect(JSON.parse(String(requests[0].init.body))).not.toHaveProperty("reply_to");
  });

  it.each([
    new Response("private rejection details", { status: 422 }),
    new Response("not json", { status: 200 }),
    new Response(JSON.stringify({}), { status: 200 }),
    new Response(JSON.stringify({ id: "" }), { status: 200 }),
    new Response(JSON.stringify({ id: "not-a-provider-id" }), { status: 200 }),
    new Error("private network detail"),
  ])("fails safely for rejected, malformed or unavailable responses", async (response) => {
    const { current } = fixture();
    const { sender } = captureTransport([response]);
    await expect(sender.send(current)).resolves.toEqual({ ok: false });
  });

  it("does not send without credentials or with a corrupted owner address", async () => {
    const { current } = fixture();
    const request = vi.fn();
    const sender = createResendFormNotificationSender({ fetch: request });
    await expect(sender.send(current)).resolves.toEqual({ ok: false });
    const configured = createResendFormNotificationSender({ apiKey: "re_test", fetch: request });
    await expect(configured.send({ ...current, message: { ...current.message, to: "other@example.com" } })).resolves.toEqual({ ok: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("aborts stalled headers and clears its five-second deadline", async () => {
    vi.useFakeTimers();
    const { current } = fixture();
    let signal: AbortSignal | null | undefined;
    const sender = createResendFormNotificationSender({ apiKey: "re_test", fetch: async (_input, init) => {
      signal = init?.signal;
      return new Promise<Response>(() => undefined);
    } });
    const pending = sender.send(current);
    await vi.advanceTimersByTimeAsync(FORM_NOTIFICATION_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled provider response body", async () => {
    vi.useFakeTimers();
    const { current } = fixture();
    const response = new Response("ignored", { status: 200 });
    vi.spyOn(response, "json").mockImplementation(() => new Promise(() => undefined));
    const { sender } = captureTransport([response]);
    const pending = sender.send(current);
    await vi.advanceTimersByTimeAsync(FORM_NOTIFICATION_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("durable notification delivery", () => {
  it("records the attempt before sending and acceptance before returning success", async () => {
    const events: string[] = [];
    const context = fixture({ send: async () => { events.push("send"); return { ok: true, providerMessageId }; } });
    vi.mocked(context.repository.startAttempt).mockImplementation(async () => { events.push("attempt"); return { ...context.current, firstAttemptAt: at }; });
    vi.mocked(context.repository.recordAccepted).mockImplementation(async () => { events.push("accepted"); });
    await expect(context.manager.deliver(context.current)).resolves.toEqual({ ok: true });
    expect(events).toEqual(["attempt", "send", "accepted"]);
    expect(context.repository.recordAccepted).toHaveBeenCalledWith(id, providerMessageId, at);
  });

  it("does not resend a previously accepted notification", async () => {
    const context = fixture();
    context.replace({ ...context.current, acceptedAt: at, providerMessageId });
    await expect(context.manager.deliver(context.current)).resolves.toEqual({ ok: true });
    expect(context.sender.send).not.toHaveBeenCalled();
    expect(context.repository.startAttempt).not.toHaveBeenCalled();
  });

  it("notices acceptance by a concurrent attempt before sending", async () => {
    const context = fixture();
    const stale = context.current;
    context.replace({ ...context.current, acceptedAt: at, providerMessageId });
    await expect(context.manager.deliver(stale)).resolves.toEqual({ ok: true });
    expect(context.sender.send).not.toHaveBeenCalled();
  });

  it("uses the saved message rather than a freshly prepared retry snapshot", async () => {
    const transport = captureTransport([new Error("unknown result"), acceptedResponse()]);
    const context = fixture(transport.sender);
    await expect(context.manager.deliver(context.current)).resolves.toMatchObject({ ok: false, reconciliationNeeded: false });
    const retry = stored(context.manager.prepare("apply", id, application, new Date(at.getTime() + 2_000)));
    await expect(context.manager.deliver(retry)).resolves.toEqual({ ok: true });
    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0].init.body).toBe(transport.requests[1].init.body);
    expect(transport.requests[0].init.headers).toEqual(transport.requests[1].init.headers);
  });

  it("reports acceptance-recording failure and retries without a duplicate provider send", async () => {
    const deliveries = new Map<string, string>();
    let requests = 0;
    const transport = createResendFormNotificationSender({ apiKey: "re_test", fetch: async (_input, init) => {
      requests++;
      const key = new Headers(init?.headers).get("Idempotency-Key")!;
      const body = String(init?.body);
      if (deliveries.has(key)) expect(deliveries.get(key)).toBe(body);
      else deliveries.set(key, body);
      return acceptedResponse();
    } });
    const context = fixture(transport);
    vi.mocked(context.repository.recordAccepted).mockRejectedValueOnce(new Error("secret database connection"));
    await expect(context.manager.deliver(context.current)).resolves.toMatchObject({ ok: false, reconciliationNeeded: false });
    await expect(context.manager.deliver(context.current)).resolves.toEqual({ ok: true });
    expect(requests).toBe(2);
    expect(deliveries.size).toBe(1);
    expect(context.current.providerMessageId).toBe(providerMessageId);
  });

  it("does not send when the durable attempt cannot be recorded", async () => {
    const context = fixture();
    vi.mocked(context.repository.startAttempt).mockRejectedValueOnce(new Error("private database detail"));
    const result = await context.manager.deliver(context.current);
    expect(result).toMatchObject({ ok: false });
    expect(context.sender.send).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });

  it("retains failure even when failure recording also fails", async () => {
    const context = fixture({ send: async () => { throw new Error("private provider detail"); } });
    vi.mocked(context.repository.recordFailure).mockRejectedValueOnce(new Error("private database detail"));
    const result = await context.manager.deliver(context.current);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/private|provider|database/);
  });

  it("requires reconciliation after the 24-hour idempotency window", async () => {
    const context = fixture();
    context.replace({ ...context.current, firstAttemptAt: new Date(at.getTime() - 24 * 60 * 60 * 1_000) });
    await expect(context.manager.deliver(context.current)).resolves.toMatchObject({ ok: false, reconciliationNeeded: true });
    expect(context.sender.send).not.toHaveBeenCalled();
    expect(context.repository.startAttempt).not.toHaveBeenCalled();
  });

  it("reserves the transport deadline before the idempotency window expires", async () => {
    const context = fixture();
    context.replace({ ...context.current, firstAttemptAt: new Date(at.getTime() - 24 * 60 * 60 * 1_000 + FORM_NOTIFICATION_TIMEOUT_MS - 1) });
    await expect(context.manager.deliver(context.current)).resolves.toMatchObject({ ok: false, reconciliationNeeded: true });
    expect(context.sender.send).not.toHaveBeenCalled();
  });

  it("checks the authoritative first attempt before a concurrent retry", async () => {
    const context = fixture();
    const stale = context.current;
    context.replace({ ...context.current, firstAttemptAt: new Date(at.getTime() - 24 * 60 * 60 * 1_000) });
    await expect(context.manager.deliver(stale)).resolves.toMatchObject({ ok: false, reconciliationNeeded: true });
    expect(context.sender.send).not.toHaveBeenCalled();
  });
});
