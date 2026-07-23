import { z } from "zod";

import { normalizeDiscoveryUrl } from "./discovery";

export const opportunityBriefParticipantTypes = ["company", "creator"] as const;
export const opportunityBriefStatuses = [
  "submitted",
  "researching",
  "brief_ready",
  "contacted",
  "invited_to_join",
  "converted",
  "rejected",
] as const;

export const MAX_OPPORTUNITY_BRIEF_BODY_BYTES = 16 * 1_024;
export const MAX_OPPORTUNITY_BRIEF_PROFILE_URL_LENGTH = 2_048;
export const MAX_OPPORTUNITY_BRIEF_EMAIL_LENGTH = 320;
export const MAX_OPPORTUNITY_BRIEF_OPEN_TO_LENGTH = 1_000;
export const MAX_OPPORTUNITY_BRIEF_SOURCE_LENGTH = 100;
export const MAX_OPPORTUNITY_BRIEF_UTM_VALUE_LENGTH = 200;
export const MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY = 20;
export const MAX_OPPORTUNITY_BRIEF_METADATA_BYTES = 8 * 1_024;

export const opportunityBriefParticipantTypeSchema = z.enum(
  opportunityBriefParticipantTypes,
);
export const opportunityBriefStatusSchema = z.enum(opportunityBriefStatuses);

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

const boundedProfileUrlSchema = z
  .string()
  .max(MAX_OPPORTUNITY_BRIEF_PROFILE_URL_LENGTH, {
    message: `Profile URL must be at most ${MAX_OPPORTUNITY_BRIEF_PROFILE_URL_LENGTH} characters.`,
  })
  .transform((value, context) => {
    try {
      const trimmedValue = value.trim();
      const valueWithScheme = /^https?:\/\//i.test(trimmedValue)
        ? trimmedValue
        : `https://${trimmedValue}`;
      return normalizeDiscoveryUrl(valueWithScheme);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Profile URL is invalid.",
      });
      return z.NEVER;
    }
  });

const optionalNormalizedEmailSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .max(MAX_OPPORTUNITY_BRIEF_EMAIL_LENGTH, {
      message: `Email must be at most ${MAX_OPPORTUNITY_BRIEF_EMAIL_LENGTH} characters.`,
    })
    .email({ message: "Email must be valid." })
    .transform((value) => value.toLowerCase())
    .optional(),
);

const optionalNormalizedWhatsappSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .transform((value) => value.replace(/[\s\-()]/g, ""))
    .pipe(
      z.string().regex(/^\+?\d{8,15}$/, {
        message: "WhatsApp number must contain 8 to 15 digits.",
      }),
    )
    .optional(),
);

const optionalBoundedTextSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .max(MAX_OPPORTUNITY_BRIEF_OPEN_TO_LENGTH, {
      message: `What you are open to must be at most ${MAX_OPPORTUNITY_BRIEF_OPEN_TO_LENGTH} characters.`,
    })
    .optional(),
);

const optionalSourceSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .max(MAX_OPPORTUNITY_BRIEF_SOURCE_LENGTH, {
      message: `Source must be at most ${MAX_OPPORTUNITY_BRIEF_SOURCE_LENGTH} characters.`,
    })
    .regex(/^[A-Za-z0-9._-]+$/, {
      message: "Source may contain only letters, numbers, periods, underscores, and hyphens.",
    })
    .optional(),
);

const optionalUtmValueSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .max(MAX_OPPORTUNITY_BRIEF_UTM_VALUE_LENGTH, {
      message: `UTM values must be at most ${MAX_OPPORTUNITY_BRIEF_UTM_VALUE_LENGTH} characters.`,
    })
    .optional(),
);

export const opportunityBriefUtmSchema = z.strictObject({
  source: optionalUtmValueSchema,
  medium: optionalUtmValueSchema,
  campaign: optionalUtmValueSchema,
  term: optionalUtmValueSchema,
  content: optionalUtmValueSchema,
});

export const opportunityBriefInputSchema = z.strictObject({
  participantType: opportunityBriefParticipantTypeSchema,
  profileUrl: boundedProfileUrlSchema,
  email: optionalNormalizedEmailSchema,
  phoneNumber: optionalNormalizedWhatsappSchema,
  openToText: optionalBoundedTextSchema,
  source: optionalSourceSchema,
  utm: opportunityBriefUtmSchema,
  website: z.string().max(0),
});

export const opportunityBriefSourceHistoryEntrySchema = z.strictObject({
  source: optionalSourceSchema,
  utm: opportunityBriefUtmSchema,
});

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export const opportunityBriefSourceMetadataSchema = z
  .strictObject({
    utm: opportunityBriefUtmSchema,
    history: z
      .array(opportunityBriefSourceHistoryEntrySchema)
      .max(MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY, {
        message: `Source history must contain at most ${MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY} entries.`,
      }),
  })
  .superRefine((metadata, context) => {
    if (serializedByteLength(metadata) <= MAX_OPPORTUNITY_BRIEF_METADATA_BYTES) {
      return;
    }
    context.addIssue({
      code: "custom",
      message: `Source metadata must be at most ${MAX_OPPORTUNITY_BRIEF_METADATA_BYTES} bytes.`,
    });
  });

const allowedStatusTransitions: Record<
  OpportunityBriefStatus,
  ReadonlySet<OpportunityBriefStatus>
> = {
  submitted: new Set(["researching", "rejected"]),
  researching: new Set(["brief_ready", "rejected"]),
  brief_ready: new Set(["researching", "contacted", "rejected"]),
  contacted: new Set(["invited_to_join", "converted", "rejected"]),
  invited_to_join: new Set(["contacted", "converted", "rejected"]),
  converted: new Set(),
  rejected: new Set(["researching"]),
};

export function transitionOpportunityBriefStatus(
  current: OpportunityBriefStatus,
  requested: OpportunityBriefStatus,
): OpportunityBriefStatus {
  if (current === requested || allowedStatusTransitions[current].has(requested)) {
    return requested;
  }
  throw new Error(
    `Opportunity Brief status transition from ${current} to ${requested} is not allowed.`,
  );
}

export type OpportunityBriefParticipantType = z.infer<
  typeof opportunityBriefParticipantTypeSchema
>;
export type OpportunityBriefStatus = z.infer<
  typeof opportunityBriefStatusSchema
>;
export type OpportunityBriefInput = z.infer<
  typeof opportunityBriefInputSchema
>;
export type OpportunityBriefSourceHistoryEntry = z.infer<
  typeof opportunityBriefSourceHistoryEntrySchema
>;
export type OpportunityBriefSourceMetadata = z.infer<
  typeof opportunityBriefSourceMetadataSchema
>;
