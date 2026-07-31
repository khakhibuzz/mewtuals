import { z } from "zod";

import {
  GLOBAL_RADAR_PLAN_VERSION,
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_QUERY_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  GLOBAL_RADAR_TAXONOMY_VERSION,
  globalRadarDemandFamilies,
  globalRadarSourceFamilies,
  globalRadarThemes,
  globalRadarValidationProposalSchema,
  indiaRelevanceTypes,
  parseGlobalRadarPlanSnapshot,
  professionalResponsePathTypes,
  promotionEligibilityPaths,
  requirementKinds,
  sensitiveDataFlagStates,
  signalClasses,
  signalStatuses,
  MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS,
  MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS,
} from "../../domain/global-radar";
import { GLOBAL_RADAR_DETAIL_SECTIONS } from "./dto";
import { globalRadarSafeRunSchema } from "./route-schemas";

const uuidSchema = z.string().uuid();
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const nonNegativeIntegerSchema = z.number().int().min(0);
const scoreSchema = z.number().int().min(0).max(100);
const timestampSchema = z.string().datetime({ offset: true });
const boundedText = (maximum = 4_096) =>
  z.string().trim().min(1).max(maximum);
const nullableText = (maximum = 4_096) => boundedText(maximum).nullable();
const stringArray = (maximumItems = 100, maximumLength = 2_000) =>
  z.array(boundedText(maximumLength)).max(maximumItems);
const nullableStringArray = (
  maximumItems = 100,
  maximumLength = 2_000,
) => stringArray(maximumItems, maximumLength).nullable();

const forbiddenNestedKeyMarkers = [
  "apikey",
  "claimpath",
  "databaseurl",
  "errorbody",
  "fullpage",
  "fullpagetext",
  "leasetoken",
  "leasetokenhash",
  "pagecontent",
  "privatefailure",
  "promptinternals",
  "rawmetadata",
  "rawpayload",
  "rejectedbody",
  "stacktrace",
  "submissionhash",
  "workersecret",
] as const;

type JsonLimits = Readonly<{
  maximumDepth: number;
  maximumNodes: number;
  maximumArrayItems: number;
  maximumObjectEntries: number;
  maximumKeyLength: number;
  maximumStringLength: number;
}>;

function forbiddenNestedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (
    normalized === "proto" ||
    normalized === "constructor" ||
    normalized === "prototype"
  ) {
    throw new Error("Global Radar response contains a prototype key.");
  }
  if (normalized === "industrialsecrets") return false;
  return (
    tokens.some((token) =>
      ["authorization", "exception", "password", "secret", "secrets", "sql"].includes(
        token,
      ),
    ) ||
    forbiddenNestedKeyMarkers.some((marker) => normalized.includes(marker))
  );
}

function sanitizeBoundedJson(
  value: unknown,
  limits: JsonLimits,
  allowedSensitiveKeys: ReadonlySet<string>,
): unknown {
  const budget = { nodes: 0 };

  function visit(candidate: unknown, depth: number): unknown {
    budget.nodes += 1;
    if (budget.nodes > limits.maximumNodes || depth > limits.maximumDepth) {
      throw new Error("Global Radar response JSON exceeds its bounds.");
    }
    if (
      candidate === null ||
      typeof candidate === "boolean" ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    ) {
      return candidate;
    }
    if (typeof candidate === "string") {
      if (candidate.length > limits.maximumStringLength) {
        throw new Error("Global Radar response string exceeds its bounds.");
      }
      return candidate;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > limits.maximumArrayItems) {
        throw new Error("Global Radar response array exceeds its bounds.");
      }
      return candidate.map((item) => visit(item, depth + 1));
    }
    if (candidate === null || typeof candidate !== "object") {
      throw new Error("Global Radar response contains a non-JSON value.");
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Global Radar response contains a non-plain object.");
    }
    const entries = Object.entries(candidate);
    if (entries.length > limits.maximumObjectEntries) {
      throw new Error("Global Radar response object exceeds its bounds.");
    }
    const output = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of entries) {
      if (key.length > limits.maximumKeyLength) {
        throw new Error("Global Radar response key exceeds its bounds.");
      }
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        forbiddenNestedKey(key) &&
        !allowedSensitiveKeys.has(normalizedKey)
      ) {
        continue;
      }
      output[key] = visit(item, depth + 1);
    }
    return output;
  }

  return visit(value, 0);
}

