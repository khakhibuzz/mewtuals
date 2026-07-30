import { describe, expect, it, vi } from "vitest";

import type { EcosystemIntelligenceRepository } from "../db/repositories/ecosystem-intelligence-repository";
import { shouldCacheEcosystemIntelligenceService } from "../app/server/ecosystem-intelligence";
import { createEcosystemIntelligenceService } from "../app/server/ecosystem-intelligence-service";

const NOW = new Date("2026-07-29T08:30:00.000Z");
const CANDIDATE_ID = "17ca68ae-8840-4fa2-a5e0-951963f028d5";

function repository(): EcosystemIntelligenceRepository {
  return {
    getSnapshot: vi.fn(async () => ({ marker: "snapshot" }) as never),
    getCandidateDetail: vi.fn(async () => ({ id: CANDIDATE_ID }) as never),
  };
}

describe("Ecosystem Intelligence administrator service", () => {
  it("keeps Cloudflare services request-scoped", () => {
    expect(shouldCacheEcosystemIntelligenceService({ Cloudflare: {} })).toBe(false);
    expect(shouldCacheEcosystemIntelligenceService({})).toBe(true);
  });

  it("normalizes the allowlist and uses the injected query clock", async () => {
    const data = repository();
    const service = createEcosystemIntelligenceService({
      repository: data,
      adminEmails: [" ADMIN@Example.com "],
      now: () => NOW,
    });

    const result = await service.getSnapshot(
      { userId: "admin", email: "admin@example.COM" },
      new URLSearchParams("participantType=creator"),
    );

    expect(result.ok).toBe(true);
    expect(data.getSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ participantType: "creator" }),
      NOW,
    );
  });

  it("denies non-administrators before parsing or repository work", async () => {
    const data = repository();
    const service = createEcosystemIntelligenceService({
      repository: data,
      adminEmails: ["admin@example.com"],
      now: () => NOW,
    });

    await expect(service.getSnapshot(
      { userId: "member", email: "member@example.com" },
      new URLSearchParams("notSupported=secret"),
    )).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(service.getCandidateDetail(
      { userId: "member", email: "member@example.com" },
      "not-a-uuid",
    )).resolves.toMatchObject({ ok: false, status: 403 });
    expect(data.getSnapshot).not.toHaveBeenCalled();
    expect(data.getCandidateDetail).not.toHaveBeenCalled();
  });

  it("maps invalid filters and candidate ids to safe 400 results", async () => {
    const data = repository();
    const service = createEcosystemIntelligenceService({
      repository: data,
      adminEmails: ["admin@example.com"],
      now: () => NOW,
    });
    const actor = { userId: "admin", email: "admin@example.com" };

    await expect(service.getSnapshot(
      actor,
      new URLSearchParams("participantType=person"),
    )).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Review the Ecosystem Intelligence filters.",
    });
    await expect(service.getCandidateDetail(actor, "not-a-uuid")).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Submit a valid candidate id.",
    });
    await expect(service.getCandidateDetail(actor, CANDIDATE_ID, "-1")).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Submit a valid research history offset.",
    });
    expect(data.getSnapshot).not.toHaveBeenCalled();
    expect(data.getCandidateDetail).not.toHaveBeenCalled();
  });

  it("passes a bounded research history offset to the repository", async () => {
    const data = repository();
    const service = createEcosystemIntelligenceService({
      repository: data,
      adminEmails: ["admin@example.com"],
      now: () => NOW,
    });

    await service.getCandidateDetail(
      { userId: "admin", email: "admin@example.com" },
      CANDIDATE_ID,
      "20",
    );

    expect(data.getCandidateDetail).toHaveBeenCalledWith(CANDIDATE_ID, NOW, 20);
  });

  it("maps missing details and unexpected failures without leaking error text", async () => {
    const data = repository();
    vi.mocked(data.getCandidateDetail)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("postgres://secret@private/internal"));
    vi.mocked(data.getSnapshot).mockRejectedValueOnce(new Error("private SQL"));
    const service = createEcosystemIntelligenceService({
      repository: data,
      adminEmails: ["admin@example.com"],
      now: () => NOW,
    });
    const actor = { userId: "admin", email: "admin@example.com" };

    await expect(service.getCandidateDetail(actor, CANDIDATE_ID)).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    const detailFailure = await service.getCandidateDetail(actor, CANDIDATE_ID);
    const snapshotFailure = await service.getSnapshot(actor, new URLSearchParams());
    expect(detailFailure).toEqual({
      ok: false,
      status: 500,
      error: "We could not load Ecosystem Intelligence. Please try again.",
    });
    expect(snapshotFailure).toEqual(detailFailure);
    expect(JSON.stringify([detailFailure, snapshotFailure])).not.toMatch(/postgres|secret|private SQL/i);
  });
});
