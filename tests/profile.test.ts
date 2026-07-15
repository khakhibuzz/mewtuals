import { describe, expect, it } from "vitest";

import {
  generateProfileDraft,
  normalizePublicUrl,
  profileSourceSchema,
} from "../app/domain/profile";

describe("public profile sources", () => {
  it("normalizes safe HTTP and HTTPS URLs", () => {
    expect(normalizePublicUrl(" HTTPS://Example.COM/team#founders ")).toBe(
      "https://example.com/team",
    );
    expect(normalizePublicUrl("http://example.com:80/about/")).toBe(
      "http://example.com/about/",
    );
    expect(
      normalizePublicUrl("https://[2606:4700:4700::1111]/profile"),
    ).toBe("https://[2606:4700:4700::1111]/profile");
    expect(normalizePublicUrl("https://[::ffff:8.8.8.8]/profile")).toBe(
      "https://[::ffff:808:808]/profile",
    );
    expect(normalizePublicUrl("https://example.com./profile")).toBe(
      "https://example.com/profile",
    );
  });

  it.each([
    "ftp://example.com/profile",
    "https://user:secret@example.com/profile",
    "http://localhost:3000/profile",
    "http://sub.localhost/profile",
    "http://localhost./profile",
    "http://service.local./profile",
    "http://127.0.0.1/profile",
    "http://10.20.30.40/profile",
    "http://172.16.0.1/profile",
    "http://172.31.255.255/profile",
    "http://192.168.1.10/profile",
    "http://169.254.10.1/profile",
    "http://[::1]/profile",
    "http://[fd00::1]/profile",
    "http://[::ffff:127.0.0.1]/profile",
    "http://[::ffff:10.20.30.40]/profile",
    "http://[::ffff:169.254.169.254]/profile",
    "http://intranet/profile",
    "not a URL",
  ])("rejects unsafe or malformed source %s", (source) => {
    expect(() => normalizePublicUrl(source)).toThrow();
  });

  it("validates source requirements for each identity kind", () => {
    expect(
      profileSourceSchema.parse({
        kind: "organisation",
        websiteUrl: "https://mewtuals.com/",
        linkedInUrl: "https://www.linkedin.com/company/mewtuals/",
      }),
    ).toEqual({
      kind: "organisation",
      websiteUrl: "https://mewtuals.com/",
      linkedInUrl: "https://www.linkedin.com/company/mewtuals/",
    });

    expect(
      profileSourceSchema.parse({
        kind: "creator",
        primaryUrl: "https://www.youtube.com/@signal-studio",
        businessEmail: "HELLO@EXAMPLE.COM ",
      }),
    ).toEqual({
      kind: "creator",
      primaryUrl: "https://www.youtube.com/@signal-studio",
      businessEmail: "HELLO@example.com",
    });

    expect(() =>
      profileSourceSchema.parse({ kind: "organisation" }),
    ).toThrow();
    expect(() => profileSourceSchema.parse({ kind: "creator" })).toThrow();
  });
});

describe("editable profile draft generation", () => {
  it("derives an organisation name only from a supplied domain", () => {
    expect(
      generateProfileDraft({
        identity: { kind: "organisation", subtype: "startup" },
        source: {
          kind: "organisation",
          websiteUrl: "https://www.signal-studio.com/products",
        },
      }),
    ).toEqual({
      name: "Signal Studio",
      organisationName: "Signal Studio",
      identityKind: "organisation",
      organisationSubtype: "startup",
      creatorSubtype: null,
      domain: "signal-studio.com",
      primaryUrl: "https://www.signal-studio.com/products",
      websiteUrl: "https://www.signal-studio.com/products",
      linkedInUrl: null,
      socialUrl: null,
    });
  });

  it("uses supplied names before URL heuristics", () => {
    const draft = generateProfileDraft({
      identity: { kind: "organisation", subtype: "brand" },
      source: {
        kind: "organisation",
        websiteUrl: "https://example.com/",
      },
      displayName: "  Keshav Garg  ",
      organisationName: " Mewtuals Labs ",
    });

    expect(draft.name).toBe("Keshav Garg");
    expect(draft.organisationName).toBe("Mewtuals Labs");
  });

  it("derives a creator name from the supplied profile handle", () => {
    expect(
      generateProfileDraft({
        identity: { kind: "creator", subtype: "podcaster" },
        source: {
          kind: "creator",
          primaryUrl: "https://www.youtube.com/@signal-studio/",
        },
      }),
    ).toMatchObject({
      name: "Signal Studio",
      organisationName: null,
      identityKind: "creator",
      organisationSubtype: null,
      creatorSubtype: "podcaster",
      domain: "youtube.com",
      primaryUrl: "https://www.youtube.com/@signal-studio/",
      websiteUrl: null,
      linkedInUrl: null,
      socialUrl: "https://www.youtube.com/@signal-studio/",
    });
  });

  it("falls back to domain evidence when a profile handle has no name", () => {
    expect(
      generateProfileDraft({
        identity: { kind: "creator", subtype: "creator" },
        source: {
          kind: "creator",
          primaryUrl: "https://example.com/@/",
        },
      }).name,
    ).toBe("Example");
  });

  it("is deterministic and never adds unsupported descriptive facts", () => {
    const input = {
      identity: { kind: "creator", subtype: "creator" } as const,
      source: {
        kind: "creator" as const,
        primaryUrl: "https://x.com/clear_signal",
      },
    };

    expect(generateProfileDraft(input)).toEqual(generateProfileDraft(input));
    expect(Object.keys(generateProfileDraft(input)).sort()).toEqual(
      [
        "creatorSubtype",
        "domain",
        "identityKind",
        "linkedInUrl",
        "name",
        "organisationName",
        "organisationSubtype",
        "primaryUrl",
        "socialUrl",
        "websiteUrl",
      ].sort(),
    );
  });
});