function boundedJsonSchema(
  limits: JsonLimits,
  allowedSensitiveKeys: ReadonlySet<string> = new Set(),
) {
  return z.unknown().transform((value, context) => {
    try {
      return sanitizeBoundedJson(value, limits, allowedSensitiveKeys);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid bounded Global Radar response JSON.",
      });
      return z.NEVER;
    }
  });
}

const publicJsonSchema = boundedJsonSchema({
  maximumDepth: 8,
  maximumNodes: 1_000,
  maximumArrayItems: 100,
  maximumObjectEntries: 100,
  maximumKeyLength: 200,
  maximumStringLength: 2_048,
});

const publicJsonObjectSchema = publicJsonSchema.pipe(
  z.record(z.string(), z.unknown()).nullable(),
);

const outputSchemaJsonSchema = boundedJsonSchema(
  {
    maximumDepth: 20,
    maximumNodes: 10_000,
    maximumArrayItems: 500,
    maximumObjectEntries: 100,
    maximumKeyLength: 200,
    maximumStringLength: 4_096,
  },
  new Set(["rawmetadata"]),
);

const canonicalWorkerOutputSchema = z.toJSONSchema(
  globalRadarValidationProposalSchema,
  { io: "input" },
);

function hasExactJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => hasExactJsonValue(value, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftEntries = Object.entries(left);
  const rightRecord = right as Record<string, unknown>;
  return (
    leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(
      ([key, value]) =>
        Object.hasOwn(rightRecord, key) &&
        hasExactJsonValue(value, rightRecord[key]),
    )
  );
}

function childCollection<Item extends z.ZodType>(item: Item) {
  return z.object({
    total: nonNegativeIntegerSchema,
    truncated: z.boolean(),
    items: z.array(item).max(100),
  });
}

const entitySummarySchema = z.object({
  id: uuidSchema,
  canonicalName: boundedText(200),
  headquartersCountry: boundedText(100),
});

const organisationSchema = z.object({
  id: uuidSchema,
  canonicalName: boundedText(200),
  canonicalDomain: nullableText(253),
  websiteUrl: nullableText(2_048),
  linkedinUrl: nullableText(2_048),
  canonicalCorporateGroupId: nullableText(200),
  stablePublicIdentifiers: stringArray(50, 200),
  headquartersCountry: boundedText(100),
  headquartersCity: nullableText(200),
  operatingCountries: nullableStringArray(50, 100),
  organisationType: boundedText(200),
  sector: boundedText(200),
  shortDescription: boundedText(2_000),
  entityStatus: boundedText(100),
  firstSeenAt: timestampSchema,
  lastSeenAt: timestampSchema,
  promotedCandidateId: uuidSchema.nullable(),
  revision: nonNegativeIntegerSchema,
});

const requirementSchema = z.object({
  id: uuidSchema,
  kind: z.enum(requirementKinds),
  capabilityTag: boundedText(200),
  summary: boundedText(2_000),
  dataFamilies: nullableStringArray(50, 200),
  sensorModalities: nullableStringArray(50, 200),
  environments: nullableStringArray(50, 200),
  taskFamilies: nullableStringArray(50, 200),
  collectionMethods: nullableStringArray(50, 200),
  humanRoles: nullableStringArray(50, 200),
  robotEmbodiments: nullableStringArray(50, 200),
  indianExecutionArchetypes: nullableStringArray(50, 200),
  scaleSpecification: publicJsonObjectSchema,
  technicalSpecification: publicJsonObjectSchema,
  qualitySpecification: publicJsonObjectSchema,
  rightsAndComplianceSpecification: publicJsonObjectSchema,
  confidence: scoreSchema,
});

