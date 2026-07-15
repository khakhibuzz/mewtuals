import { describe, expect, it } from "vitest";

import {
  createOnboardingService,
  type OnboardingDraftRecord,
  type OnboardingProfileRecord,
  type OnboardingRepository,
} from "../app/server/onboarding-service";

const userId = "d7d6bd36-a0cf-48c2-97dd-3ac7fef2651d";

function createMemoryRepository() {
  let draft: OnboardingDraftRecord | null = null;
  let profile: OnboardingProfileRecord | null = null;

  const repository: OnboardingRepository = {
    async findState() {
      return { draft, profile };
    },
    async saveIdentity(_userId, identity) {
      if (draft || profile) return { applied: false, state: { draft, profile } };
      draft = {
        userId,
        ...identity,
        websiteUrl: null,
        linkedInUrl: null,
        socialUrl: null,
        businessEmail: null,
        generatedName: null,
        generatedOrganisationName: null,
        generatedDomain: null,
        primaryUrl: null,
      };
      return { applied: true, value: draft };
    },
    async saveSource(_userId, { expectedIdentityKind, source }) {
      if (
        profile ||
        !draft ||
        draft.identityKind !== expectedIdentityKind ||
        draft.primaryUrl
      ) {
        return { applied: false, state: { draft, profile } };
      }
      draft = { ...draft, ...source };
      return { applied: true, value: draft };
    },
    async confirmProfile(_userId, input) {
      if (profile || !draft?.primaryUrl) {
        return { applied: false, state: { draft, profile } };
      }
      profile = {
        id: "7f80291e-67c4-441f-8972-8579a0bbf251",
        userId,
        ...input,
        status: "draft",
        submittedAt: null,
      };
      return { applied: true, value: profile };
    },
    async submitForVerification(_userId, submittedAt) {
      if (!profile || profile.status !== "draft") {
        return { applied: false, state: { draft, profile } };
      }
      profile = { ...profile, status: "pending", submittedAt };
      return { applied: true, value: profile };
    },
  };

  return repository;
}

