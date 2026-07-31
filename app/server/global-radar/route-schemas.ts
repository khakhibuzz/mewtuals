import { z } from "zod";

import {
  directDemandAskTypes,
  globalRadarAuthoredAuditTextSchema,
  globalRadarDemandFamilies,
  globalRadarJsonContainsSensitiveContent,
  globalRadarOperationalDiagnosticSchema,
  globalRadarThemes,
  isoTimestampSchema,
  linkedinOrganizationUrlSchema,
  persistableRadarEvidenceSchema,
  precursorDevelopmentTypes,
  publicHttpUrlSchema,
} from "../../domain/global-radar";

export const MAX_GLOBAL_RADAR_ADMIN_BODY_BYTES = 64 * 1_024;
export const GLOBAL_RADAR_LEASE_HEADER = "x-global-radar-lease-token";
export const globalRadarRouteUuidSchema = z.string().uuid();

const boundedReasonSchema = globalRadarAuthoredAuditTextSchema;
const workerFailureReasonSchema = globalRadarOperationalDiagnosticSchema;

export const globalRadarClaimSelectorSchema = z.strictObject({
  trigger: z.enum(["scheduled", "trial"]).default("scheduled"),
  scanMode: z
    .enum(["daily", "thematic", "watchlist_refresh"])
    .default("daily"),
});

export const globalRadarFailBodySchema = z.strictObject({
  runId: globalRadarRouteUuidSchema,
  reason: workerFailureReasonSchema,
});

export const globalRadarAbandonBodySchema = globalRadarFailBodySchema;

export const globalRadarManualRunSchema = z.strictObject({
  requestId: globalRadarRouteUuidSchema,
  theme: z.enum(globalRadarThemes).optional(),
});

const mutationEnvelopeShape = {
  expectedRevision: z.number().int().min(0),
  idempotencyKey: globalRadarRouteUuidSchema,
  reason: boundedReasonSchema,
} as const;

const signalReviewSchema = z.strictObject({
  ...mutationEnvelopeShape,
  command: z.strictObject({
    type: z.enum([
      "request_review",
      "monitor",
      "qualify",
      "dismiss",
      "expire",
      "reopen",
      "mark_no_india_fit",
    ]),
  }),
});

const classificationTargetShape = {
  demandDomain: z.enum(globalRadarDemandFamilies),
} as const;

const nullableAssessmentSchema = z.number().int().min(0).max(100).nullable();

const directDemandAssessmentsSchema = z.strictObject({
  actionability: nullableAssessmentSchema,
  commercialPotential: nullableAssessmentSchema,
  repeatability: nullableAssessmentSchema,
  strategicLearning: nullableAssessmentSchema,
  complianceComplexity: nullableAssessmentSchema,
});

const precursorAssessmentsSchema = z.strictObject({
  proximityToExternalDemand: nullableAssessmentSchema,
  fundingDeploymentMomentum: nullableAssessmentSchema,
  likelyDataHardwareIntensity: nullableAssessmentSchema,
  strategicRelevance: nullableAssessmentSchema,
});

const momentumAssessmentsSchema = z.strictObject({
  taxonomyConsistency: z.number().int().min(0).max(100),
  evidenceQuality: z.number().int().min(0).max(100),
});

const directDemandClassificationSchema = z.strictObject({
  signalClass: z.literal("direct_demand"),
  signalType: z.enum(directDemandAskTypes),
  ...classificationTargetShape,
  primaryEntityId: globalRadarRouteUuidSchema.optional(),
  assessments: directDemandAssessmentsSchema,
  activity: z.strictObject({
    evergreen: z.boolean(),
    expiresAt: isoTimestampSchema.nullable(),
    reobserveBy: isoTimestampSchema.nullable(),
  }),
});

const precursorClassificationSchema = z.strictObject({
  signalClass: z.literal("demand_precursor"),
  signalType: z.enum(precursorDevelopmentTypes),
  ...classificationTargetShape,
  primaryEntityId: globalRadarRouteUuidSchema.optional(),
  assessments: precursorAssessmentsSchema,
});