const evidenceCitationSchema = z.object({
  id: uuidSchema,
  sourceUrl: boundedText(2_048),
  canonicalSourceUrl: boundedText(2_048),
  sourceName: boundedText(200),
  sourceType: boundedText(100),
  sourceCountry: boundedText(100),
  sourceFamily: z.enum(globalRadarSourceFamilies),
  publishedAt: timestampSchema.nullable(),
  observedAt: timestampSchema,
  evidenceConfidence: scoreSchema,
  isPrimarySource: z.boolean(),
  isSyndicated: z.boolean(),
  supportsDirectDemand: z.boolean(),
  supportsIndiaRelevance: z.boolean(),
  supportedFieldPaths: stringArray(50, 200),
});

const originalLanguageEvidenceSchema = z.object({
  id: uuidSchema,
  sourceUrl: boundedText(2_048),
  sourceName: boundedText(200),
  lang: boundedText(35),
  dir: z.enum(["ltr", "rtl"]),
  claim: boundedText(1_000),
  excerpt: nullableText(500),
});

const englishEvidenceSchema = z.object({
  id: uuidSchema,
  sourceUrl: boundedText(2_048),
  lang: z.literal("en"),
  summary: boundedText(2_000),
  translationConfidence: scoreSchema.nullable(),
});

const historyItemSchema = z.object({
  id: uuidSchema,
  updateType: z.enum([
    "created",
    "rediscovered",
    "evidence_appended",
    "status_changed",
    "classification_changed",
    "expiry_changed",
    "india_fit_changed",
    "merged",
    "momentum_recomputed",
    "promoted",
    "promotion_reversed",
  ]),
  previousSafeState: publicJsonObjectSchema,
  newSafeState: publicJsonObjectSchema,
  evidenceId: uuidSchema.nullable(),
  actorType: z.enum(["worker", "administrator", "system"]),
  actorEmail: nullableText(320),
  reason: boundedText(2_000),
  observedAt: timestampSchema,
  createdAt: timestampSchema,
});

const noteSchema = z.object({
  id: uuidSchema,
  body: boundedText(2_000),
  actorEmail: nullableText(320),
  observedAt: timestampSchema,
  createdAt: timestampSchema,
});

const signalListItemSchema = z.object({
  id: uuidSchema,
  signalClass: z.enum(signalClasses),
  title: boundedText(2_000),
  factualSummary: boundedText(4_000),
  theme: z.enum(globalRadarThemes),
  sourceCountry: boundedText(100),
  demandDomain: z.enum(globalRadarDemandFamilies),
  indiaRelevanceType: z.enum(indiaRelevanceTypes),
  status: z.enum(signalStatuses),
  score: scoreSchema.nullable(),
  expiresAt: timestampSchema.nullable(),
  reobserveBy: timestampSchema.nullable(),
  observedAt: timestampSchema,
  revision: nonNegativeIntegerSchema,
  organisation: entitySummarySchema.nullable(),
});

const promotionSummarySchema = z.object({
  id: uuidSchema,
  status: z.enum(["active", "reversed", "failed", "conflicted"]),
  discoveryCandidateId: uuidSchema.nullable(),
  promotedAt: timestampSchema.nullable(),
  reversedAt: timestampSchema.nullable(),
});

