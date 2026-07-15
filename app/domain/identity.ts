import { z } from "zod";

export const identityKinds = ["organisation", "creator"] as const;

export const organisationSubtypes = [
  "company",
  "brand",
  "startup",
  "distribution_partner",
] as const;

export const creatorSubtypes = [
  "creator",
  "podcaster",
  "publication",
  "media_operator",
] as const;

export const identityKindSchema = z.enum(identityKinds);
export const organisationSubtypeSchema = z.enum(organisationSubtypes);
export const creatorSubtypeSchema = z.enum(creatorSubtypes);

export const organisationIdentitySchema = z.object({
  kind: z.literal("organisation"),
  subtype: organisationSubtypeSchema,
});

export const creatorIdentitySchema = z.object({
  kind: z.literal("creator"),
  subtype: creatorSubtypeSchema,
});

export const identitySchema = z.discriminatedUnion("kind", [
  organisationIdentitySchema,
  creatorIdentitySchema,
]);

export type IdentityKind = z.infer<typeof identityKindSchema>;
export type OrganisationSubtype = z.infer<typeof organisationSubtypeSchema>;
export type CreatorSubtype = z.infer<typeof creatorSubtypeSchema>;
export type OrganisationIdentity = z.infer<typeof organisationIdentitySchema>;
export type CreatorIdentity = z.infer<typeof creatorIdentitySchema>;
export type ParticipantIdentity = z.infer<typeof identitySchema>;
