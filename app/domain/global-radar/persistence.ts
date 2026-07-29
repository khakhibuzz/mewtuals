import { z } from "zod";

import {
  GLOBAL_RADAR_TAXONOMY_VERSION,
  globalRadarDemandFamilies,
  globalRadarLeafIdentifierLookup,
  globalRadarSourceFamilies,
  globalRadarThemes,
} from "../taxonomies/global-radar-v1";
import { indianExecutionArchetypes } from "../taxonomies/indian-execution-archetypes";
import {
  boundedRecordSchema,
  boundedShortStringSchema,
  confidenceSchema,
  directDemandAskTypes,
  fingerprintSchema,
  indiaRelevanceTypes,
  isoTimestampSchema,
  linkedinOrganizationUrlSchema,
  professionalResponsePathSchema,
  publicHttpUrlSchema,
  radarRejectionReasonLookup,
  precursorDevelopmentTypes,
  sensitiveDataAndComplianceSchema,
  sourceErrorSchema,
} from "./contracts";
import {
  canonicalizeEvidenceUrl,
  createEntityIdentity,
  createEvidenceFingerprint,
  createGlobalRadarFingerprint,
  type EntityIdentity,
} from "./normalization";
import { generateGlobalRadarQueries } from "./query-generator";
import { parseGlobalRadarPlanSnapshot } from "./planner";
import {
  normalizedRequirementSchema,
  normalizeRequirements,
} from "./requirements";
import {
  GLOBAL_RADAR_SCORE_VERSION,
  createGlobalRadarMomentumPolicy,
  deriveEcosystemMomentum,
  directDemandComponentsSchema,
  momentumComponentsSchema,
  precursorComponentsSchema,
  scoreDemandPrecursor,
  scoreDirectDemand,
} from "./scoring";
import { systemsContextSchema } from "./systems-context";

export const GLOBAL_RADAR_DEDUPE_VERSION =
  "global-radar-dedupe-v1" as const;