describe("member onboarding service", () => {
  it("enforces the ordered identity, source, profile, verification gates", async () => {
    const service = createOnboardingService(createMemoryRepository());

    expect(await service.nextPath(userId)).toBe("/onboarding/identity");
    expect(await service.saveSource(userId, { kind: "creator", primaryUrl: "https://x.com/mew" })).toMatchObject({
      ok: false,
      redirectTo: "/onboarding/identity",
    });

    await service.saveIdentity(userId, { kind: "creator", subtype: "podcaster" });
    expect(await service.nextPath(userId)).toBe("/onboarding/source");

    await service.saveSource(userId, {
      kind: "creator",
      primaryUrl: "https://x.com/Mew-Podcast#latest",
      businessEmail: " HELLO@Example.COM ",
    });
    expect(await service.nextPath(userId)).toBe("/onboarding/profile");

    await service.confirmProfile(userId, {
      name: "Mew Podcast",
      organisationName: "Mew Media",
      domain: "x.com",
      confirmed: true,
    });
    expect(await service.nextPath(userId)).toBe("/onboarding/verification");

    await service.submitVerification(userId);
    expect(await service.nextPath(userId)).toBe("/dashboard");
  });

  it("redirects replayed mutations to the state that won", async () => {
    const service = createOnboardingService(createMemoryRepository());

    await service.saveIdentity(userId, {
      kind: "organisation",
      subtype: "startup",
    });
    expect(
      await service.saveIdentity(userId, {
        kind: "creator",
        subtype: "creator",
      }),
    ).toEqual({ ok: false, redirectTo: "/onboarding/source" });

    await service.saveSource(userId, {
      kind: "organisation",
      websiteUrl: "https://mewtuals.com",
    });
    expect(
      await service.saveSource(userId, {
        kind: "organisation",
        websiteUrl: "https://stale.example",
      }),
    ).toEqual({ ok: false, redirectTo: "/onboarding/profile" });
  });

  it.each([
    ["organisation", "company"],
    ["organisation", "brand"],
    ["organisation", "startup"],
    ["organisation", "distribution_partner"],
    ["creator", "creator"],
    ["creator", "podcaster"],
    ["creator", "publication"],
    ["creator", "media_operator"],
  ] as const)("accepts the %s / %s identity", async (kind, subtype) => {
    const service = createOnboardingService(createMemoryRepository());

    expect(await service.saveIdentity(userId, { kind, subtype })).toMatchObject({
      ok: true,
      nextPath: "/onboarding/source",
    });
  });

  it("returns field errors and submitted values for invalid identity combinations", async () => {
    const service = createOnboardingService(createMemoryRepository());

    expect(
      await service.saveIdentity(userId, {
        kind: "organisation",
        subtype: "podcaster",
      }),
    ).toMatchObject({
      ok: false,
      values: { kind: "organisation", subtype: "podcaster" },
      errors: { subtype: expect.any(String) },
    });
  });

  it("requires an organisation website and normalizes optional LinkedIn evidence", async () => {
    const service = createOnboardingService(createMemoryRepository());
    await service.saveIdentity(userId, { kind: "organisation", subtype: "brand" });

    expect(await service.saveSource(userId, { kind: "organisation", websiteUrl: "" })).toMatchObject({
      ok: false,
      values: { kind: "organisation", websiteUrl: "" },
      errors: { websiteUrl: expect.any(String) },
    });

    expect(
      await service.saveSource(userId, {
        kind: "organisation",
        websiteUrl: " https://WWW.ACME.COM/about#team ",
        linkedInUrl: "https://linkedin.com/company/acme#about",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        websiteUrl: "https://www.acme.com/about",
        linkedInUrl: "https://linkedin.com/company/acme",
        generatedName: "Acme",
        generatedDomain: "acme.com",
      },
    });
  });

  it("requires a creator profile URL and normalizes an optional business email", async () => {
    const service = createOnboardingService(createMemoryRepository());
    await service.saveIdentity(userId, { kind: "creator", subtype: "creator" });

    expect(await service.saveSource(userId, { kind: "creator", primaryUrl: "not a url" })).toMatchObject({
      ok: false,
      values: { kind: "creator", primaryUrl: "not a url" },
      errors: { primaryUrl: expect.any(String) },
    });

    expect(
      await service.saveSource(userId, {
        kind: "creator",
        primaryUrl: "https://youtube.com/@mew-studio#videos",
        businessEmail: " HELLO@Example.COM ",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        socialUrl: "https://youtube.com/@mew-studio",
        businessEmail: "HELLO@example.com",
        generatedName: "Mew Studio",
      },
    });
  });

  it("validates editable profile fields and requires explicit confirmation", async () => {
    const repository = createMemoryRepository();
    const service = createOnboardingService(repository);
    await service.saveIdentity(userId, { kind: "organisation", subtype: "startup" });
    await service.saveSource(userId, {
      kind: "organisation",
      websiteUrl: "https://mewtuals.com",
    });

    expect(
      await service.confirmProfile(userId, {
        name: " ",
        organisationName: "Mewtuals",
        domain: "localhost",
        confirmed: false,
      }),
    ).toMatchObject({
      ok: false,
      errors: {
        name: expect.any(String),
        domain: expect.any(String),
        confirmed: expect.any(String),
      },
    });

    expect(
      await service.confirmProfile(userId, {
        name: "  Mewtuals Team  ",
        organisationName: " Mewtuals ",
        domain: "MEWTUALS.COM",
        confirmed: true,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        name: "Mewtuals Team",
        organisationName: "Mewtuals",
        domain: "mewtuals.com",
        status: "draft",
      },
      nextPath: "/onboarding/verification",
    });
  });

  it("records the draft to pending transition once with submittedAt", async () => {
    const submittedAt = new Date("2026-07-15T12:00:00.000Z");
    const service = createOnboardingService(createMemoryRepository(), () => submittedAt);
    await service.saveIdentity(userId, { kind: "creator", subtype: "publication" });
    await service.saveSource(userId, {
      kind: "creator",
      primaryUrl: "https://example.com/mew-daily",
    });
    await service.confirmProfile(userId, {
      name: "Mew Daily",
      organisationName: "Mew Media",
      domain: "example.com",
      confirmed: true,
    });

    expect(await service.submitVerification(userId)).toMatchObject({
      ok: true,
      value: { status: "pending", submittedAt },
      nextPath: "/dashboard",
    });
    expect(await service.submitVerification(userId)).toMatchObject({
      ok: false,
      redirectTo: "/dashboard",
    });
  });
});
