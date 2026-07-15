import { describe, expect, it } from "vitest";

import {
  creatorIdentitySchema,
  identitySchema,
  organisationIdentitySchema,
} from "../app/domain/identity";

describe("participant identity", () => {
  it.each(["company", "brand", "startup", "distribution_partner"])(
    "accepts the organisation subtype %s",
    (subtype) => {
      expect(
        organisationIdentitySchema.parse({
          kind: "organisation",
          subtype,
        }),
      ).toEqual({ kind: "organisation", subtype });
    },
  );

  it.each(["creator", "podcaster", "publication", "media_operator"])(
    "accepts the creator subtype %s",
    (subtype) => {
      expect(
        creatorIdentitySchema.parse({
          kind: "creator",
          subtype,
        }),
      ).toEqual({ kind: "creator", subtype });
    },
  );

  it("rejects a subtype from the other identity kind", () => {
    expect(() =>
      identitySchema.parse({ kind: "organisation", subtype: "podcaster" }),
    ).toThrow();
    expect(() =>
      identitySchema.parse({ kind: "creator", subtype: "brand" }),
    ).toThrow();
  });

  it("rejects incomplete and unknown identities", () => {
    expect(() => identitySchema.parse({ kind: "creator" })).toThrow();
    expect(() =>
      identitySchema.parse({ kind: "agency", subtype: "brand" }),
    ).toThrow();
  });
});