const watchlistItemSchema = z.object({
  id: uuidSchema,
  globalEntityId: uuidSchema,
  state: z.enum(["enabled", "paused", "disabled"]),
  priority: z.number().int().min(0).max(100),
  theme: z.enum(globalRadarThemes),
  category: boundedText(200),
  categorySearchTermEn: boundedText(500),
  categorySearchTermZhCn: nullableText(500),
  countries: stringArray(50, 100),
  languages: z.array(z.enum(["en", "zh-CN"])).max(2),
  cadenceDays: z.number().int().min(1).max(3_650),
  nextScanAt: timestampSchema.nullable(),
  reason: boundedText(2_000),
  revision: nonNegativeIntegerSchema,
  entity: z.object({
    canonicalName: boundedText(200),
    headquartersCountry: boundedText(100),
    entityStatus: boundedText(100),
    revision: nonNegativeIntegerSchema,
  }),
  latestSignal: signalListItemSchema.nullable(),
  expiry: z
    .object({
      expiresAt: timestampSchema.nullable(),
      reobserveBy: timestampSchema.nullable(),
    })
    .nullable(),
  promotion: promotionSummarySchema.nullable(),
});

const promotionSchema = z.object({
  id: uuidSchema,
  globalEntityId: uuidSchema,
  primarySignalId: uuidSchema,
  supportingSignalIds: z.array(uuidSchema).max(21),
  eligibilityPath: z.enum(promotionEligibilityPaths),
  discoveryRunId: uuidSchema.nullable(),
  discoveryCandidateId: uuidSchema.nullable(),
  status: z.enum(["active", "reversed", "failed", "conflicted"]),
  promotedAt: timestampSchema.nullable(),
  reversedAt: timestampSchema.nullable(),
  revisionContext: z.object({
    expectedEntity: nonNegativeIntegerSchema,
    expectedPrimarySignal: nonNegativeIntegerSchema,
    promotedEntity: nonNegativeIntegerSchema.nullable(),
    promotedPrimarySignal: nonNegativeIntegerSchema.nullable(),
  }),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

function detailSection<
  Id extends string,
  Title extends string,
  Data extends z.ZodType,
>(id: Id, title: Title, data: Data) {
  return z.object({
    id: z.literal(id),
    title: z.literal(title),
    data,
  });
}

const associatedOrganisationSchema = z.object({
  role: z.enum(["supporting", "contributor"]),
  confidence: scoreSchema,
  organisation: organisationSchema.nullable(),
});

const requirementSummarySchema = z.object({
  id: uuidSchema,
  kind: z.enum(requirementKinds),
  capabilityTag: boundedText(200),
  summary: boundedText(2_000),
  confidence: scoreSchema,
});

const targetEnvironmentSchema = z.object({
  requirementId: uuidSchema,
  environments: nullableStringArray(50, 200),
  taskFamilies: nullableStringArray(50, 200),
  collectionMethods: nullableStringArray(50, 200),
  humanRoles: nullableStringArray(50, 200),
  robotEmbodiments: nullableStringArray(50, 200),
});

const scaleRequirementSchema = z.object({
  requirementId: uuidSchema,
  scaleSpecification: publicJsonObjectSchema,
});

const globalRadarAllowedActions = [
  "request_review",
  "monitor",
  "qualify",
  "dismiss",
  "expire",
  "reopen",
  "mark_no_india_fit",
  "edit_classification",
  "edit_expiry",
  "append_evidence",
  "append_note",
  "merge",
  "edit_watchlist",
  "qualify_entity",
  "promote",
  "reverse_promotion",
] as const;

const allowedActionsSchema = z
  .array(z.enum(globalRadarAllowedActions))
  .max(globalRadarAllowedActions.length);

const nullableScoreSchema = scoreSchema.nullable();
const nullableCountSchema = nonNegativeIntegerSchema.nullable();
const nullableSensitiveDataFlagSchema = z
  .enum(sensitiveDataFlagStates)
  .nullable();

const sensitiveDataFlagsResponseSchema = z.object({
  faces: nullableSensitiveDataFlagSchema,
  voices: nullableSensitiveDataFlagSchema,
  biometrics: nullableSensitiveDataFlagSchema,
  gaze: nullableSensitiveDataFlagSchema,
  health: nullableSensitiveDataFlagSchema,
  children: nullableSensitiveDataFlagSchema,
  homeInteriors: nullableSensitiveDataFlagSchema,
  workplaceMonitoring: nullableSensitiveDataFlagSchema,
  preciseLocation: nullableSensitiveDataFlagSchema,
  roadUsers: nullableSensitiveDataFlagSchema,
  employeeData: nullableSensitiveDataFlagSchema,
  industrialSecrets: nullableSensitiveDataFlagSchema,
  defenceOrDualUse: nullableSensitiveDataFlagSchema,
  copyrightedMaterial: nullableSensitiveDataFlagSchema,
  exportControls: nullableSensitiveDataFlagSchema,
});

const complianceFactsResponseSchema = z.object({
  consent: z.boolean().nullable(),
  deIdentification: z.boolean().nullable(),
  legalReview: z.boolean().nullable(),
  knownResidencyRequirements: z.boolean().nullable(),
  participantRightsComplexity: z.boolean().nullable(),
});

const directDemandScoreComponentsSchema = z.object({
  demandExplicitness: nullableScoreSchema,
  evidenceConfidence: nullableScoreSchema,
  freshness: nullableScoreSchema,
  actionability: nullableScoreSchema,
  indiaFit: nullableScoreSchema,
  commercialPotential: nullableScoreSchema,
  repeatability: nullableScoreSchema,
  responseAccessibility: nullableScoreSchema,
  strategicLearning: nullableScoreSchema,
  complianceComplexity: nullableScoreSchema,
});

const precursorScoreComponentsSchema = z.object({
  evidenceConfidence: nullableScoreSchema,
  proximityToExternalDemand: nullableScoreSchema,
  fundingDeploymentMomentum: nullableScoreSchema,
  likelyDataHardwareIntensity: nullableScoreSchema,
  indiaFit: nullableScoreSchema,
  estimatedTimeHorizon: nullableScoreSchema,
  strategicRelevance: nullableScoreSchema,
});

const momentumScoreComponentsSchema = z.object({
  independentEntityCount: nullableCountSchema,
  primarySourceCount: nullableCountSchema,
  sourceFamilyCount: nullableCountSchema,
  volume7Days: nullableCountSchema,
  volume30Days: nullableCountSchema,
  volume90Days: nullableCountSchema,
  independentEntityBreadth: nullableScoreSchema,
  primarySourceDepth: nullableScoreSchema,
  sourceDiversity: nullableScoreSchema,
  weightedVolume: nullableScoreSchema,
  growthVsPreviousPeriod: nullableScoreSchema,
  taxonomyConsistency: nullableScoreSchema,
  evidenceQuality: nullableScoreSchema,
  policyVersion: z
    .literal(GLOBAL_RADAR_MOMENTUM_POLICY_VERSION)
    .nullable(),
  qualificationGatesPassed: z.boolean().nullable(),
});

const scoreEvidenceComponentSchema = z.enum([
  "demandExplicitness",
  "evidenceConfidence",
  "freshness",
  "actionability",
  "indiaFit",
  "commercialPotential",
  "repeatability",
  "responseAccessibility",
  "strategicLearning",
  "complianceComplexity",
  "proximityToExternalDemand",
  "fundingDeploymentMomentum",
  "likelyDataHardwareIntensity",
  "estimatedTimeHorizon",
  "strategicRelevance",
  "independentEntityCount",
  "primarySourceCount",
  "sourceFamilyCount",
  "volume7Days",
  "volume30Days",
  "volume90Days",
  "independentEntityBreadth",
  "primarySourceDepth",
  "sourceDiversity",
  "weightedVolume",
  "growthVsPreviousPeriod",
  "taxonomyConsistency",
  "evidenceQuality",
]);

const scoreComponentEvidenceAssociationSchema = z.object({
  component: scoreEvidenceComponentSchema,
  value: scoreSchema,
  basis: z.enum(["worker_evidence", "server_derived"]),
  rationale: boundedText(500),
  evidence: z
    .array(
      z.object({
        id: uuidSchema,
        sourceUrl: boundedText(2_048),
        sourceName: boundedText(200),
        matchedFieldPaths: stringArray(
          MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS,
          200,
        ),
      }),
    )
    .min(1)
    .max(MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS),
});

const scoreEvidenceResponseShape = {
  evidenceVersion: z.literal(GLOBAL_RADAR_SCORE_EVIDENCE_VERSION),
  componentEvidence: z.array(scoreComponentEvidenceAssociationSchema).max(20),
} as const;

const scoreRationaleResponseSchema = z.discriminatedUnion("activeClass", [
  z.object({
    activeClass: z.literal("direct_demand"),
    score: nullableScoreSchema,
    coverage: scoreSchema,
    policyVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    components: directDemandScoreComponentsSchema,
    ...scoreEvidenceResponseShape,
  }),
  z.object({
    activeClass: z.literal("demand_precursor"),
    score: nullableScoreSchema,
    coverage: scoreSchema,
    policyVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    components: precursorScoreComponentsSchema,
    ...scoreEvidenceResponseShape,
  }),
  z.object({
    activeClass: z.literal("ecosystem_momentum"),
    score: nullableScoreSchema,
    coverage: scoreSchema,
    policyVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    components: momentumScoreComponentsSchema,
    ...scoreEvidenceResponseShape,
  }),
]);

const signalDetailSectionsSchema = z.tuple([
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[0][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[0][1],
    z.object({
      primary: organisationSchema.nullable(),
      associated: childCollection(associatedOrganisationSchema),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[1][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[1][1],
    z.object({
      title: boundedText(2_000),
      observedAt: timestampSchema,
      firstSeenAt: timestampSchema,
      lastSeenAt: timestampSchema,
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[2][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[2][1],
    z.object({
      signalClass: z.enum(signalClasses),
      signalType: boundedText(200),
      theme: z.enum(globalRadarThemes),
      demandDomain: z.enum(globalRadarDemandFamilies),
      sourceCountry: boundedText(100),
      industry: boundedText(200),
      status: z.enum(signalStatuses),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[3][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[3][1],
    z.object({
      factualSummary: boundedText(4_000),
      targetGeographies: nullableStringArray(50, 200),
      collectionGeographies: nullableStringArray(50, 200),
      manufacturingGeographies: nullableStringArray(50, 200),
      deliveryGeographies: nullableStringArray(50, 200),
      targetModelOrSystem: nullableText(500),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[4][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[4][1],
    z.object({ summary: boundedText(4_000) }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[5][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[5][1],
    z.object({
      targetCapabilityTags: nullableStringArray(50, 200),
      requiredCounterpartyArchetypes: nullableStringArray(50, 200),
      requirements: childCollection(requirementSummarySchema),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[6][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[6][1],
    z.object({ items: z.array(requirementSchema).max(100) }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[7][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[7][1],
    z.object({ items: z.array(targetEnvironmentSchema).max(100) }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[8][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[8][1],
    z.object({ items: stringArray(50, 200) }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[9][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[9][1],
    z.object({
      relevanceType: z.enum(indiaRelevanceTypes),
      rationale: boundedText(4_000),
      reasons: stringArray(50, 500),
      constraints: stringArray(50, 500),
      unknowns: stringArray(50, 500),
      confidence: scoreSchema,
      regulatoryFacts: publicJsonObjectSchema,
      logisticsFacts: publicJsonObjectSchema,
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[10][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[10][1],
    z.object({
      summary: nullableText(4_000),
      stackType: nullableText(200),
      higherLevelSystemGoal: nullableText(2_000),
      relevantStackLayer: nullableText(200),
      lowerLevelInputsRequired: nullableStringArray(50, 500),
      transformationOrCapabilityAdded: nullableText(2_000),
      downstreamModelOrRobotBehavior: nullableText(2_000),
      whyTheRequirementMatters: nullableText(2_000),
      possibleIndianExecutionRole: nullableText(2_000),
      factualElements: nullableStringArray(50, 1_000),
      inferredElements: nullableStringArray(50, 1_000),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[11][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[11][1],
    z.object({
      timeline: z.object({
        announcedAt: timestampSchema.nullable(),
        effectiveFrom: timestampSchema.nullable(),
        expiresAt: timestampSchema.nullable(),
        evergreen: z.boolean().nullable(),
        reobserveBy: timestampSchema.nullable(),
        observedAt: timestampSchema,
      }),
      requirements: z.array(scaleRequirementSchema).max(100),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[12][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[12][1],
    z.object({
      evidenceOnly: z.literal(true),
      type: z.enum(professionalResponsePathTypes).nullable(),
      url: nullableText(2_048),
      businessEmail: nullableText(320),
      partnerApplicationUrl: nullableText(2_048),
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[13][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[13][1],
    z.object({
      sensitiveDataFlags: sensitiveDataFlagsResponseSchema,
      facts: complianceFactsResponseSchema,
    }),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[14][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[14][1],
    childCollection(evidenceCitationSchema),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[15][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[15][1],
    childCollection(originalLanguageEvidenceSchema),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[16][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[16][1],
    childCollection(englishEvidenceSchema),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[17][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[17][1],
    scoreRationaleResponseSchema,
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[18][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[18][1],
    childCollection(historyItemSchema),
  ),
  detailSection(
    GLOBAL_RADAR_DETAIL_SECTIONS[19][0],
    GLOBAL_RADAR_DETAIL_SECTIONS[19][1],
    z.object({
      notes: childCollection(noteSchema),
      watchlist: watchlistItemSchema.nullable(),
      promotion: promotionSchema.nullable(),
      allowedActions: allowedActionsSchema,
    }),
  ),
]);

const signalDetailSchema = z.object({
  id: uuidSchema,
  revision: nonNegativeIntegerSchema,
  signalClass: z.enum(signalClasses),
  status: z.enum(signalStatuses),
  allowedActions: allowedActionsSchema,
  sections: signalDetailSectionsSchema,
});

const mutationEntitySchema = z.object({
  id: uuidSchema,
  canonicalName: boundedText(200),
  headquartersCountry: boundedText(100),
  entityStatus: boundedText(100),
  revision: nonNegativeIntegerSchema,
});

const mutationWatchlistEntrySchema = z.object({
  id: uuidSchema,
  globalEntityId: uuidSchema,
  state: z.enum(["enabled", "paused", "disabled"]),
  priority: z.number().int().min(0).max(100),
  theme: z.enum(globalRadarThemes),
  category: boundedText(200),
  categorySearchTermEn: boundedText(500),
  categorySearchTermZhCn: nullableText(500),
  countries: stringArray(50, 100),
  languages: z.array(z.enum(["en", "zh-CN"])).max(2),
  cadenceDays: z.number().int().min(1).max(3_650),
  nextScanAt: timestampSchema.nullable(),
  reason: boundedText(2_000),
  revision: nonNegativeIntegerSchema,
});

const claimQuerySchema = z.object({
  fingerprint: fingerprintSchema,
  query: boundedText(1_000),
  language: z.enum(["en", "zh-CN"]),
  sourceCountry: boundedText(100),
  theme: z.enum(globalRadarThemes),
  signalIntent: z.enum(signalClasses),
  sourceAdapter: z.literal("codex_public_web"),
  recencyDays: z.number().int().min(1).max(365),
  ordinal: z.number().int().min(0).max(119),
});

const claimConfigSchema = z.object({
  countries: stringArray(50, 100),
  languages: z.array(z.enum(["en", "zh-CN"])).max(2),
  themes: z.array(z.enum(globalRadarThemes)).max(globalRadarThemes.length),
  enabledSources: z.array(z.literal("codex_public_web")).max(1),
  resultLimit: z.number().int().min(1).max(20),
  thresholds: z.object({
    direct_demand: scoreSchema,
    demand_precursor: scoreSchema,
    ecosystem_momentum: scoreSchema,
  }),
});

const workerClaimFieldsSchema = z.object({
  runId: uuidSchema,
  leaseToken: boundedText(512),
  leaseExpiresAt: timestampSchema,
  versions: z.object({
    prompt: z.literal(GLOBAL_RADAR_PROMPT_VERSION),
    schema: z.literal(GLOBAL_RADAR_SCHEMA_VERSION),
    taxonomy: z.literal(GLOBAL_RADAR_TAXONOMY_VERSION),
    scoring: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    plan: z.literal(GLOBAL_RADAR_PLAN_VERSION),
    query: z.literal(GLOBAL_RADAR_QUERY_VERSION),
  }),
  plan: z.unknown(),
  queries: z.array(claimQuerySchema).max(120),
  config: claimConfigSchema,
  outputSchema: z.unknown(),
});

const outputSchemaEnvelopeSchema = z
  .object({
    $schema: z.literal("https://json-schema.org/draft/2020-12/schema"),
    type: z.literal("object"),
    properties: z.record(z.string().max(200), z.unknown()),
    required: z.array(boundedText(200)).min(1).max(500),
    additionalProperties: z.literal(false),
  })
  .superRefine((schema, context) => {
    for (const requiredProperty of schema.required) {
      if (!Object.hasOwn(schema.properties, requiredProperty)) {
        context.addIssue({
          code: "custom",
          path: ["required"],
          message: "Global Radar output schema requires an unknown property.",
        });
      }
    }
  });

export function safeGlobalRadarWorkerClaim(value: unknown) {
  const parsed = workerClaimFieldsSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const plan = parseGlobalRadarPlanSnapshot(parsed.data.plan);
  if (!plan) return undefined;
  const sanitizedOutput = outputSchemaJsonSchema.safeParse(
    parsed.data.outputSchema,
  );
  if (!sanitizedOutput.success) return undefined;
  if (!hasExactJsonValue(sanitizedOutput.data, canonicalWorkerOutputSchema)) {
    return undefined;
  }
  const outputSchema = outputSchemaEnvelopeSchema.safeParse(
    sanitizedOutput.data,
  );
  if (!outputSchema.success) return undefined;
  return {
    runId: parsed.data.runId,
    leaseToken: parsed.data.leaseToken,
    leaseExpiresAt: parsed.data.leaseExpiresAt,
    versions: parsed.data.versions,
    plan,
    queries: parsed.data.queries,
    config: parsed.data.config,
    outputSchema: outputSchema.data,
  };
}

const adminResponseValueSchemas = {
  page: z.number().int().min(1).max(100),
  pageSize: z.number().int().min(1).max(100),
  total: nonNegativeIntegerSchema,
  revision: nonNegativeIntegerSchema,
  run: globalRadarSafeRunSchema,
  runs: z.array(globalRadarSafeRunSchema).max(100),
  detail: signalDetailSchema,
  latest: signalDetailSchema,
  survivor: signalDetailSchema,
  duplicate: signalDetailSchema,
  entity: mutationEntitySchema,
  entry: mutationWatchlistEntrySchema,
  promotion: promotionSchema,
} as const;

export type GlobalRadarAdminResponseValueKey =
  keyof typeof adminResponseValueSchemas;

export function safeGlobalRadarAdminResponseValue(
  key: GlobalRadarAdminResponseValueKey,
  value: unknown,
): { success: true; value: unknown } | { success: false } {
  const parsed = adminResponseValueSchemas[key].safeParse(value);
  return parsed.success
    ? { success: true, value: parsed.data }
    : { success: false };
}
