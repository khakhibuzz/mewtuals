import { afterEach, describe, expect, it, vi } from "vitest";

import { createFormSubmissionRequest } from "../app/lib/form-submission-request";

afterEach(() => vi.unstubAllGlobals());

describe("form submission requests", () => {
  it("reuses one idempotency key for retries of identical data", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const request = createFormSubmissionRequest("/api/applications");
    const body = {
      companyUrl: "https://example.com/",
      workEmail: "a@example.com",
      phone: "12345678",
      website: "",
    };

    await expect(request.send(body)).rejects.toThrow("network");
    await request.send({ ...body });

    const first = fetch.mock.calls[0][1];
    const second = fetch.mock.calls[1][1];
    expect(first.headers["Idempotency-Key"]).toMatch(/^[a-f0-9-]{36}$/);
    expect(second.headers["Idempotency-Key"]).toBe(first.headers["Idempotency-Key"]);
    expect(first).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it("uses a new key after payload edits and an explicit new application", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const request = createFormSubmissionRequest("/api/applications");

    await request.send({ email: "a@example.com" });
    await request.send({ email: "b@example.com" });
    request.reset();
    await request.send({ email: "b@example.com" });

    const keys = fetch.mock.calls.map((call) => call[1].headers["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(3);
  });
});