const momentumClassificationSchema = z.strictObject({
  signalClass: z.literal("ecosystem_momentum"),
  signalType: z.literal("ecosystem_direction"),
  ...classificationTargetShape,
  assessments: momentumAssessmentsSchema,
});

const signalClassificationSchema = z.strictObject({
  ...mutationEnvelopeShape,
  classification: z.discriminatedUnion("signalClass", [
    directDemandClassificationSchema,
    precursorClassificationSchema,
    momentumClassificationSchema,
  ]),
});

const signalExpirySchema = z.strictObject({
  ...mutationEnvelopeShape,
  expiry: z.strictObject({
    evergreen: z.boolean(),
    expiresAt: isoTimestampSchema.nullable(),
    reobserveBy: isoTimestampSchema.nullable(),
  }),
});

export const globalRadarSignalPatchSchema = z.union([
  signalReviewSchema,
  signalClassificationSchema,
  signalExpirySchema,
]);

const adminEvidenceSchema = persistableRadarEvidenceSchema
  .omit({ contributorEntityRef: true, evidenceFingerprint: true })
  .extend({ globalEntityId: globalRadarRouteUuidSchema.nullable() });

export const globalRadarEvidenceBodySchema = z.strictObject({
  ...mutationEnvelopeShape,
  evidence: adminEvidenceSchema,
});

export const globalRadarNoteBodySchema = z.strictObject({
  ...mutationEnvelopeShape,
  body: globalRadarAuthoredAuditTextSchema,
});

export const globalRadarMergeBodySchema = z.strictObject({
  survivorSignalId: globalRadarRouteUuidSchema,
  duplicateSignalId: globalRadarRouteUuidSchema,
  expectedSurvivorRevision: z.number().int().min(0),
  expectedDuplicateRevision: z.number().int().min(0),
  confirmed: z.literal(true),
  idempotencyKey: globalRadarRouteUuidSchema,
  reason: boundedReasonSchema,
});

const boundedText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const stablePublicIdentifierSchema = z.strictObject({
  namespace: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9._:-]*$/),
  value: boundedText(200),
});

const watchlistEntitySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("existing"),
    entityId: globalRadarRouteUuidSchema,
    expectedRevision: z.number().int().min(0),
  }),
  z.strictObject({
    type: z.literal("create"),
    entityId: globalRadarRouteUuidSchema,
    canonicalName: boundedText(200),
    websiteUrl: publicHttpUrlSchema.nullable(),
    linkedinOrganizationUrl: linkedinOrganizationUrlSchema.nullable(),
    stablePublicIdentifiers: z
      .array(stablePublicIdentifierSchema)
      .min(1)
      .max(50),
    canonicalCorporateGroupId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9][a-z0-9._:-]*$/)
      .nullable(),
    headquartersCountry: boundedText(100),
    headquartersCity: boundedText(200).nullable(),
    operatingCountries: z.array(boundedText(100)).max(50).nullable(),
    organisationType: boundedText(200),
    sector: boundedText(200),
    shortDescription: boundedText(2_000),
  }),
]);

const watchlistConfigurationSchema = z.strictObject({
  state: z.enum(["enabled", "paused", "disabled"]),
  priority: z.number().int().min(0).max(100),
  theme: z.enum(globalRadarThemes),
  category: boundedText(200),
  categorySearchTermEn: boundedText(500),
  categorySearchTermZhCn: boundedText(500).nullable(),
  countries: z.array(boundedText(100)).min(1).max(50),
  languages: z.array(z.enum(["en", "zh-CN"])).min(1).max(50),
  cadenceDays: z.number().int().min(1).max(365),
  nextScanAt: isoTimestampSchema.nullable(),
});

export const globalRadarWatchlistBodySchema = z.strictObject({
  entity: watchlistEntitySchema,
  expectedEntryRevision: z.number().int().min(0).nullable(),
  idempotencyKey: globalRadarRouteUuidSchema,
  reason: boundedReasonSchema,
  configuration: watchlistConfigurationSchema,
});

export const globalRadarEntityQualificationBodySchema = z.strictObject({
  entityId: globalRadarRouteUuidSchema,
  ...mutationEnvelopeShape,
});

