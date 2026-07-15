import { describe, expect, it } from "vitest";

import { readServerEnvironment } from "../app/server/env";
import {
  createVerificationService,
  type VerificationProfile,
  type VerificationRepository,
  type VerificationReview,
} from "../app/server/verification-service";

const pendingProfile: VerificationProfile = {
  id: "a7d6bd36-a0cf-48c2-97dd-3ac7fef2651d",
  userId: "b7d6bd36-a0cf-48c2-97dd-3ac7fef2651d",
  memberEmail: "member@example.com",
  name: "Mew Studio",
  organisationName: "Mew Media",
  identityKind: "creator",
  organisationSubtype: null,
  creatorSubtype: "podcaster",
  domain: "example.com",
  primaryUrl: "https://example.com/mew",
  status: "pending",
  submittedAt: new Date("2026-07-15T08:00:00.000Z"),
  verifiedAt: null,
};

const admin = {
  userId: "c7d6bd36-a0cf-48c2-97dd-3ac7fef2651d",
  email: "ADMIN@example.com",
};
const member = {
  userId: pendingProfile.userId,
  email: pendingProfile.memberEmail,
};

function createMemoryRepository() {
  let profile: VerificationProfile = { ...pendingProfile };
  const reviews: VerificationReview[] = [];

  const repository: VerificationRepository = {
    async listPending() {
      return profile.status === "pending" ? [{ ...profile }] : [];
    },
    async findMemberProfile(userId) {
      return profile.userId === userId ? { ...profile } : null;
    },
    async transitionPending(input) {
      const ownsProfile =
        input.ownerUserId === undefined || input.ownerUserId === profile.userId;
      if (
        input.profileId !== profile.id ||
        profile.status !== "pending" ||
        !ownsProfile
      ) {
        return { applied: false as const, profile: { ...profile } };
      }

      profile = {
        ...profile,
        status: input.decision,
        verifiedAt: input.decision === "verified" ? input.reviewedAt : null,
      };
      const review: VerificationReview = {
        id: "d7d6bd36-a0cf-48c2-97dd-3ac7fef2651d",
        profileId: profile.id,
        reviewerEmail: input.reviewerEmail,
        decision: input.decision,
        notes: input.notes,
        reviewedAt: input.reviewedAt,
      };
      reviews.push(review);
      return { applied: true as const, profile: { ...profile }, review };
    },
  };

  return { repository, reviews, getProfile: () => ({ ...profile }) };
}

function createService(
  repository: VerificationRepository,
  overrides: Partial<{
    environment: "development" | "test" | "production";
    developmentAuthEnabled: boolean;
  }> = {},
) {
  return createVerificationService({
    repository,
    adminEmails: ["admin@example.com"],
    environment: overrides.environment ?? "test",
    developmentAuthEnabled: overrides.developmentAuthEnabled ?? true,
    now: () => new Date("2026-07-15T09:30:00.000Z"),
  });
}

describe("verification service", () => {
  it("normalizes and validates the configured admin allowlist", () => {
    const environment = readServerEnvironment({
      NODE_ENV: "test",
      SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      ADMIN_EMAILS: " ADMIN@Example.com, reviewer@example.com,admin@example.com ",
    });

    expect(environment.adminEmails).toEqual([
      "admin@example.com",
      "reviewer@example.com",
    ]);
    expect(() =>
      readServerEnvironment({
        NODE_ENV: "test",
        SESSION_SECRET:
          "test-session-secret-that-is-longer-than-32-characters",
        ADMIN_EMAILS: "admin@example.com,not-an-email",
      }),
    ).toThrow(/ADMIN_EMAILS/i);
  });

  it("allows only configured administrators to read the pending queue", async () => {
    const { repository } = createMemoryRepository();
    const service = createService(repository);

    expect(await service.listPending(admin)).toMatchObject({
      ok: true,
      profiles: [{ name: "Mew Studio", status: "pending" }],
    });
    expect(await service.listPending(member)).toEqual({
      ok: false,
      status: 403,
      error: "Administrator access is required.",
    });
  });

  it.each(["verified", "waitlisted"] as const)(
    "atomically records the administrator audit when moving pending to %s",
    async (decision) => {
      const { repository, reviews, getProfile } = createMemoryRepository();
      const service = createService(repository);

      const result = await service.review(admin, pendingProfile.id, {
        decision,
        notes: " Sources and identity are coherent. ",
      });

      expect(result).toMatchObject({
        ok: true,
        profile: { status: decision },
        review: {
          reviewerEmail: "admin@example.com",
          decision,
          notes: "Sources and identity are coherent.",
          reviewedAt: new Date("2026-07-15T09:30:00.000Z"),
        },
      });
      expect(getProfile().status).toBe(decision);
      expect(reviews).toHaveLength(1);
    },
  );

  it("rejects non-admin review attempts without touching the repository", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);

    expect(
      await service.review(member, pendingProfile.id, {
        decision: "verified",
      }),
    ).toEqual({
      ok: false,
      status: 403,
      error: "Administrator access is required.",
    });
    expect(memory.getProfile().status).toBe("pending");
    expect(memory.reviews).toHaveLength(0);
  });

  it("rejects a malformed profile id before reaching PostgreSQL", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);

    expect(
      await service.review(admin, "not-a-profile-id", {
        decision: "verified",
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Review the verification decision.",
      errors: { profileId: "Enter a valid profile id." },
    });
    expect(memory.getProfile().status).toBe("pending");
    expect(memory.reviews).toHaveLength(0);
  });

  it("rejects replayed decisions after the first transition wins", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);

    expect(
      await service.review(admin, pendingProfile.id, { decision: "verified" }),
    ).toMatchObject({ ok: true });
    expect(
      await service.review(admin, pendingProfile.id, { decision: "waitlisted" }),
    ).toEqual({
      ok: false,
      status: 409,
      error: "This profile has already been reviewed.",
    });
    expect(memory.getProfile().status).toBe("verified");
    expect(memory.reviews).toHaveLength(1);
  });

  it("uses the same audited transition for an authenticated owner's local approval", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);

    const result = await service.approveOwnPendingForDevelopment(member);

    expect(result).toMatchObject({
      ok: true,
      profile: { userId: member.userId, status: "verified" },
      review: {
        reviewerEmail: "member@example.com",
        decision: "verified",
        notes: "Local development approval",
      },
    });
    expect(memory.reviews).toHaveLength(1);
  });

  it.each([
    ["production", true],
    ["development", false],
  ] as const)(
    "hard-disables local approval in %s with flag=%s",
    async (environment, developmentAuthEnabled) => {
      const memory = createMemoryRepository();
      const service = createService(memory.repository, {
        environment,
        developmentAuthEnabled,
      });

      expect(await service.approveOwnPendingForDevelopment(member)).toEqual({
        ok: false,
        status: 404,
        error: "Not found.",
      });
      expect(memory.getProfile().status).toBe("pending");
      expect(memory.reviews).toHaveLength(0);
    },
  );

  it("returns only the member profile state for pending and waitlisted dashboards", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);

    expect(await service.memberState(member.userId)).toEqual({
      profile: expect.objectContaining({
        id: pendingProfile.id,
        name: "Mew Studio",
        status: "pending",
      }),
    });

    await service.review(admin, pendingProfile.id, { decision: "waitlisted" });
    const state = await service.memberState(member.userId);
    expect(state).toEqual({
      profile: expect.objectContaining({ status: "waitlisted" }),
    });
    expect(state).not.toHaveProperty("opportunities");
    expect(state).not.toHaveProperty("counterparties");
  });
});