const MAX_BATCH_BYTES = 2 * 1_024 * 1_024;
const applicationRefSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableBoundedArray = z.array(boundedShortStringSchema).max(50).nullable();
const scoreComponentSchema = z.number().int().min(0).max(100);
const documentMarkupPattern =
  /<(?:!doctype\b|\?xml\b|!\[cdata\[|\/?[a-z][a-z0-9:-]*(?:\s[^<>]*?)?\/?>)/i;

const stablePublicIdentifierSchema = z.strictObject({
  namespace: applicationRefSchema,
  value: boundedText(200),
});

export const persistableRadarEntitySchema = z.strictObject({
  entityRef: applicationRefSchema,
  canonicalName: boundedText(200),
  websiteUrl: publicHttpUrlSchema.nullable(),
  linkedinOrganizationUrl: linkedinOrganizationUrlSchema.nullable(),
  stablePublicIdentifiers: z.array(stablePublicIdentifierSchema).max(50),
  canonicalCorporateGroupId: applicationRefSchema.nullable(),
  headquartersCountry: boundedText(100),
  headquartersCity: boundedText(200).nullable(),
  operatingCountries: nullableBoundedArray,
  organisationType: boundedText(200),
  sector: boundedText(200),
  shortDescription: boundedText(2_000),
  rawMetadata: boundedRecordSchema,
});

export const persistableRadarExecutedQuerySchema = z.strictObject({
  fingerprint: fingerprintSchema,
  query: boundedText(1_000),
  language: boundedText(35),
  sourceCountry: boundedText(100),
  theme: z.enum(globalRadarThemes),
  signalIntent: z.enum([
    "direct_demand",
    "demand_precursor",
    "ecosystem_momentum",
  ]),
  sourceAdapter: z.literal("codex_public_web"),
  recencyDays: z.number().int().min(1).max(365),
  ordinal: z.number().int().min(0).max(119),
  executedAt: isoTimestampSchema,
  resultsExamined: z.number().int().min(0).max(10_000),
  error: boundedText(1_000).nullable(),
});

export const persistableRadarEvidenceSchema = z.strictObject({
  contributorEntityRef: applicationRefSchema.nullable(),
  sourceUrl: publicHttpUrlSchema,
  canonicalSourceUrl: publicHttpUrlSchema,
  sourceName: boundedText(200),
  sourceType: boundedText(100),
  sourceLanguage: boundedText(35),
  sourceCountry: boundedText(100),
  sourceFamily: z.enum(globalRadarSourceFamilies),
  claim: boundedText(1_000),
  sourceExcerpt: boundedText(500).nullable(),
  englishSummary: boundedText(2_000),
  publishedAt: isoTimestampSchema.nullable(),
  observedAt: isoTimestampSchema,
  evidenceConfidence: confidenceSchema,
  translationConfidence: confidenceSchema.nullable(),
  isPrimarySource: z.boolean(),
  isSyndicated: z.boolean(),
  supportsDirectDemand: z.boolean(),
  supportsIndiaRelevance: z.boolean(),
  rawMetadata: boundedRecordSchema,
  evidenceFingerprint: fingerprintSchema,
  supportedFieldPaths: z.array(boundedText(200)).min(1).max(50),
});

const associatedEntitySchema = z.strictObject({
  entityRef: applicationRefSchema,
  role: z.enum(["supporting", "contributor"]),
  confidence: confidenceSchema,
});

const indiaRelevanceSchema = z.strictObject({
  relevanceType: z.enum(indiaRelevanceTypes),
  basis: z.enum([
    "exact_public_evidence",
    "mewtuals_interpretation",
    "globally_open",
    "no_current_fit",
  ]),
  rationale: boundedText(2_000),
  reasons: z.array(boundedShortStringSchema).max(50),
  constraints: z.array(boundedShortStringSchema).max(50),
  unknowns: z.array(boundedShortStringSchema).max(50),
  confidence: confidenceSchema,
  regulatoryFacts: boundedRecordSchema.nullable(),
  logisticsFacts: boundedRecordSchema.nullable(),
});

const directDemandScoreSchema = z.strictObject({
  valid: z.literal(true),
  signalClass: z.literal("direct_demand"),
  scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
  score: scoreComponentSchema.nullable(),
  scoreCoverage: scoreComponentSchema,
  qualificationGatesPassed: z.boolean(),
  components: directDemandComponentsSchema,
});

const precursorScoreSchema = z.strictObject({
  valid: z.literal(true),
  signalClass: z.literal("demand_precursor"),
  scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
  score: scoreComponentSchema.nullable(),
  scoreCoverage: scoreComponentSchema,
  qualificationGatesPassed: z.boolean(),
  components: precursorComponentsSchema,
});

const momentumCountSchema = z.strictObject({
  evidenceItems: z.number().int().min(0),
  independentEntities: z.number().int().min(0),
  primarySources: z.number().int().min(0),
  sourceFamilies: z.number().int().min(0),
});
const momentumWindowSchema = z.strictObject({
  recent: z.number().int().min(0),
  preceding: z.number().int().min(0),
});
const momentumScoreSchema = z.strictObject({
  valid: z.literal(true),
  signalClass: z.literal("ecosystem_momentum"),
  scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
  policyVersion: applicationRefSchema,
  taxonomy: z.enum(globalRadarDemandFamilies),
  score: scoreComponentSchema,
  scoreCoverage: z.literal(100),
  qualificationGatesPassed: z.boolean(),
  counts: momentumCountSchema,
  windows: z.strictObject({
    days7: momentumWindowSchema,
    days30: momentumWindowSchema,
    days90: momentumWindowSchema,
  }),
  components: momentumComponentsSchema,
});

const systemsContextWithStackSchema = systemsContextSchema.extend({
  stackType: z.enum(["hardware", "physical_data"]),
});

const baseSignalShape = {
  externalSignalId: applicationRefSchema,
  dedupeKey: fingerprintSchema,
  associatedEntities: z.array(associatedEntitySchema).max(50),
  demandDomain: z.enum(globalRadarDemandFamilies),
  title: boundedText(300),
  factualSummary: boundedText(2_000),
  interpretationSummary: boundedText(2_000),
  theme: z.enum(globalRadarThemes),
  sourceCountry: boundedText(100),
  targetGeographies: nullableBoundedArray,
  collectionGeographies: nullableBoundedArray,
  manufacturingGeographies: nullableBoundedArray,
  deliveryGeographies: nullableBoundedArray,
  industry: boundedText(200),
  targetModelOrSystem: boundedText(500).nullable(),
  targetCapabilityTags: z
    .array(
      z.custom<string>(
        (value) =>
          typeof value === "string" &&
          Object.hasOwn(globalRadarLeafIdentifierLookup, value),
      ),
    )
    .max(50)
    .nullable(),
  requiredCounterpartyArchetypes: z
    .array(z.enum(indianExecutionArchetypes))
    .max(indianExecutionArchetypes.length)
    .nullable(),
  indiaRelevance: indiaRelevanceSchema,
  announcedAt: isoTimestampSchema.nullable(),
  effectiveFrom: isoTimestampSchema.nullable(),
  expiresAt: isoTimestampSchema.nullable(),
  observedAt: isoTimestampSchema,
  initialStatus: z.enum(["newly_discovered", "needs_review"]),
  responsePath: professionalResponsePathSchema.nullable(),
  partnerApplicationUrl: publicHttpUrlSchema.nullable(),
  sourceLanguage: boundedText(35),
  extractionMethod: z.literal("codex_public_web"),
  taxonomyVersion: z.literal(GLOBAL_RADAR_TAXONOMY_VERSION),
  systemsContext: systemsContextWithStackSchema.nullable(),
  sensitiveDataAndCompliance: sensitiveDataAndComplianceSchema,
  rawMetadata: boundedRecordSchema,
  requirements: z.array(normalizedRequirementSchema).min(1).max(100),
  evidence: z.array(persistableRadarEvidenceSchema).min(1).max(100),
} as const;

const directDemandSignalSchema = z.strictObject({
  ...baseSignalShape,
  signalClass: z.literal("direct_demand"),
  signalType: z.enum(directDemandAskTypes),
  primaryEntityRef: applicationRefSchema,
  score: directDemandScoreSchema,
  evergreen: z.boolean(),
  reobserveBy: isoTimestampSchema.nullable(),
});

const precursorSignalSchema = z.strictObject({
  ...baseSignalShape,
  signalClass: z.literal("demand_precursor"),
  signalType: z.enum(precursorDevelopmentTypes),
  primaryEntityRef: applicationRefSchema,
  score: precursorScoreSchema,
  evergreen: z.null(),
  reobserveBy: z.null(),
});

const momentumSignalSchema = z.strictObject({
  ...baseSignalShape,
  signalClass: z.literal("ecosystem_momentum"),
  signalType: z.literal("ecosystem_direction"),
  primaryEntityRef: z.null(),
  score: momentumScoreSchema,
  evergreen: z.null(),
  reobserveBy: z.null(),
});

export const persistableRadarSignalSchema = z
  .discriminatedUnion("signalClass", [
    directDemandSignalSchema,
    precursorSignalSchema,
    momentumSignalSchema,
  ])
  .superRefine((signal, context) => {
    if (signal.signalClass === "direct_demand") {
      if (signal.evergreen !== (signal.reobserveBy !== null)) {
        context.addIssue({
          code: "custom",
          message: "Evergreen demand requires exactly one re-observation deadline.",
          path: ["reobserveBy"],
        });
      }
      if (
        signal.reobserveBy !== null &&
        Date.parse(signal.reobserveBy) <= Date.parse(signal.observedAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "A re-observation deadline must follow its observation.",
          path: ["reobserveBy"],
        });
      }
    }
    if (signal.signalClass === "ecosystem_momentum") {
      const contributors = new Set(
        signal.associatedEntities
          .filter(({ role }) => role === "contributor")
          .map(({ entityRef }) => entityRef),
      );
      if (contributors.size < 2) {
        context.addIssue({
          code: "custom",
          message: "Momentum requires at least two contributor entities.",
          path: ["associatedEntities"],
        });
      }
      signal.evidence.forEach((evidence, index) => {
        if (
          evidence.contributorEntityRef === null ||
          !contributors.has(evidence.contributorEntityRef)
        ) {
          context.addIssue({
            code: "custom",
            message: "Momentum evidence requires an associated contributor.",
            path: ["evidence", index, "contributorEntityRef"],
          });
        }
      });
    }
  });

const rejectionCountsSchema = z
  .record(z.string(), z.number().int().min(0).max(10_000))
  .superRefine((counts, context) => {
    for (const key of Object.keys(counts)) {
      if (!Object.hasOwn(radarRejectionReasonLookup, key)) {
        context.addIssue({
          code: "custom",
          message: "Unknown Global Radar rejection reason.",
          path: [key],
        });
      }
    }
  });

export const persistableGlobalRadarBatchObjectSchema = z.strictObject({
  runId: z.string().uuid(),
  planFingerprint: fingerprintSchema,
  canonicalSubmissionHash: fingerprintSchema,
  executedQueries: z.array(persistableRadarExecutedQuerySchema).max(120),
  entities: z.array(persistableRadarEntitySchema).max(50),
  signals: z.array(persistableRadarSignalSchema).max(20),
  sourceErrors: z.array(sourceErrorSchema).max(50),
  rejections: rejectionCountsSchema,
});

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function containsFictionalExample(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFictionalExample);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      key.toLowerCase().replace(/[^a-z0-9]/g, "") === "fictionalexample" ||
      containsFictionalExample(child),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type CanonicalMomentumEntityContext = Readonly<{
  entityId: string;
  corporateGroupId: string;
}>;

function canonicalMomentumEntityContexts(
  entities: readonly CanonicalPersistableRadarEntity[],
): ReadonlyMap<string, CanonicalMomentumEntityContext> | null {
  const parent = new Map(entities.map(({ entityRef }) => [entityRef, entityRef]));
  const find = (entityRef: string): string => {
    let root = parent.get(entityRef);
    if (!root) throw new Error("Momentum entity context requires a known entity.");
    while (parent.get(root) !== root) root = parent.get(root)!;
    let current = entityRef;
    while (parent.get(current) !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [root, child] = [leftRoot, rightRoot].sort();
    parent.set(child!, root!);
  };
  const ownerByStableIdentifier = new Map<string, string>();
  for (const entity of entities) {
    for (const identifier of entity.identity.stableIdentifiers) {
      const owner = ownerByStableIdentifier.get(identifier);
      if (owner) union(entity.entityRef, owner);
      else ownerByStableIdentifier.set(identifier, entity.entityRef);
    }
  }
  const components = new Map<string, CanonicalPersistableRadarEntity[]>();
  for (const entity of entities) {
    const root = find(entity.entityRef);
    components.set(root, [...(components.get(root) ?? []), entity]);
  }
  const contexts = new Map<string, CanonicalMomentumEntityContext>();
  for (const members of components.values()) {
    const corporateGroupIds = [
      ...new Set(
        members.flatMap(({ canonicalCorporateGroupId }) =>
          canonicalCorporateGroupId === null ? [] : [canonicalCorporateGroupId],
        ),
      ),
    ];
    if (corporateGroupIds.length > 1) return null;
    const entityId = createGlobalRadarFingerprint({
      version: "global-radar-momentum-entity-v1",
      stableIdentifiers: [
        ...new Set(
          members.flatMap(({ identity }) => identity.stableIdentifiers),
        ),
      ].sort(),
    });
    const context = Object.freeze({
      entityId,
      corporateGroupId: corporateGroupIds[0] ?? entityId,
    });
    for (const { entityRef } of members) contexts.set(entityRef, context);
  }
  return contexts;
}

export type PersistableRadarEntity = z.output<
  typeof persistableRadarEntitySchema
>;
export type PersistableRadarSignal = z.output<
  typeof persistableRadarSignalSchema
>;
export type PersistableRadarExecutedQuery = z.output<
  typeof persistableRadarExecutedQuerySchema
>;
export type PersistableGlobalRadarBatch = z.output<
  typeof persistableGlobalRadarBatchObjectSchema
>;
export type CanonicalPersistableRadarEntity = PersistableRadarEntity & {
  identity: EntityIdentity;
};
export type CanonicalPersistableGlobalRadarBatch = Omit<
  PersistableGlobalRadarBatch,
  "entities"
> & {
  entities: readonly CanonicalPersistableRadarEntity[];
};

export type GlobalRadarSignalDedupeInput = Readonly<{
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  primaryEntityRef: string | null;
  associatedEntities: readonly Readonly<{
    entityRef: string;
    role: "supporting" | "contributor";
  }>[];
  demandDomain: string;
  signalType: string;
  theme: string;
  requirements: readonly Readonly<{ fingerprint: string }>[];
  announcedAt: string | null;
  observedAt: string;
  targetGeographies: readonly string[] | null;
  evidence: readonly Readonly<{
    canonicalSourceUrl: string;
    isPrimarySource: boolean;
    isSyndicated: boolean;
  }>[];
}>;

function fixedSevenDayBucket(timestamp: string): string {
  const sevenDays = 7 * 24 * 60 * 60 * 1_000;
  return new Date(Math.floor(Date.parse(timestamp) / sevenDays) * sevenDays)
    .toISOString()
    .slice(0, 10);
}

function normalizedDedupeTerm(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createGlobalRadarPublicIdentityAnchor(
  identity: Pick<EntityIdentity, "stableIdentifiers">,
): string {
  const publicIdentifier = [...identity.stableIdentifiers].sort()[0];
  if (!publicIdentifier) {
    throw new Error("A public identity anchor requires a stable public identifier.");
  }
  return createGlobalRadarFingerprint({
    version: "global-radar-public-identity-anchor-v1",
    publicIdentifier,
  });
}

function entityIdentityAnchor(
  entityRef: string,
  anchorsByRef: ReadonlyMap<string, string>,
): string {
  const anchor = anchorsByRef.get(entityRef);
  if (!anchor) {
    throw new Error("Signal dedupe requires a resolved public identity anchor.");
  }
  return anchor;
}

function sortedEntityIdentityAnchors(
  entityRefs: readonly string[],
  anchorsByRef: ReadonlyMap<string, string>,
): readonly string[] {
  return [...new Set(
    entityRefs.map((entityRef) => entityIdentityAnchor(entityRef, anchorsByRef)),
  )].sort();
}

export function createGlobalRadarSignalDedupeKeyFromIdentityAnchors(
  signal: GlobalRadarSignalDedupeInput,
  anchorsByRef: ReadonlyMap<string, string>,
): string {
  const primarySource = signal.evidence
    .filter(({ isPrimarySource, isSyndicated }) =>
      isPrimarySource && !isSyndicated,
    )
    .map(({ canonicalSourceUrl }) => canonicalSourceUrl)
    .sort()[0];
  if (!primarySource) {
    throw new Error("Signal dedupe requires a non-syndicated primary source.");
  }
  const baseIdentity = {
    version: GLOBAL_RADAR_DEDUPE_VERSION,
    signalClass: signal.signalClass,
    primaryEntityIdentity:
      signal.primaryEntityRef === null
        ? null
        : entityIdentityAnchor(signal.primaryEntityRef, anchorsByRef),
    supportingEntityIdentities: sortedEntityIdentityAnchors(
      signal.associatedEntities
        .filter(({ role }) => role === "supporting")
        .map(({ entityRef }) => entityRef),
      anchorsByRef,
    ),
    signalType: normalizedDedupeTerm(signal.signalType),
    requirementFingerprints: [
      ...new Set(signal.requirements.map(({ fingerprint }) => fingerprint)),
    ].sort(),
    announcedTimeBucket: fixedSevenDayBucket(
      signal.announcedAt ?? signal.observedAt,
    ),
    targetGeographies: [
      ...new Set(
        (signal.targetGeographies ?? []).map(normalizedDedupeTerm),
      ),
    ].sort(),
    primarySource,
  };
  return createGlobalRadarFingerprint(
    signal.signalClass === "ecosystem_momentum"
      ? {
          ...baseIdentity,
          taxonomy: signal.demandDomain,
          theme: signal.theme,
          observationWindowBucket: fixedSevenDayBucket(signal.observedAt),
          contributorEntityIdentities: sortedEntityIdentityAnchors(
            signal.associatedEntities
              .filter(({ role }) => role === "contributor")
              .map(({ entityRef }) => entityRef),
            anchorsByRef,
          ),
        }
      : baseIdentity,
  );
}

export function createGlobalRadarSignalDedupeKey(
  signal: GlobalRadarSignalDedupeInput,
  identitiesByRef: ReadonlyMap<string, EntityIdentity>,
): string {
  return createGlobalRadarSignalDedupeKeyFromIdentityAnchors(
    signal,
    new Map(
      [...identitiesByRef].map(([entityRef, identity]) => [
        entityRef,
        createGlobalRadarPublicIdentityAnchor(identity),
      ]),
    ),
  );
}

export type CanonicalPersistenceBatchResult =
  | Readonly<{
      valid: true;
      batch: CanonicalPersistableGlobalRadarBatch;
    }>
  | Readonly<{
      valid: false;
      reason: "invalid_batch" | "submission_hash_mismatch";
    }>;

export function createGlobalRadarPersistenceHash(
  batch: Omit<PersistableGlobalRadarBatch, "canonicalSubmissionHash">,
): string {
  return createGlobalRadarFingerprint({
    version: "global-radar-canonical-persistence-v1",
    batch,
  });
}

export function globalRadarExecutedQueriesMatchPlan(
  executedQueries: readonly PersistableRadarExecutedQuery[],
  planSnapshot: unknown,
  expectedPlanFingerprint: string,
): boolean {
  const plan = parseGlobalRadarPlanSnapshot(
    planSnapshot,
    expectedPlanFingerprint,
  );
  if (!plan) return false;
  let plannedQueries: ReturnType<typeof generateGlobalRadarQueries>;
  try {
    plannedQueries = generateGlobalRadarQueries(plan);
  } catch {
    return false;
  }
  if (executedQueries.length !== plannedQueries.length) return false;
  const plannedByFingerprint = new Map(
    plannedQueries.map((query) => [query.fingerprint, query]),
  );
  return executedQueries.every((outcome) => {
    const planned = plannedByFingerprint.get(outcome.fingerprint);
    return (
      planned !== undefined &&
      sameJson(
        {
          fingerprint: outcome.fingerprint,
          query: outcome.query,
          language: outcome.language,
          sourceCountry: outcome.sourceCountry,
          theme: outcome.theme,
          signalIntent: outcome.signalIntent,
          sourceAdapter: outcome.sourceAdapter,
          recencyDays: outcome.recencyDays,
          ordinal: outcome.ordinal,
        },
        planned,
      )
    );
  });
}

export function canonicalizeGlobalRadarPersistenceBatch(
  input: unknown,
): CanonicalPersistenceBatchResult {
  if (
    containsFictionalExample(input) ||
    jsonByteLength(input) > MAX_BATCH_BYTES
  ) {
    return Object.freeze({ valid: false, reason: "invalid_batch" });
  }
  const parsed = persistableGlobalRadarBatchObjectSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({ valid: false, reason: "invalid_batch" });
  }
  const entityRefs = new Set<string>();
  const entities: CanonicalPersistableRadarEntity[] = [];
  const entitiesByRef = new Map<string, PersistableRadarEntity>();
  const entityIdentities = new Map<string, EntityIdentity>();
  try {
    for (const entity of parsed.data.entities) {
      if (entityRefs.has(entity.entityRef)) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
      entityRefs.add(entity.entityRef);
      const identity = createEntityIdentity({
        name: entity.canonicalName,
        headquartersCountry: entity.headquartersCountry,
        websiteUrl: entity.websiteUrl,
        linkedinOrganizationUrl: entity.linkedinOrganizationUrl,
        stablePublicIdentifiers: entity.stablePublicIdentifiers,
      });
      if (identity.stableIdentifiers.length === 0) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
      entities.push({
        ...entity,
        identity,
      });
      entitiesByRef.set(entity.entityRef, entity);
      entityIdentities.set(entity.entityRef, identity);
    }
  } catch {
    return Object.freeze({ valid: false, reason: "invalid_batch" });
  }
  const momentumEntityContexts = canonicalMomentumEntityContexts(entities);
  if (!momentumEntityContexts) {
    return Object.freeze({ valid: false, reason: "invalid_batch" });
  }

  const queryFingerprints = new Set<string>();
  const queryOrdinals = new Set<number>();
  for (const query of parsed.data.executedQueries) {
    if (
      queryFingerprints.has(query.fingerprint) ||
      queryOrdinals.has(query.ordinal)
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    queryFingerprints.add(query.fingerprint);
    queryOrdinals.add(query.ordinal);
  }
  for (const sourceError of parsed.data.sourceErrors) {
    if (
      sourceError.queryFingerprint !== null &&
      !queryFingerprints.has(sourceError.queryFingerprint)
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
  }

  const externalSignalIds = new Set<string>();
  const referencedEntityRefs = new Set<string>();
  let evidenceCount = 0;
  let requirementCount = 0;
  for (const signal of parsed.data.signals) {
    if (externalSignalIds.has(signal.externalSignalId)) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    externalSignalIds.add(signal.externalSignalId);
    const associationKeys = signal.associatedEntities.map(
      ({ entityRef, role }) => `${role}:${entityRef}`,
    );
    if (
      new Set(associationKeys).size !== associationKeys.length ||
      (signal.signalClass === "ecosystem_momentum"
        ? signal.associatedEntities.some(({ role }) => role !== "contributor")
        : signal.associatedEntities.some(({ role }) => role !== "supporting"))
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    if (
      (signal.primaryEntityRef !== null &&
        !entityRefs.has(signal.primaryEntityRef)) ||
      signal.associatedEntities.some(
        ({ entityRef }) => !entityRefs.has(entityRef),
      ) ||
      signal.evidence.some(
        ({ contributorEntityRef }) =>
          contributorEntityRef !== null && !entityRefs.has(contributorEntityRef),
      )
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    if (signal.primaryEntityRef !== null) {
      referencedEntityRefs.add(signal.primaryEntityRef);
    }
    signal.associatedEntities.forEach(({ entityRef }) =>
      referencedEntityRefs.add(entityRef),
    );
    signal.evidence.forEach(({ contributorEntityRef }) => {
      if (contributorEntityRef !== null) {
        referencedEntityRefs.add(contributorEntityRef);
      }
    });
    try {
      if (
        createGlobalRadarSignalDedupeKey(signal, entityIdentities) !==
        signal.dedupeKey
      ) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
    } catch {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    evidenceCount += signal.evidence.length;
    requirementCount += signal.requirements.length;
    if (
      [signal.title, signal.factualSummary, signal.interpretationSummary]
        .some((value) => documentMarkupPattern.test(value)) ||
      signal.requirements.some(({ summary }) =>
        documentMarkupPattern.test(summary),
      ) ||
      signal.evidence.some(
        ({ claim, sourceExcerpt, englishSummary }) =>
          documentMarkupPattern.test(claim) ||
          (sourceExcerpt !== null && documentMarkupPattern.test(sourceExcerpt)) ||
          documentMarkupPattern.test(englishSummary),
      )
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    const normalizedRequirements = normalizeRequirements(
      signal.requirements.map(({ fingerprint, ...requirement }) => {
        if (!fingerprint) throw new Error("Requirement fingerprint is required.");
        return requirement;
      }),
    );
    if (
      !normalizedRequirements.valid ||
      !sameJson(normalizedRequirements.requirements, signal.requirements)
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    for (const evidence of signal.evidence) {
      if (
        canonicalizeEvidenceUrl(evidence.sourceUrl) !== evidence.sourceUrl ||
        canonicalizeEvidenceUrl(evidence.canonicalSourceUrl) !==
          evidence.canonicalSourceUrl ||
        createEvidenceFingerprint({
          sourceUrl: evidence.sourceUrl,
          canonicalSourceUrl: evidence.canonicalSourceUrl,
          isPrimarySource: evidence.isPrimarySource,
        }) !== evidence.evidenceFingerprint ||
        (evidence.publishedAt !== null &&
          Date.parse(evidence.publishedAt) > Date.parse(evidence.observedAt))
      ) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
    }
    if (
      signal.responsePath !== null &&
      !signal.evidence.some(
        ({ sourceUrl, canonicalSourceUrl }) =>
          signal.responsePath?.evidenceUrl === sourceUrl ||
          signal.responsePath?.evidenceUrl === canonicalSourceUrl,
      )
    ) {
      return Object.freeze({ valid: false, reason: "invalid_batch" });
    }
    if (signal.signalClass === "direct_demand") {
      const recomputed = scoreDirectDemand(signal.score.components);
      if (!recomputed.valid || !sameJson(recomputed, signal.score)) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
    } else if (signal.signalClass === "demand_precursor") {
      const recomputed = scoreDemandPrecursor(signal.score.components);
      if (!recomputed.valid || !sameJson(recomputed, signal.score)) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
    } else {
      if (signal.score.taxonomy !== signal.demandDomain) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
      const contributorRefs = new Set(
        signal.associatedEntities
          .filter(({ role }) => role === "contributor")
          .map(({ entityRef }) => entityRef),
      );
      if (
        signal.evidence.some(
          ({ contributorEntityRef }) =>
            contributorEntityRef === null ||
            !contributorRefs.has(contributorEntityRef),
        )
      ) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
      const observations = signal.evidence.flatMap((evidence) => {
        if (evidence.isSyndicated || evidence.contributorEntityRef === null) {
          return [];
        }
        if (!contributorRefs.has(evidence.contributorEntityRef)) {
          return [];
        }
        const entity = entitiesByRef.get(evidence.contributorEntityRef);
        const context = momentumEntityContexts.get(
          evidence.contributorEntityRef,
        );
        if (!entity || !context) return [];
        return [
          {
            evidenceId: evidence.evidenceFingerprint,
            entityId: context.entityId,
            corporateGroupId: context.corporateGroupId,
            sourceId: evidence.evidenceFingerprint,
            sourceFamily: evidence.sourceFamily,
            isPrimarySource: evidence.isPrimarySource,
            observedAt: evidence.observedAt,
          },
        ];
      });
      const recomputed = deriveEcosystemMomentum(
        {
          taxonomy: signal.demandDomain,
          taxonomyConsistency: signal.score.components.taxonomyConsistency,
          evidenceQuality: signal.score.components.evidenceQuality,
          observations,
        },
        createGlobalRadarMomentumPolicy(signal.demandDomain),
        { now: () => new Date(signal.observedAt) },
      );
      if (
        !recomputed.valid ||
        !recomputed.qualificationGatesPassed ||
        !sameJson(recomputed, signal.score)
      ) {
        return Object.freeze({ valid: false, reason: "invalid_batch" });
      }
    }
  }
  if (evidenceCount > 100 || requirementCount > 100) {
    return Object.freeze({ valid: false, reason: "invalid_batch" });
  }
  if (
    entities.some(({ entityRef }) => !referencedEntityRefs.has(entityRef))
  ) {
    return Object.freeze({ valid: false, reason: "invalid_batch" });
  }

  const { canonicalSubmissionHash, ...hashableBatch } = parsed.data;
  if (
    createGlobalRadarPersistenceHash(hashableBatch) !== canonicalSubmissionHash
  ) {
    return Object.freeze({
      valid: false,
      reason: "submission_hash_mismatch",
    });
  }
  return Object.freeze({
    valid: true,
    batch: Object.freeze({
      ...parsed.data,
      entities: Object.freeze(entities),
    }),
  });
}