export const globalRadarPromotionBodySchema = z
  .strictObject({
    entityId: globalRadarRouteUuidSchema,
    primarySignalId: globalRadarRouteUuidSchema,
    supportingSignalIds: z.array(globalRadarRouteUuidSchema).max(20),
    eligibilityPath: z.enum([
      "qualified_india_direct_demand",
      "repeated_india_compatible_signals",
      "documented_indian_relationship",
      "exceptional_strategic_relevance",
    ]),
    expectedEntityRevision: z.number().int().min(0),
    expectedPrimarySignalRevision: z.number().int().min(0),
    expectedSupportingSignalRevisions: z
      .array(
        z.strictObject({
          signalId: globalRadarRouteUuidSchema,
          revision: z.number().int().min(0),
        }),
      )
      .max(20),
    idempotencyKey: globalRadarRouteUuidSchema,
    reason: boundedReasonSchema,
    rationale: boundedReasonSchema,
  })
  .superRefine((value, context) => {
    const supportingIds = new Set(value.supportingSignalIds);
    const revisionIds = new Set(
      value.expectedSupportingSignalRevisions.map(({ signalId }) => signalId),
    );
    if (
      supportingIds.size !== value.supportingSignalIds.length ||
      revisionIds.size !== value.expectedSupportingSignalRevisions.length ||
      supportingIds.has(value.primarySignalId) ||
      supportingIds.size !== revisionIds.size ||
      [...supportingIds].some((id) => !revisionIds.has(id))
    ) {
      context.addIssue({
        code: "custom",
        message: "Supporting signal revisions must match selected signals.",
      });
    }
    if (`${value.reason}\nRationale: ${value.rationale}`.length > 2_000) {
      context.addIssue({
        code: "custom",
        message: "Promotion audit text is too long.",
      });
    }
  });

export const globalRadarPromotionReversalBodySchema = z.strictObject({
  entityId: globalRadarRouteUuidSchema,
  expectedEntityRevision: z.number().int().min(0),
  expectedPrimarySignalRevision: z.number().int().min(0),
  idempotencyKey: globalRadarRouteUuidSchema,
  reason: boundedReasonSchema,
});

const runCountsSchema = z.object({
  resultsExamined: z.number().int().min(0),
  entitiesObserved: z.number().int().min(0),
  signalsFound: z.number().int().min(0),
  directDemands: z.number().int().min(0),
  precursors: z.number().int().min(0),
  momentumRecords: z.number().int().min(0),
  new: z.number().int().min(0),
  updated: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  rejectedForWeakEvidence: z.number().int().min(0),
  sourceErrors: z.number().int().min(0),
});

const runNoticeSchema = z.union([
  z.object({
    code: z.literal("lease_expired"),
    message: z.literal("The worker lease expired before completion."),
    count: z.number().int().min(0).optional(),
  }),
  z.object({
    code: z.literal("run_failed"),
    message: z.literal("The run ended without a completed batch."),
    count: z.number().int().min(0).optional(),
  }),
  z.object({
    code: z.literal("source_errors"),
    message: z.literal("One or more public sources could not be processed."),
    count: z.number().int().min(0).optional(),
  }),
]);

export const globalRadarSafeRunSchema = z
  .object({
    id: globalRadarRouteUuidSchema,
    trigger: z.enum(["scheduled", "manual", "trial"]),
    scanMode: z.enum(["daily", "thematic", "watchlist_refresh", "manual"]),
    status: z.enum(["queued", "running", "succeeded", "partial", "failed"]),
    startedAt: isoTimestampSchema.nullable(),
    completedAt: isoTimestampSchema.nullable(),
    sourceCountries: z.array(z.string().max(100)).max(50),
    sourceLanguages: z.array(z.string().max(35)).max(10),
    targetDomains: z.array(z.string().max(200)).max(50),
    targetSignalTypes: z.array(z.string().max(200)).max(50),
    sourcesUsed: z.array(z.string().max(100)).max(10),
    counts: runCountsSchema,
    notices: z.array(runNoticeSchema).max(10),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .superRefine((run, context) => {
    if (globalRadarJsonContainsSensitiveContent(run)) {
      context.addIssue({
        code: "custom",
        message: "Global Radar run must not contain sensitive content.",
      });
    }
  });
