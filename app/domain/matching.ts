import { z } from "zod";

import {
  creatorSubtypeSchema,
  identityKindSchema,
  identitySchema,
  organisationSubtypeSchema,
  type ParticipantIdentity,
} from "./identity";
import {
  openToInterestSchema,
  signalSchema,
  type OpenToInterest,
  type PartnershipSignal,
  type PartnershipSignalInput,
} from "./signal";

export const partnershipDirections = [
  "brand_creator",
  "brand_brand",
  "creator_creator",
  "startup_distribution_partner",
] as const;

export const partnershipDirectionSchema = z.enum(partnershipDirections);

export const opportunityCandidateSchema = z.object({
  key: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  direction: partnershipDirectionSchema,
  counterpartyType: z.string().trim().min(1),
  reciprocalValue: z.string().trim().min(1),
  eligibleIdentityKinds: z.array(identityKindSchema).min(1),
  eligibleOrganisationSubtypes: z.array(organisationSubtypeSchema),
  eligibleCreatorSubtypes: z.array(creatorSubtypeSchema),
  openToTags: z.array(openToInterestSchema).min(1),
  active: z.boolean().default(true),
});

export type PartnershipDirection = z.infer<typeof partnershipDirectionSchema>;
export type OpportunityCandidate = z.input<typeof opportunityCandidateSchema>;
type ParsedOpportunity = z.output<typeof opportunityCandidateSchema>;

export type CuratedOpportunity = ParsedOpportunity & {
  score: number;
  matchedInterests: OpenToInterest[];
  fitSummary: string;
};

const eligibleForIdentity = (
  identity: ParticipantIdentity,
  opportunity: ParsedOpportunity,
) => {
  if (!opportunity.eligibleIdentityKinds.includes(identity.kind)) {
    return false;
  }

  if (identity.kind === "organisation") {
    return opportunity.eligibleOrganisationSubtypes.includes(identity.subtype);
  }

  return opportunity.eligibleCreatorSubtypes.includes(identity.subtype);
};

const matchingInterests = (
  signal: PartnershipSignal,
  opportunity: ParsedOpportunity,
) => signal.openTo.filter((interest) => opportunity.openToTags.includes(interest));

const scoreOpportunity = (
  signal: PartnershipSignal,
  matchedInterests: OpenToInterest[],
) => {
  const availabilityWeight = signal.availability === "open_now" ? 20 : 10;
  return 100 + availabilityWeight + matchedInterests.length * 25;
};

const buildFitSummary = (matchedInterests: OpenToInterest[]) =>
  `Fits your current interest in ${matchedInterests.join(", ")}.`;

export const curateOpportunities = (
  rawIdentity: ParticipantIdentity,
  rawSignal: PartnershipSignalInput,
  rawOpportunities: readonly OpportunityCandidate[],
): CuratedOpportunity[] => {
  const identity = identitySchema.parse(rawIdentity);
  const signal = signalSchema.parse(rawSignal);

  if (signal.availability === "not_available") {
    return [];
  }

  return rawOpportunities
    .map((opportunity) => opportunityCandidateSchema.parse(opportunity))
    .filter(
      (opportunity) => opportunity.active && eligibleForIdentity(identity, opportunity),
    )
    .map((opportunity) => ({
      opportunity,
      matchedInterests: matchingInterests(signal, opportunity),
    }))
    .filter(({ matchedInterests }) => matchedInterests.length > 0)
    .map(({ opportunity, matchedInterests }) => ({
      ...opportunity,
      score: scoreOpportunity(signal, matchedInterests),
      matchedInterests,
      fitSummary: buildFitSummary(matchedInterests),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.key.localeCompare(right.key),
    )
    .slice(0, 3);
};
