import { describe, expect, it } from "vitest";

import {
  MAX_OPPORTUNITY_BRIEF_BODY_BYTES,
  MAX_OPPORTUNITY_BRIEF_METADATA_BYTES,
  MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY,
  opportunityBriefInputSchema,
  opportunityBriefParticipantTypes,
  opportunityBriefSourceMetadataSchema,
  opportunityBriefStatusSchema,
  opportunityBriefStatuses,
  transitionOpportunityBriefStatus,
  type OpportunityBriefStatus,
} from "../app/domain/opportunity-brief";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    participantType: "company",
    profileUrl: "https://www.example.com/",
    email: "hello@example.com",
    phoneNumber: "",
    openToText: "",
    source: "",
    utm: {},
    website: "",
    ...overrides,
  };
}

function sourceHistoryEntry(index = 0) {
  return {
    source: `meetup-${index}`,
    utm: { campaign: `campaign-${index}` },
  };
}

describe("opportunity brief vocabulary", () => {
  it("exports the approved participant types", () => {
    expect(opportunityBriefParticipantTypes).toEqual(["company", "creator"]);
  });

  it("exports and accepts the approved statuses", () => {
    expect(opportunityBriefStatuses).toEqual([
      "submitted",
      "researching",
      "brief_ready",
      "contacted",
      "invited_to_join",
      "converted",
      "rejected",
    ]);

    for (const status of opportunityBriefStatuses) {
      expect(opportunityBriefStatusSchema.parse(status)).toBe(status);
    }
  });
});

describe("opportunity brief status transitions", () => {
  const allowed: Record<
    OpportunityBriefStatus,
    readonly OpportunityBriefStatus[]
  > = {
    submitted: ["researching", "rejected"],
    researching: ["brief_ready", "rejected"],
    brief_ready: ["researching", "contacted", "rejected"],
    contacted: ["invited_to_join", "converted", "rejected"],
    invited_to_join: ["contacted", "converted", "rejected"],
    converted: [],
    rejected: ["researching"],
  };

  it("accepts exactly the approved transitions and idempotent no-ops", () => {
    for (const current of opportunityBriefStatuses) {
      for (const requested of opportunityBriefStatuses) {
        const accepted = current === requested || allowed[current].includes(requested);

        if (accepted) {
          expect(transitionOpportunityBriefStatus(current, requested)).toBe(
            requested,
          );
        } else {
          expect(() =>
            transitionOpportunityBriefStatus(current, requested),
          ).toThrow(/not allowed/i);
        }
      }
    }
  });
});

describe("opportunity brief intake normalization", () => {
  it.each(opportunityBriefParticipantTypes)(
    "accepts participant type %s",
    (participantType) => {
      expect(
        opportunityBriefInputSchema.parse(submission({ participantType }))
          .participantType,
      ).toBe(participantType);
    },
  );

  it("normalizes a bounded public profile URL with Discovery rules", () => {
    const parsed = opportunityBriefInputSchema.parse(
      submission({
        profileUrl:
          "  HTTPS://WWW.Example.COM/Creators/Ada/?utm_source=meetup#profile  ",
      }),
    );

    expect(parsed.profileUrl).toBe("https://example.com/Creators/Ada");
    const maximumProfileUrl = `https://example.com/${"x".repeat(2_028)}`;
    expect(maximumProfileUrl).toHaveLength(2_048);
    expect(
      opportunityBriefInputSchema.parse(
        submission({ profileUrl: maximumProfileUrl }),
      ).profileUrl,
    ).toBe(maximumProfileUrl);
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({
          profileUrl: `https://example.com/${"x".repeat(2_030)}`,
        }),
      ).success,
    ).toBe(false);
  });

  it("normalizes email and enforces its 320-character bound", () => {
    expect(
      opportunityBriefInputSchema.parse(
        submission({ email: "  Hello.Person@Example.COM  " }),
    ).email,
    ).toBe("hello.person@example.com");

    const maximumEmail = `${"a".repeat(308)}@example.com`;
    expect(maximumEmail).toHaveLength(320);
    expect(
      opportunityBriefInputSchema.parse(submission({ email: maximumEmail }))
        .email,
    ).toBe(maximumEmail);

    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ email: `${"a".repeat(310)}@example.com` }),
      ).success,
    ).toBe(false);
  });

  it.each([
    ["+91 (98765) 43210", "+919876543210"],
    ["(212) 555-1234", "2125551234"],
    ["1234 5678", "12345678"],
    ["+123-456-789-012-345", "+123456789012345"],
  ])("normalizes WhatsApp number %s", (phoneNumber, expected) => {
    expect(
      opportunityBriefInputSchema.parse(
        submission({ email: "", phoneNumber }),
      ).phoneNumber,
    ).toBe(expected);
  });

  it.each([
    "1234567",
    "+1234567890123456",
    "++12345678",
    "123+45678",
    "+12.345678",
    "+12 ext 345678",
  ])("rejects invalid WhatsApp number %s", (phoneNumber) => {
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ email: "", phoneNumber }),
      ).success,
    ).toBe(false);
  });

  it("requires at least an email or WhatsApp number", () => {
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ email: "", phoneNumber: "" }),
      ).success,
    ).toBe(false);
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ email: "hello@example.com", phoneNumber: "" }),
      ).success,
    ).toBe(true);
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ email: "", phoneNumber: "+919876543210" }),
      ).success,
    ).toBe(true);
  });

  it("normalizes optional text and enforces its 1000-character bound", () => {
    expect(
      opportunityBriefInputSchema.parse(
        submission({ openToText: "  Podcast swaps and live events  " }),
      ).openToText,
    ).toBe("Podcast swaps and live events");
    expect(
      opportunityBriefInputSchema.parse(submission({ openToText: "  " }))
        .openToText,
    ).toBeUndefined();
    expect(
      opportunityBriefInputSchema.parse(
        submission({ openToText: "x".repeat(1_000) }),
      ).openToText,
    ).toHaveLength(1_000);
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ openToText: "x".repeat(1_001) }),
      ).success,
    ).toBe(false);
  });
});

