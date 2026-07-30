import { describe, expect, it, vi } from "vitest";

import {
  createOpportunityBriefPostHandler,
  requesterHashForOpportunityBrief,
} from "../app/server/opportunity-brief-route";
import type { PublicSubmissionResult } from "../app/server/opportunity-brief-service";

const SESSION_SECRET = "route-test-session-secret-that-is-at-least-32-characters";
const endpoint = "https://mewtuals.com/api/opportunity-briefs";

const validBody = {
  participantType: "company",
  profileUrl: "https://example.com",
  email: "founder@example.com",
  phoneNumber: "",
  openToText: "Distribution partnerships",
  source: "bengaluru-meetup",
  utm: { source: "meetup", campaign: "launch" },
  website: "",
};

function acceptedResult(): PublicSubmissionResult {
  return {
    ok: true,
    requestId: "00000000-0000-4000-8000-000000000101",
    status: "submitted",
    submission: {
      participantType: "company",
      profileUrl: "https://example.com/",
      email: "founder@example.com",
      phoneNumber: null,
      openToText: "Distribution partnerships",
      source: "bengaluru-meetup",
      utm: { source: "meetup", campaign: "launch" },
    },
  };
}

function createHandler(
  submit = vi.fn(async (): Promise<PublicSubmissionResult> => acceptedResult()),
) {
  return {
    handler: createOpportunityBriefPostHandler({
      environment: "test",
      sessionSecret: SESSION_SECRET,
      submit,
    }),
    submit,
  };
}

function jsonRequest(
  body: string = JSON.stringify(validBody),
  headers: Record<string, string> = {},
) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://mewtuals.com",
      ...headers,
    },
    body,
  });
}

describe("opportunity brief public route", () => {
  it("rejects requests without a matching origin before submission", async () => {
    const { handler, submit } = createHandler();

    const response = await handler(
      new Request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Request origin does not match this site.",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires an application/json content type", async () => {
    const { handler, submit } = createHandler();

    const response = await handler(
      new Request(endpoint, {
        method: "POST",
        headers: { Origin: "https://mewtuals.com", "Content-Type": "text/plain" },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(415);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a declared body over 16 KiB without reading it", async () => {
    const { handler, submit } = createHandler();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
      },
      cancel() {
        cancelled = true;
      },
    });

    const response = await handler(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(16 * 1_024 + 1),
          Origin: "https://mewtuals.com",
        },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("stops and rejects an oversized stream without Content-Length", async () => {
    const { handler, submit } = createHandler();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16 * 1_024));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://mewtuals.com",
      },
      body: stream,
      duplex: "half",
    } as RequestInit);

    const response = await handler(request);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("maps an erroring request stream to safe JSON and releases its reader", async () => {
    const { handler, submit } = createHandler();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(
          new Error("private client abort and transport implementation detail"),
        );
      },
    });
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://mewtuals.com",
      },
      body: stream,
      duplex: "half",
    } as RequestInit);

    const response = await handler(request);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result).toEqual({ ok: false, error: "Submit valid JSON." });
    expect(JSON.stringify(result)).not.toMatch(/private|abort|transport/i);
    expect(stream.locked).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("returns a safe malformed-JSON response", async () => {
    const { handler, submit } = createHandler();

    const response = await handler(jsonRequest("{not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Submit valid JSON.",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("silently rejects a filled honeypot without persistence or strategy leakage", async () => {
    const { handler, submit } = createHandler();

    const response = await handler(
      jsonRequest(JSON.stringify({ ...validBody, website: "https://spam.test" })),
    );
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result).toEqual({
      ok: false,
      error: "Review the Opportunity Brief request.",
    });
    expect(JSON.stringify(result)).not.toMatch(/honeypot|bot|website/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it("passes strict validation failures through as safe field errors", async () => {
    const submit = vi.fn(async (): Promise<PublicSubmissionResult> => ({
      ok: false,
      status: 400,
      error: "Review the Opportunity Brief request.",
      errors: { profileUrl: "Profile URL is invalid." },
    }));
    const { handler } = createHandler(submit);

    const response = await handler(jsonRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Review the Opportunity Brief request.",
      errors: { profileUrl: "Profile URL is invalid." },
    });
  });

  it("returns 429 without exposing rate-limit internals", async () => {
    const submit = vi.fn(async (): Promise<PublicSubmissionResult> => ({
      ok: false,
      status: 429,
      error: "Too many submission attempts. Try again later.",
    }));
    const { handler } = createHandler(submit);

    const response = await handler(jsonRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Too many submission attempts. Try again later.",
    });
  });

  it("hashes requester identity and strips an existing converted record from public success", async () => {
    const submit = vi.fn(async () => ({
      ...acceptedResult(),
      requestId: "00000000-0000-4000-8000-000000000999",
      status: "converted",
      requesterHash: "internal-requester-hash",
      linkedCandidateId: "private-candidate",
      acknowledgement: { status: "failed", error: "private provider detail" },
      adminNotes: "private note",
    }) as unknown as Promise<PublicSubmissionResult>);
    const { handler } = createHandler(submit);
    const request = jsonRequest(undefined, { "CF-Connecting-IP": "203.0.113.42" });

    const response = await handler(request);
    const result = await response.json();
    const requesterHash = (submit.mock.calls[0] as unknown[] | undefined)?.[1];
    const accepted = acceptedResult();
    if (!accepted.ok) throw new Error("Expected an accepted fixture.");

    expect(response.status).toBe(200);
    expect(submit).toHaveBeenCalledWith(validBody, expect.any(String));
    expect(requesterHash).toMatch(/^[a-f0-9]{64}$/);
    expect(requesterHash).not.toContain("203.0.113.42");
    expect(result).toEqual({
      ok: true,
      submission: accepted.submission,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /requestId|status|converted|requester|candidate|acknowledgement|admin/i,
    );
  });

  it("uses a purpose-separated one-way requester hash", () => {
    const first = requesterHashForOpportunityBrief("cf:203.0.113.42", SESSION_SECRET);
    const second = requesterHashForOpportunityBrief("cf:203.0.113.42", SESSION_SECRET);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.42");
  });

  it("turns unexpected failures into a safe 500 response", async () => {
    const submit = vi.fn(async () => {
      throw new Error("postgres://private-host/internal requester_hash=secret");
    });
    const { handler } = createHandler(submit);

    const response = await handler(jsonRequest());
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result).toEqual({
      ok: false,
      error: "We could not save your request. Please try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/postgres|requester_hash|secret/i);
  });
});