describe("opportunity brief attribution and request bounds", () => {
  it("exports the 16 KiB JSON body limit", () => {
    expect(MAX_OPPORTUNITY_BRIEF_BODY_BYTES).toBe(16 * 1_024);
  });

  it("accepts only bounded source slugs", () => {
    expect(
      opportunityBriefInputSchema.parse(
        submission({ source: "  bengaluru-meetup_2026.07  " }),
    ).source,
    ).toBe("bengaluru-meetup_2026.07");
    expect(
      opportunityBriefInputSchema.parse(
        submission({ source: "x".repeat(100) }),
      ).source,
    ).toHaveLength(100);

    for (const source of [
      "has spaces",
      "contains/slash",
      "contains?query",
      "x".repeat(101),
    ]) {
      expect(
        opportunityBriefInputSchema.safeParse(submission({ source })).success,
      ).toBe(false);
    }
  });

  it("accepts exactly the five bounded UTM keys", () => {
    const utm = {
      source: "newsletter",
      medium: "email",
      campaign: "july-meetup",
      term: "partnerships",
      content: "qr-code",
    };

    expect(opportunityBriefInputSchema.parse(submission({ utm })).utm).toEqual(
      utm,
    );
    expect(
      opportunityBriefInputSchema.parse(
        submission({ utm: { source: "x".repeat(200) } }),
      ).utm.source,
    ).toHaveLength(200);
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ utm: { ...utm, unknown: "value" } }),
      ).success,
    ).toBe(false);

    for (const key of Object.keys(utm)) {
      expect(
        opportunityBriefInputSchema.safeParse(
          submission({ utm: { [key]: "x".repeat(201) } }),
        ).success,
      ).toBe(false);
    }
  });

  it("limits source history to the newest 20-entry storage shape", () => {
    expect(MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY).toBe(20);
    expect(
      opportunityBriefSourceMetadataSchema.safeParse({
        utm: {},
        history: Array.from({ length: 20 }, (_, index) =>
          sourceHistoryEntry(index),
        ),
      }).success,
    ).toBe(true);
    expect(
      opportunityBriefSourceMetadataSchema.safeParse({
        utm: {},
        history: Array.from({ length: 21 }, (_, index) =>
          sourceHistoryEntry(index),
        ),
      }).success,
    ).toBe(false);
  });

  it("limits serialized source metadata to 8 KiB", () => {
    expect(MAX_OPPORTUNITY_BRIEF_METADATA_BYTES).toBe(8 * 1_024);

    const oversizedValue = "x".repeat(200);
    const oversizedEntry = {
      source: "meetup",
      utm: {
        source: oversizedValue,
        medium: oversizedValue,
        campaign: oversizedValue,
        term: oversizedValue,
        content: oversizedValue,
      },
    };
    expect(
      opportunityBriefSourceMetadataSchema.safeParse({
        utm: oversizedEntry.utm,
        history: Array.from({ length: 20 }, () => oversizedEntry),
      }).success,
    ).toBe(false);
  });

  it("rejects a populated honeypot and unknown request or metadata fields", () => {
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ website: "https://spam.example" }),
      ).success,
    ).toBe(false);
    expect(
      opportunityBriefInputSchema.safeParse(
        submission({ unexpected: true }),
      ).success,
    ).toBe(false);
    expect(
      opportunityBriefSourceMetadataSchema.safeParse({
        utm: {},
        history: [],
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
