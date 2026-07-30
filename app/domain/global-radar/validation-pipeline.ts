import { z } from "zod";

import {
  GLOBAL_RADAR_TAXONOMY_VERSION,
  globalRadarDemandFamilies,
  globalRadarTaxonomy,
  globalRadarThemes,
} from "../taxonomies/global-radar-v1";
import {
  boundedRecordSchema,
  boundedShortStringSchema,
  directDemandAskSchema,
  directDemandAskTypes,
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  indiaRelevanceTypes,
  isoTimestampSchema,
  nullableBoundedStringArraySchema,
  precursorDevelopmentTypes,
  professionalResponsePathSchema,
  radarRejectionReasons,
  sensitiveDataAndComplianceSchema,
  serializedJsonByteLength,
  sourceErrorSchema,
  type CandidateEvidence,
  type RadarRejectionReason,
  type SourceError,
} from "./contracts";
import { classifySignal } from "./classification";
import {
  normalizeRadarEvidence,
  radarEvidenceProposalSchema,
  type NormalizedRadarEvidence,
  type RadarEvidenceNormalizationFailureReason,
} from "./evidence";
import {
  assessIndiaRelevance,
  type IndiaRelevanceAssessment,
} from "./india-relevance";
import {
  createEntityIdentity,
  createQueryFingerprint,
  type EntityIdentity,
} from "./normalization";
import {
  canonicalizeGlobalRadarPersistenceBatch,
  createGlobalRadarPersistenceHash,
  createGlobalRadarSignalDedupeKey,
  persistableGlobalRadarBatchObjectSchema,
  persistableRadarEntitySchema,
  persistableRadarEvidenceSchema,
  persistableRadarExecutedQuerySchema,
  persistableRadarSignalSchema,
  type PersistableGlobalRadarBatch,
  type PersistableRadarEntity,
  type PersistableRadarExecutedQuery,
  type PersistableRadarSignal,
} from "./persistence";
import {
  normalizedRequirementInputSchema,
  normalizeRequirements,
  type NormalizedRequirement,
} from "./requirements";
import {
  calculateFreshness,
  calculateTimeHorizon,
  createGlobalRadarMomentumPolicy,
  deriveEcosystemMomentum,
  directDemandComponentsSchema,
  precursorComponentsSchema,
  scoreDemandPrecursor,
  scoreDirectDemand,
  type DirectDemandScoreResult,
  type MomentumDerivationResult,
  type PrecursorScoreResult,
  type RadarClock,
} from "./scoring";
import {
  systemsContextSchema,
  validateSystemsContext,
  type SystemsContext,
} from "./systems-context";
import { determineInitialSignalStatus } from "./transitions";

const MAX_BATCH_BYTES = 2 * 1_024 * 1_024;
const documentMarkupPattern =
  /<(?:!doctype\b|\?xml\b|!\[cdata\[|\/?[a-z][a-z0-9:-]*(?:\s[^<>]*?)?\/?>)/i;
const applicationRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableTimestamp = isoTimestampSchema.nullable();
const associatedEntityProposalSchema = z.strictObject({
  entityRef: applicationRefSchema,
  role: z.enum(["supporting", "contributor"]),
  confidence: z.number().int().min(0).max(100),
});
const systemsContextProposalSchema = systemsContextSchema.extend({
  stackType: z.enum(["hardware", "physical_data"]),
});
const proposedIndiaRelevanceSchema = z.strictObject({
  proposedType: z.enum(indiaRelevanceTypes),
  rationale: boundedText(2_000),
  reasons: z.array(boundedShortStringSchema).max(50),
  constraints: z.array(boundedShortStringSchema).max(50),
  unknowns: z.array(boundedShortStringSchema).max(50),
  confidence: z.number().int().min(0).max(100),
  regulatoryFacts: boundedRecordSchema.nullable(),
  logisticsFacts: boundedRecordSchema.nullable(),
});
const requirementProposalSchema = normalizedRequirementInputSchema.extend({
  globallyDeliverable: z.boolean().nullable(),
  openToExternalCounterparties: z.boolean().nullable(),
});

const baseSignalProposalShape = {
  externalSignalId: applicationRefSchema,
  associatedEntities: z.array(associatedEntityProposalSchema).max(50),
  demandDomain: z.enum(globalRadarDemandFamilies),
  title: boundedText(300),
  factualSummary: boundedText(2_000),
  interpretationSummary: boundedText(2_000),
  theme: z.enum(globalRadarThemes),
  sourceCountry: boundedText(100),
  targetGeographies: nullableBoundedStringArraySchema,
  collectionGeographies: nullableBoundedStringArraySchema,
  manufacturingGeographies: nullableBoundedStringArraySchema,
  deliveryGeographies: nullableBoundedStringArraySchema,
  industry: boundedText(200),
  targetModelOrSystem: boundedText(500).nullable(),
  indiaRelevance: proposedIndiaRelevanceSchema,
  announcedAt: nullableTimestamp,
  effectiveFrom: nullableTimestamp,
  responsePath: professionalResponsePathSchema.nullable(),
  systemsContext: systemsContextProposalSchema.nullable(),
  sensitiveDataAndCompliance: sensitiveDataAndComplianceSchema,
  rawMetadata: boundedRecordSchema,
  requirements: z.array(requirementProposalSchema).min(1).max(100),
  evidence: z.array(radarEvidenceProposalSchema).min(1).max(100),
} as const;

const directDemandSignalProposalSchema = z.strictObject({
  ...baseSignalProposalShape,
  signalClass: z.literal("direct_demand"),
  primaryEntityRef: applicationRefSchema,
  signalType: z.enum(directDemandAskTypes),
  directDemandAsk: directDemandAskSchema,
  precursorDevelopmentType: z.null(),
  momentumMetrics: z.null(),
  scoreComponents: directDemandComponentsSchema,
  evergreen: z.boolean(),
  reobserveBy: nullableTimestamp,
});

const precursorSignalProposalSchema = z.strictObject({
  ...baseSignalProposalShape,
  signalClass: z.literal("demand_precursor"),
  primaryEntityRef: applicationRefSchema,
  signalType: z.enum(precursorDevelopmentTypes),
  directDemandAsk: z.null(),
  precursorDevelopmentType: z.enum(precursorDevelopmentTypes),
  momentumMetrics: z.null(),
  scoreComponents: precursorComponentsSchema,
  evergreen: z.null(),
  reobserveBy: z.null(),
});

const momentumSignalProposalSchema = z.strictObject({
  ...baseSignalProposalShape,
  signalClass: z.literal("ecosystem_momentum"),
  primaryEntityRef: z.null(),
  signalType: z.literal("ecosystem_direction"),
  directDemandAsk: z.null(),
  precursorDevelopmentType: z.null(),
  momentumMetrics: z.strictObject({
    taxonomyConsistency: z.number().int().min(0).max(100),
    evidenceQuality: z.number().int().min(0).max(100),
  }),
  scoreComponents: z.null(),
  evergreen: z.null(),
  reobserveBy: z.null(),
});

function containsFullPageLikeText(value: unknown): boolean {
  if (typeof value === "string") {
    const words = value.match(/\p{L}[\p{L}\p{N}'’-]*/gu)?.length ?? 0;
    return documentMarkupPattern.test(value) || words > 300;
  }
  if (Array.isArray(value)) return value.some(containsFullPageLikeText);
  if (value === null || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(
    containsFullPageLikeText,
  );
}

export const radarSignalProposalSchema = z
  .discriminatedUnion("signalClass", [
    directDemandSignalProposalSchema,
    precursorSignalProposalSchema,
    momentumSignalProposalSchema,
  ])
  .superRefine((proposal, context) => {
    if (containsFullPageLikeText(proposal)) {
      context.addIssue({
        code: "custom",
        message: "Signal proposals must contain concise plain text.",
      });
    }
  });

export const radarExecutedQueryProposalSchema =
  persistableRadarExecutedQuerySchema;

const validationProposalShape = {
  schemaVersion: z.literal(GLOBAL_RADAR_SCHEMA_VERSION),
  promptVersion: z.literal(GLOBAL_RADAR_PROMPT_VERSION),
  taxonomyVersion: z.literal(GLOBAL_RADAR_TAXONOMY_VERSION),
  runId: z.string().uuid(),
  planFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  executedQueries: z.array(radarExecutedQueryProposalSchema).max(120),
  entities: z.array(persistableRadarEntitySchema).max(50),
  signals: z.array(radarSignalProposalSchema).max(20),
  sourceErrors: z.array(sourceErrorSchema).max(50),
} as const;

function addProposalTotalsIssues(
  proposal: {
    signals: readonly z.output<typeof radarSignalProposalSchema>[];
    sourceErrors: readonly SourceError[];
    executedQueries: readonly PersistableRadarExecutedQuery[];
  },
  context: z.RefinementCtx,
): void {
  const evidenceCount = proposal.signals.reduce(
    (total, signal) => total + signal.evidence.length,
    0,
  );
  const requirementCount = proposal.signals.reduce(
    (total, signal) => total + signal.requirements.length,
    0,
  );
  if (evidenceCount > 100) {
    context.addIssue({
      code: "custom",
      message: "Global Radar proposal must contain at most 100 evidence items.",
      path: ["signals"],
    });
  }
  if (requirementCount > 100) {
    context.addIssue({
      code: "custom",
      message: "Global Radar proposal must contain at most 100 requirements.",
      path: ["signals"],
    });
  }
  if (
    proposal.signals.length === 0 &&
    (proposal.sourceErrors.length > 0 ||
      proposal.executedQueries.some((query) => query.error !== null))
  ) {
    context.addIssue({
      code: "custom",
      message: "An honest-zero proposal cannot report source failures.",
      path: ["signals"],
    });
  }
}

export const globalRadarValidationProposalSchema = z
  .strictObject(validationProposalShape)
  .superRefine(addProposalTotalsIssues);

export const globalRadarBatchProposalSchema =
  globalRadarValidationProposalSchema;

const validationEnvelopeSchema = z.strictObject({
  ...validationProposalShape,
  signals: z.array(z.unknown()).max(20),
});

export type RadarSignalProposal = Readonly<
  z.output<typeof radarSignalProposalSchema>
>;
export type GlobalRadarValidationProposal = Readonly<
  z.output<typeof globalRadarValidationProposalSchema>
>;
export type GlobalRadarBatchProposal = GlobalRadarValidationProposal;
export type ValidatedExecutedQuery = PersistableRadarExecutedQuery;
export type ValidatedRadarSignal = PersistableRadarSignal;
export type SafeSourceError = SourceError;
export type ValidatedRadarBatch = Readonly<PersistableGlobalRadarBatch>;

export type RadarValidationContext = Readonly<{
  clock: RadarClock;
  expectedRunId?: string;
  expectedPlanFingerprint?: string;
  expectedExecutedQueries?: readonly Readonly<{
    query: string;
    language: string;
    sourceCountry: string;
    theme: string;
    signalIntent:
      | "direct_demand"
      | "demand_precursor"
      | "ecosystem_momentum";
    sourceAdapter: "codex_public_web";
    recencyDays: number;
    ordinal: number;
  }>[];
  qualificationThresholds?: Readonly<{
    directDemand: number;
    precursor: number;
    momentum: number;
  }>;
}>;

type ParsedEnvelope = z.output<typeof validationEnvelopeSchema>;
type ClassifiedEvidence = Readonly<{
  evidence: NormalizedRadarEvidence;
  candidate: CandidateEvidence;
}>;
type AssessedRequirement = Readonly<{
  requirement: NormalizedRequirement;
  globallyDeliverable: boolean | null;
  openToExternalCounterparties: boolean | null;
}>;
type SignalValidationResult =
  | Readonly<{ valid: true; signal: PersistableRadarSignal }>
  | Readonly<{ valid: false; reason: RadarRejectionReason }>;

function deepFreeze<Value>(value: Value): Value {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function invalidProposal(message: string): never {
  throw new TypeError(`Invalid Global Radar validation proposal: ${message}`);
}

function readNow(clock: RadarClock): Date {
  let value: Date;
  try {
    value = clock.now();
  } catch {
    return invalidProposal("trusted clock failed");
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return invalidProposal("trusted clock is invalid");
  }
  return new Date(value.getTime());
}

function emptyRejectionCounts(): Record<RadarRejectionReason, number> {
  return Object.fromEntries(
    radarRejectionReasons.map((reason) => [reason, 0]),
  ) as Record<RadarRejectionReason, number>;
}

function mapEvidenceFailure(
  reason: RadarEvidenceNormalizationFailureReason,
): RadarRejectionReason {
  switch (reason) {
    case "summary_is_not_evidence":
    case "search_result_is_not_evidence":
    case "missing_original_language_evidence":
    case "missing_english_summary":
    case "missing_translation_confidence":
      return reason;
    case "invalid_evidence_url":
      return "invalid_evidence_url";
    case "full_page_content":
    case "unsupported_field_path":
    case "invalid_evidence_date":
    case "invalid_evidence":
      return "invalid_evidence";
  }
}

function normalizePhrase(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNullablePhrases(
  values: readonly string[] | null,
): readonly string[] | null {
  if (values === null) return null;
  return Object.freeze(
    [...new Set(values.map(normalizePhrase))].sort(compareStrings),
  );
}

function normalizeEntity(entity: PersistableRadarEntity): PersistableRadarEntity {
  const identity = createEntityIdentity({
    name: entity.canonicalName,
    headquartersCountry: entity.headquartersCountry,
    websiteUrl: entity.websiteUrl,
    linkedinOrganizationUrl: entity.linkedinOrganizationUrl,
    stablePublicIdentifiers: entity.stablePublicIdentifiers,
  });
  if (identity.stableIdentifiers.length === 0) {
    return invalidProposal(`entity ${entity.entityRef} has no public identity`);
  }
  return persistableRadarEntitySchema.parse({
    ...entity,
    websiteUrl: identity.officialWebsiteUrl,
    linkedinOrganizationUrl: identity.linkedinOrganizationUrl,
    stablePublicIdentifiers: Object.freeze(
      [...entity.stablePublicIdentifiers]
        .map(({ namespace, value }) => ({
          namespace: namespace.normalize("NFKC").trim().toLowerCase(),
          value: value.normalize("NFKC").trim().toLowerCase(),
        }))
        .sort(
          (left, right) =>
            compareStrings(left.namespace, right.namespace) ||
            compareStrings(left.value, right.value),
        ),
    ),
    operatingCountries: normalizeNullablePhrases(entity.operatingCountries),
  });
}

function normalizeEntities(
  entities: readonly PersistableRadarEntity[],
): Readonly<{
  entities: readonly PersistableRadarEntity[];
  byRef: ReadonlyMap<string, PersistableRadarEntity>;
  identitiesByRef: ReadonlyMap<string, EntityIdentity>;
}> {
  const byRef = new Map<string, PersistableRadarEntity>();
  const identitiesByRef = new Map<string, EntityIdentity>();
  const normalized = entities.map((input) => {
    if (byRef.has(input.entityRef)) {
      return invalidProposal(`duplicate entity reference ${input.entityRef}`);
    }
    const entity = normalizeEntity(input);
    const identity = createEntityIdentity({
      name: entity.canonicalName,
      headquartersCountry: entity.headquartersCountry,
      websiteUrl: entity.websiteUrl,
      linkedinOrganizationUrl: entity.linkedinOrganizationUrl,
      stablePublicIdentifiers: entity.stablePublicIdentifiers,
    });
    byRef.set(entity.entityRef, entity);
    identitiesByRef.set(entity.entityRef, identity);
    return entity;
  });
  return Object.freeze({
    entities: Object.freeze(
      normalized.sort((left, right) =>
        compareStrings(left.entityRef, right.entityRef),
      ),
    ),
    byRef,
    identitiesByRef,
  });
}

function queryIdentity(
  query: Pick<
    PersistableRadarExecutedQuery,
    | "query"
    | "language"
    | "sourceCountry"
    | "theme"
    | "signalIntent"
    | "sourceAdapter"
  >,
): string {
  return createQueryFingerprint(query);
}

function normalizeExecutedQueries(
  queries: readonly PersistableRadarExecutedQuery[],
  context: RadarValidationContext,
  now: Date,
): Readonly<{
  queries: readonly PersistableRadarExecutedQuery[];
  fingerprintMap: ReadonlyMap<string, string>;
}> {
  const expected = context.expectedExecutedQueries;
  if (expected && expected.length !== queries.length) {
    return invalidProposal("executed query count does not match the plan");
  }
  const fingerprintMap = new Map<string, string>();
  const fingerprints = new Set<string>();
  const ordinals = new Set<number>();
  const normalized = queries.map((query, index) => {
    const planned = expected?.[index];
    if (
      planned &&
      JSON.stringify({
        query: query.query,
        language: query.language,
        sourceCountry: query.sourceCountry,
        theme: query.theme,
        signalIntent: query.signalIntent,
        sourceAdapter: query.sourceAdapter,
        recencyDays: query.recencyDays,
        ordinal: query.ordinal,
      }) !== JSON.stringify(planned)
    ) {
      return invalidProposal(`executed query ${index} does not match the plan`);
    }
    if (Date.parse(query.executedAt) > now.getTime()) {
      return invalidProposal(`executed query ${index} is in the future`);
    }
    const fingerprint = queryIdentity(query);
    if (fingerprints.has(fingerprint) || ordinals.has(query.ordinal)) {
      return invalidProposal("executed queries must have unique identities");
    }
    fingerprints.add(fingerprint);
    ordinals.add(query.ordinal);
    fingerprintMap.set(query.fingerprint, fingerprint);
    return persistableRadarExecutedQuerySchema.parse({
      ...query,
      fingerprint,
    });
  }).sort((left, right) => left.ordinal - right.ordinal);
  return Object.freeze({
    queries: Object.freeze(normalized),
    fingerprintMap,
  });
}

function normalizeSourceErrors(
  sourceErrors: readonly SourceError[],
  fingerprintMap: ReadonlyMap<string, string>,
  queryFingerprints: ReadonlySet<string>,
): readonly SourceError[] {
  return Object.freeze(
    sourceErrors.map((error) => {
      const queryFingerprint =
        error.queryFingerprint === null
          ? null
          : (fingerprintMap.get(error.queryFingerprint) ??
            error.queryFingerprint);
      if (
        queryFingerprint !== null &&
        !queryFingerprints.has(queryFingerprint)
      ) {
        return invalidProposal("source error references an unknown query");
      }
      return sourceErrorSchema.parse({ ...error, queryFingerprint });
    }).sort(
      (left, right) =>
        compareStrings(left.queryFingerprint ?? "", right.queryFingerprint ?? "") ||
        compareStrings(left.sourceName, right.sourceName) ||
        compareStrings(left.message, right.message),
    ),
  );
}

function normalizedRequirements(
  proposal: RadarSignalProposal,
): readonly AssessedRequirement[] | null {
  const normalized = normalizeRequirements(
    proposal.requirements.map((requirement) => {
      const input: Record<string, unknown> = { ...requirement };
      delete input.globallyDeliverable;
      delete input.openToExternalCounterparties;
      return input;
    }),
  );
  if (!normalized.valid) return null;
  return Object.freeze(
    normalized.requirements.map((requirement, index) =>
      Object.freeze({
        requirement,
        globallyDeliverable:
          proposal.requirements[index]!.globallyDeliverable,
        openToExternalCounterparties:
          proposal.requirements[index]!.openToExternalCounterparties,
      }),
    ).sort((left, right) =>
      compareStrings(left.requirement.fingerprint, right.requirement.fingerprint),
    ),
  );
}

function requirementsMatchDemandDomain(
  demandDomain: RadarSignalProposal["demandDomain"],
  requirements: readonly AssessedRequirement[],
): boolean {
  const allowedCapabilities = new Set<string>(globalRadarTaxonomy[demandDomain]);
  return requirements.every(({ requirement }) =>
    allowedCapabilities.has(requirement.capabilityTag),
  );
}

function classificationIdentity(
  entityRef: string,
  entity: PersistableRadarEntity,
  identity: EntityIdentity,
): Readonly<{ organizationId: string; corporateGroupId: string }> {
  const organizationId = identity.stableIdentifiers[0]
    ? createQueryFingerprint({
        query: identity.stableIdentifiers[0],
        language: "identity",
        sourceCountry: entity.headquartersCountry,
        theme: "entity_identity",
        signalIntent: "classification",
        sourceAdapter: "global_radar",
      })
    : entityRef;
  return Object.freeze({
    organizationId,
    corporateGroupId: entity.canonicalCorporateGroupId ?? organizationId,
  });
}

function evidencePreferenceScore(item: ClassifiedEvidence): number {
  return (
    (item.evidence.isPrimarySource ? 10_000 : 0) +
    (item.evidence.isSyndicated ? 0 : 1_000) +
    item.evidence.evidenceConfidence
  );
}

function preferredEvidence(
  left: ClassifiedEvidence,
  right: ClassifiedEvidence,
): ClassifiedEvidence {
  const scoreDifference =
    evidencePreferenceScore(right) - evidencePreferenceScore(left);
  if (scoreDifference !== 0) return scoreDifference > 0 ? right : left;
  return compareStrings(
    left.evidence.sourceUrl,
    right.evidence.sourceUrl,
  ) <= 0
    ? left
    : right;
}

function mergeClassifiedEvidence(
  left: ClassifiedEvidence,
  right: ClassifiedEvidence,
): ClassifiedEvidence | null {
  if (
    left.evidence.evidenceFingerprint !== right.evidence.evidenceFingerprint ||
    left.evidence.contributorEntityRef !== right.evidence.contributorEntityRef ||
    left.candidate.organizationId !== right.candidate.organizationId ||
    left.candidate.corporateGroupId !== right.candidate.corporateGroupId
  ) {
    return null;
  }
  const preferred = preferredEvidence(left, right);
  const supportedFieldPaths = [
    ...new Set([
      ...left.evidence.supportedFieldPaths,
      ...right.evidence.supportedFieldPaths,
    ]),
  ].sort(compareStrings);
  const isPrimarySource =
    left.evidence.isPrimarySource || right.evidence.isPrimarySource;
  const isSyndicated =
    left.evidence.isSyndicated && right.evidence.isSyndicated;
  const evidenceConfidence = Math.max(
    left.evidence.evidenceConfidence,
    right.evidence.evidenceConfidence,
  );
  const translationConfidences = [
    left.evidence.translationConfidence,
    right.evidence.translationConfidence,
  ].filter((value): value is number => value !== null);
  const translationConfidence =
    translationConfidences.length === 0
      ? null
      : Math.max(...translationConfidences);
  const supportsDirectDemand = supportedFieldPaths.some((path) =>
    path.startsWith("directDemandAsk."),
  );
  const supportsIndiaRelevance = supportedFieldPaths.some((path) =>
    path.startsWith("indiaRelevance."),
  );
  const evidence = persistableRadarEvidenceSchema.parse({
    ...preferred.evidence,
    evidenceConfidence,
    translationConfidence,
    isPrimarySource,
    isSyndicated,
    supportsDirectDemand,
    supportsIndiaRelevance,
    supportedFieldPaths,
  });
  const candidate: CandidateEvidence = {
    ...preferred.candidate,
    sourceUrl: evidence.sourceUrl,
    canonicalSourceUrl: evidence.canonicalSourceUrl,
    sourceLanguage: evidence.sourceLanguage,
    originalText: evidence.claim,
    englishSummary: evidence.englishSummary,
    publishedAt: evidence.publishedAt,
    observedAt: evidence.observedAt,
    evidenceConfidence,
    translationConfidence,
    isPrimarySource,
    isOfficialProcurementSource:
      left.candidate.isOfficialProcurementSource ||
      right.candidate.isOfficialProcurementSource,
    supportsDirectDemand,
    isSyndicated,
    supportedFieldPaths: [...supportedFieldPaths],
  };
  return Object.freeze({
    evidence: deepFreeze(evidence),
    candidate: deepFreeze(candidate),
  });
}

function normalizeSignalEvidence(
  proposal: RadarSignalProposal,
  entitiesByRef: ReadonlyMap<string, PersistableRadarEntity>,
  identitiesByRef: ReadonlyMap<string, EntityIdentity>,
  now: Date,
):
  | Readonly<{ valid: true; items: readonly ClassifiedEvidence[] }>
  | Readonly<{ valid: false; reason: RadarRejectionReason }> {
  const byFingerprint = new Map<string, ClassifiedEvidence>();
  for (const input of proposal.evidence) {
    const normalized = normalizeRadarEvidence(input);
    if (!normalized.valid) {
      return Object.freeze({
        valid: false,
        reason: mapEvidenceFailure(normalized.reason),
      });
    }
    if (Date.parse(normalized.evidence.observedAt) > now.getTime()) {
      return Object.freeze({ valid: false, reason: "invalid_evidence" });
    }
    const entityRef =
      normalized.evidence.contributorEntityRef ?? proposal.primaryEntityRef;
    if (entityRef === null) {
      return Object.freeze({ valid: false, reason: "invalid_evidence" });
    }
    const entity = entitiesByRef.get(entityRef);
    const identity = identitiesByRef.get(entityRef);
    if (!entity || !identity) {
      return Object.freeze({ valid: false, reason: "invalid_evidence" });
    }
    const classificationIdentityValue = classificationIdentity(
      entityRef,
      entity,
      identity,
    );
    const classified = Object.freeze({
      evidence: normalized.evidence,
      candidate: Object.freeze({
        ...normalized.classification,
        ...classificationIdentityValue,
      }),
    });
    const existing = byFingerprint.get(
      normalized.evidence.evidenceFingerprint,
    );
    if (!existing) {
      byFingerprint.set(normalized.evidence.evidenceFingerprint, classified);
      continue;
    }
    const merged = mergeClassifiedEvidence(existing, classified);
    if (!merged) {
      return Object.freeze({ valid: false, reason: "invalid_evidence" });
    }
    byFingerprint.set(normalized.evidence.evidenceFingerprint, merged);
  }
  return Object.freeze({
    valid: true,
    items: Object.freeze([...byFingerprint.values()]),
  });
}

function signalObservedAt(evidence: readonly ClassifiedEvidence[]): string {
  return [...evidence]
    .map(({ evidence: item }) => item.observedAt)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]!;
}

function indiaFitScore(
  relevanceType: z.output<typeof proposedIndiaRelevanceSchema>["proposedType"],
): number {
  return {
    explicit_India: 100,
    existing_India_presence: 90,
    India_expansion: 85,
    globally_open: 70,
    inferred_India_compatible: 60,
    no_current_India_fit: 0,
  }[relevanceType];
}

function assessServerIndiaRelevance(
  proposal: RadarSignalProposal,
  evidence: readonly ClassifiedEvidence[],
  requirements: readonly AssessedRequirement[],
): IndiaRelevanceAssessment {
  const indiaEvidence = evidence
    .filter(({ evidence: item }) => item.supportsIndiaRelevance)
    .map(({ candidate }) => candidate);
  const exclusionEvidence = evidence.map(({ candidate }) => candidate);
  const assess = (
    proposedType: RadarSignalProposal["indiaRelevance"]["proposedType"],
  ) =>
    assessIndiaRelevance({
      proposedType,
      evidence: indiaEvidence,
      exclusionEvidence,
      requirements,
      reasons: proposal.indiaRelevance.reasons,
      constraints: proposal.indiaRelevance.constraints,
      unknowns: proposal.indiaRelevance.unknowns,
      confidence: proposal.indiaRelevance.confidence,
      regulatoryFacts: proposal.indiaRelevance.regulatoryFacts,
      logisticsFacts: proposal.indiaRelevance.logisticsFacts,
    });
  const supportedPaths = new Set(
    indiaEvidence.flatMap(({ supportedFieldPaths }) => supportedFieldPaths),
  );
  const evidenceDrivenTypes = [
    "India_expansion",
    "existing_India_presence",
    "explicit_India",
  ] as const;
  for (const relevanceType of evidenceDrivenTypes) {
    if (
      ![...supportedPaths].some((path) =>
        path.startsWith(`indiaRelevance.${relevanceType}.`),
      )
    ) {
      continue;
    }
    const assessment = assess(relevanceType);
    if (assessment.assessed) return assessment;
  }
  if (
    [...supportedPaths].some((path) =>
      path.startsWith("indiaRelevance.globally_open."),
    )
  ) {
    const assessment = assess("globally_open");
    if (assessment.assessed) return assessment;
  }
  return assess(proposal.indiaRelevance.proposedType);
}

function complianceRequiresReview(
  assessment: z.output<typeof sensitiveDataAndComplianceSchema>,
): boolean {
  return (
    Object.values(assessment.sensitiveDataFlags).some(
      (value) => value === null || value === "severe",
    ) || Object.values(assessment.complianceFacts).some((value) => value === null)
  );
}

function scoreDirectProposal(
  proposal: z.output<typeof directDemandSignalProposalSchema>,
  classification: Extract<ReturnType<typeof classifySignal>, { accepted: true }>,
  relevanceType: z.output<typeof proposedIndiaRelevanceSchema>["proposedType"],
  observedAt: string,
  evidence: readonly ClassifiedEvidence[],
  clock: RadarClock,
): DirectDemandScoreResult {
  const anchorAt =
    proposal.announcedAt ??
    proposal.effectiveFrom ??
    evidence
      .flatMap(({ evidence: item }) =>
        item.publishedAt === null ? [] : [item.publishedAt],
      )
      .sort()[0] ??
    observedAt;
  const freshness = calculateFreshness({ anchorAt }, clock);
  return scoreDirectDemand({
    ...proposal.scoreComponents,
    explicitness: classification.gateFacts.explicitCurrentAsk ? 100 : 0,
    evidenceConfidence: classification.gateFacts.evidenceConfidence,
    freshness: freshness.valid ? freshness.score : null,
    indiaFit: indiaFitScore(relevanceType),
    responseAccessibility: classification.gateFacts.responsePathVerified
      ? 100
      : null,
  });
}

function scorePrecursorProposal(
  proposal: z.output<typeof precursorSignalProposalSchema>,
  classification: Extract<ReturnType<typeof classifySignal>, { accepted: true }>,
  relevanceType: z.output<typeof proposedIndiaRelevanceSchema>["proposedType"],
  clock: RadarClock,
): PrecursorScoreResult {
  const timeHorizon = calculateTimeHorizon(
    { estimatedAt: proposal.effectiveFrom },
    clock,
  );
  return scoreDemandPrecursor({
    ...proposal.scoreComponents,
    evidenceConfidence: classification.gateFacts.evidenceConfidence,
    indiaFit: indiaFitScore(relevanceType),
    estimatedTimeHorizon: timeHorizon.valid ? timeHorizon.score : null,
  });
}

function scoreMomentumProposal(
  proposal: z.output<typeof momentumSignalProposalSchema>,
  evidence: readonly ClassifiedEvidence[],
  entitiesByRef: ReadonlyMap<string, PersistableRadarEntity>,
  identitiesByRef: ReadonlyMap<string, EntityIdentity>,
  observedAt: string,
): MomentumDerivationResult {
  const observations = evidence.flatMap(({ evidence: item }) => {
    const entityRef = item.contributorEntityRef;
    if (entityRef === null || item.isSyndicated) return [];
    const entity = entitiesByRef.get(entityRef);
    const identity = identitiesByRef.get(entityRef);
    if (!entity || !identity) return [];
    const entityKey = classificationIdentity(entityRef, entity, identity);
    return [
      {
        evidenceId: item.evidenceFingerprint,
        entityId: entityKey.organizationId,
        corporateGroupId: entityKey.corporateGroupId,
        sourceId: item.evidenceFingerprint,
        sourceFamily: item.sourceFamily,
        isPrimarySource: item.isPrimarySource,
        observedAt: item.observedAt,
      },
    ];
  });
  return deriveEcosystemMomentum(
    {
      taxonomy: proposal.demandDomain,
      taxonomyConsistency: proposal.momentumMetrics.taxonomyConsistency,
      evidenceQuality: proposal.momentumMetrics.evidenceQuality,
      observations,
    },
    createGlobalRadarMomentumPolicy(proposal.demandDomain),
    { now: () => new Date(observedAt) },
  );
}

function inferredStackType(
  requirements: readonly AssessedRequirement[],
): "hardware" | "physical_data" {
  return requirements.some(({ requirement }) =>
    ["robotics_hardware", "manufacturing"].includes(requirement.kind),
  )
    ? "hardware"
    : "physical_data";
}

function validatedSystemsContext(
  proposal: RadarSignalProposal,
  requirements: readonly AssessedRequirement[],
  score: DirectDemandScoreResult | PrecursorScoreResult | MomentumDerivationResult,
  threshold: number,
): Readonly<{
  stackType: "hardware" | "physical_data";
  context: SystemsContext | null;
}> | null {
  if (!score.valid) return null;
  const stackType =
    proposal.systemsContext?.stackType ?? inferredStackType(requirements);
  const contextInput: Record<string, unknown> | null = proposal.systemsContext
    ? { ...proposal.systemsContext }
    : null;
  if (contextInput) delete contextInput.stackType;
  const context =
    contextInput === null ? null : systemsContextSchema.parse(contextInput);
  const eligibleForQualification =
    score.qualificationGatesPassed && score.score !== null && score.score >= threshold;
  const validated = validateSystemsContext({
    signalClass: proposal.signalClass,
    eligibleForQualification,
    classScore: score.score,
    stackType,
    context,
  });
  if (!validated.valid) return null;
  return Object.freeze({ stackType, context: validated.context });
}

function evidenceContributorsBelongToSignal(
  proposal: RadarSignalProposal,
  evidence: readonly ClassifiedEvidence[],
): boolean {
  const allowedEntityRefs = new Set(
    proposal.associatedEntities.map(({ entityRef }) => entityRef),
  );
  if (proposal.primaryEntityRef !== null) {
    allowedEntityRefs.add(proposal.primaryEntityRef);
  }
  return evidence.every(({ evidence: item }) => {
    if (item.contributorEntityRef === null) {
      return proposal.signalClass !== "ecosystem_momentum";
    }
    return allowedEntityRefs.has(item.contributorEntityRef);
  });
}

function validateSignal(
  proposal: RadarSignalProposal,
  entitiesByRef: ReadonlyMap<string, PersistableRadarEntity>,
  identitiesByRef: ReadonlyMap<string, EntityIdentity>,
  context: RadarValidationContext,
  now: Date,
): SignalValidationResult {
  const associations = proposal.associatedEntities;
  const expectedRole =
    proposal.signalClass === "ecosystem_momentum" ? "contributor" : "supporting";
  if (
    associations.some(
      ({ entityRef, role }) => role !== expectedRole || !entitiesByRef.has(entityRef),
    ) ||
    new Set(associations.map(({ entityRef, role }) => `${role}:${entityRef}`))
      .size !== associations.length ||
    (proposal.primaryEntityRef !== null &&
      !entitiesByRef.has(proposal.primaryEntityRef))
  ) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  const evidenceResult = normalizeSignalEvidence(
    proposal,
    entitiesByRef,
    identitiesByRef,
    now,
  );
  if (!evidenceResult.valid) return evidenceResult;
  const observedAt = signalObservedAt(evidenceResult.items);
  if (
    proposal.announcedAt !== null &&
    Date.parse(proposal.announcedAt) > Date.parse(observedAt)
  ) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  if (
    proposal.signalClass === "direct_demand" &&
    (proposal.evergreen !== (proposal.reobserveBy !== null) ||
      (proposal.evergreen && proposal.directDemandAsk.expiresAt !== null) ||
      (proposal.reobserveBy !== null &&
        Date.parse(proposal.reobserveBy) <= Date.parse(observedAt)))
  ) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  if (
    proposal.signalClass === "direct_demand" &&
    ((proposal.directDemandAsk.expiresAt !== null &&
      Date.parse(proposal.directDemandAsk.expiresAt) <= now.getTime()) ||
      (proposal.reobserveBy !== null &&
        Date.parse(proposal.reobserveBy) <= now.getTime()))
  ) {
    return Object.freeze({
      valid: false,
      reason: "expired_direct_demand",
    });
  }

  const classification = classifySignal({
    proposedSignalClass: proposal.signalClass,
    observedAt,
    directDemandAsk: proposal.directDemandAsk,
    precursorDevelopmentType: proposal.precursorDevelopmentType,
    evidence: evidenceResult.items.map(({ candidate }) => candidate),
    momentumMetrics: proposal.momentumMetrics,
    responsePath: proposal.responsePath,
  });
  if (!classification.accepted) {
    return Object.freeze({ valid: false, reason: classification.reason });
  }

  const requirements = normalizedRequirements(proposal);
  if (
    requirements === null ||
    !requirementsMatchDemandDomain(proposal.demandDomain, requirements)
  ) {
    return Object.freeze({ valid: false, reason: "insufficient_evidence" });
  }

  const indiaAssessment = assessServerIndiaRelevance(
    proposal,
    evidenceResult.items,
    requirements,
  );
  if (!indiaAssessment.assessed) {
    return Object.freeze({ valid: false, reason: "insufficient_evidence" });
  }

  const thresholds = context.qualificationThresholds ?? {
    directDemand: 70,
    precursor: 65,
    momentum: 70,
  };
  let score:
    | DirectDemandScoreResult
    | PrecursorScoreResult
    | MomentumDerivationResult;
  let threshold: number;
  if (proposal.signalClass === "direct_demand") {
    score = scoreDirectProposal(
      proposal,
      classification,
      indiaAssessment.relevanceType,
      observedAt,
      evidenceResult.items,
      context.clock,
    );
    threshold = thresholds.directDemand;
  } else if (proposal.signalClass === "demand_precursor") {
    score = scorePrecursorProposal(
      proposal,
      classification,
      indiaAssessment.relevanceType,
      context.clock,
    );
    threshold = thresholds.precursor;
  } else {
    score = scoreMomentumProposal(
      proposal,
      evidenceResult.items,
      entitiesByRef,
      identitiesByRef,
      observedAt,
    );
    threshold = thresholds.momentum;
    if (!score.valid || !score.qualificationGatesPassed) {
      return Object.freeze({
        valid: false,
        reason: "insufficient_momentum_evidence",
      });
    }
  }
  if (!score.valid) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  const systemsContext = validatedSystemsContext(
    proposal,
    requirements,
    score,
    threshold,
  );
  if (systemsContext === null) {
    return Object.freeze({ valid: false, reason: "insufficient_evidence" });
  }
  if (!evidenceContributorsBelongToSignal(proposal, evidenceResult.items)) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  const status = determineInitialSignalStatus({
    complianceRequiresReview: complianceRequiresReview(
      proposal.sensitiveDataAndCompliance,
    ),
    score: score.score,
    scoreCoverage: score.scoreCoverage,
  });
  if (!status.valid) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }

  const normalizedRequirementsOnly = requirements.map(
    ({ requirement }) => requirement,
  );
  const targetCapabilityTags = Object.freeze(
    [...new Set(normalizedRequirementsOnly.map(({ capabilityTag }) => capabilityTag))].sort(),
  );
  const requiredCounterpartyArchetypes = Object.freeze(
    [
      ...new Set(
        normalizedRequirementsOnly.flatMap(
          ({ indianExecutionArchetypes: archetypes }) => archetypes,
        ),
      ),
    ].sort(),
  );
  const associatedEntities = Object.freeze(
    [...associations].sort(
      (left, right) =>
        compareStrings(left.role, right.role) ||
        compareStrings(left.entityRef, right.entityRef),
    ),
  );
  const normalizedEvidence = Object.freeze(
    evidenceResult.items
      .map(({ evidence: item }) => item)
      .sort((left, right) =>
        compareStrings(left.evidenceFingerprint, right.evidenceFingerprint),
      ),
  );
  const responsePath = proposal.responsePath;
  const partnerApplicationUrl = responsePath?.url ?? null;
  const sourceLanguage =
    normalizedEvidence.find(({ isPrimarySource }) => isPrimarySource)
      ?.sourceLanguage ?? normalizedEvidence[0]!.sourceLanguage;
  const common = {
    externalSignalId: proposal.externalSignalId,
    dedupeKey: "0".repeat(64),
    associatedEntities,
    demandDomain: proposal.demandDomain,
    title: proposal.title,
    factualSummary: proposal.factualSummary,
    interpretationSummary: proposal.interpretationSummary,
    theme: proposal.theme,
    sourceCountry: proposal.sourceCountry,
    targetGeographies: normalizeNullablePhrases(proposal.targetGeographies),
    collectionGeographies: normalizeNullablePhrases(
      proposal.collectionGeographies,
    ),
    manufacturingGeographies: normalizeNullablePhrases(
      proposal.manufacturingGeographies,
    ),
    deliveryGeographies: normalizeNullablePhrases(proposal.deliveryGeographies),
    industry: proposal.industry,
    targetModelOrSystem: proposal.targetModelOrSystem,
    targetCapabilityTags,
    requiredCounterpartyArchetypes,
    indiaRelevance: {
      relevanceType: indiaAssessment.relevanceType,
      basis: indiaAssessment.basis,
      rationale: proposal.indiaRelevance.rationale,
      reasons: [...indiaAssessment.reasons].sort(compareStrings),
      constraints: [...indiaAssessment.constraints].sort(compareStrings),
      unknowns: [...indiaAssessment.unknowns].sort(compareStrings),
      confidence: indiaAssessment.confidence,
      regulatoryFacts: indiaAssessment.regulatoryFacts,
      logisticsFacts: indiaAssessment.logisticsFacts,
    },
    announcedAt: proposal.announcedAt,
    effectiveFrom: proposal.effectiveFrom,
    observedAt,
    initialStatus: status.status,
    responsePath,
    partnerApplicationUrl,
    sourceLanguage,
    extractionMethod: "codex_public_web" as const,
    taxonomyVersion: GLOBAL_RADAR_TAXONOMY_VERSION,
    systemsContext:
      systemsContext.context === null
        ? null
        : { ...systemsContext.context, stackType: systemsContext.stackType },
    sensitiveDataAndCompliance: proposal.sensitiveDataAndCompliance,
    rawMetadata: proposal.rawMetadata,
    requirements: normalizedRequirementsOnly,
    evidence: normalizedEvidence,
  };
  const proposedSignal =
    proposal.signalClass === "direct_demand"
      ? {
          ...common,
          signalClass: "direct_demand" as const,
          signalType: proposal.directDemandAsk.type,
          primaryEntityRef: proposal.primaryEntityRef,
          score,
          expiresAt: proposal.directDemandAsk.expiresAt,
          evergreen: proposal.evergreen,
          reobserveBy: proposal.reobserveBy,
        }
      : proposal.signalClass === "demand_precursor"
        ? {
            ...common,
            signalClass: "demand_precursor" as const,
            signalType: proposal.precursorDevelopmentType,
            primaryEntityRef: proposal.primaryEntityRef,
            score,
            expiresAt: null,
            evergreen: null,
            reobserveBy: null,
          }
        : {
            ...common,
            signalClass: "ecosystem_momentum" as const,
            signalType: "ecosystem_direction" as const,
            primaryEntityRef: null,
            score,
            expiresAt: null,
            evergreen: null,
            reobserveBy: null,
          };
  const parsedSignal = persistableRadarSignalSchema.safeParse(proposedSignal);
  if (!parsedSignal.success) {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  const signalWithoutDedupe = parsedSignal.data;
  let dedupeKey: string;
  try {
    dedupeKey = createGlobalRadarSignalDedupeKey(
      signalWithoutDedupe,
      identitiesByRef,
    );
  } catch {
    return Object.freeze({ valid: false, reason: "invalid_evidence" });
  }
  return Object.freeze({
    valid: true,
    signal: Object.freeze({ ...signalWithoutDedupe, dedupeKey }),
  });
}

function rawBatchTotalsAreBounded(signals: readonly unknown[]): boolean {
  let evidenceCount = 0;
  let requirementCount = 0;
  for (const signal of signals) {
    if (signal === null || typeof signal !== "object" || Array.isArray(signal)) {
      continue;
    }
    const record = signal as Record<string, unknown>;
    if (Array.isArray(record.evidence)) evidenceCount += record.evidence.length;
    if (Array.isArray(record.requirements)) {
      requirementCount += record.requirements.length;
    }
  }
  return evidenceCount <= 100 && requirementCount <= 100;
}

function parseEnvelope(input: unknown): ParsedEnvelope {
  if (serializedJsonByteLength(input) > MAX_BATCH_BYTES) {
    return invalidProposal("batch exceeds 2 MiB");
  }
  const parsed = validationEnvelopeSchema.safeParse(input);
  if (!parsed.success) return invalidProposal("strict envelope validation failed");
  if (!rawBatchTotalsAreBounded(parsed.data.signals)) {
    return invalidProposal("batch evidence or requirement total exceeded");
  }
  if (
    parsed.data.signals.length === 0 &&
    (parsed.data.sourceErrors.length > 0 ||
      parsed.data.executedQueries.some((query) => query.error !== null))
  ) {
    return invalidProposal("honest zero cannot contain source failures");
  }
  return parsed.data;
}

function referencedEntityRefs(
  signals: readonly PersistableRadarSignal[],
): ReadonlySet<string> {
  const references = new Set<string>();
  for (const signal of signals) {
    if (signal.primaryEntityRef !== null) references.add(signal.primaryEntityRef);
    signal.associatedEntities.forEach(({ entityRef }) => references.add(entityRef));
    signal.evidence.forEach(({ contributorEntityRef }) => {
      if (contributorEntityRef !== null) references.add(contributorEntityRef);
    });
  }
  return references;
}

export function validateGlobalRadarBatch(
  input: GlobalRadarValidationProposal | unknown,
  context: RadarValidationContext,
): ValidatedRadarBatch {
  const now = readNow(context.clock);
  const envelope = parseEnvelope(input);
  if (context.expectedRunId && envelope.runId !== context.expectedRunId) {
    return invalidProposal("run identity does not match trusted context");
  }
  if (
    context.expectedPlanFingerprint &&
    envelope.planFingerprint !== context.expectedPlanFingerprint
  ) {
    return invalidProposal("plan fingerprint does not match trusted context");
  }
  const entities = normalizeEntities(envelope.entities);
  const executed = normalizeExecutedQueries(
    envelope.executedQueries,
    context,
    now,
  );
  const queryFingerprints = new Set(
    executed.queries.map(({ fingerprint }) => fingerprint),
  );
  const sourceErrors = normalizeSourceErrors(
    envelope.sourceErrors,
    executed.fingerprintMap,
    queryFingerprints,
  );
  const rejections = emptyRejectionCounts();
  const signals: PersistableRadarSignal[] = [];
  const externalSignalIds = new Set<string>();
  for (const rawSignal of envelope.signals) {
    const parsedSignal = radarSignalProposalSchema.safeParse(rawSignal);
    if (!parsedSignal.success) {
      rejections.invalid_evidence += 1;
      continue;
    }
    if (externalSignalIds.has(parsedSignal.data.externalSignalId)) {
      rejections.invalid_evidence += 1;
      continue;
    }
    const validated = validateSignal(
      parsedSignal.data,
      entities.byRef,
      entities.identitiesByRef,
      context,
      now,
    );
    if (!validated.valid) {
      rejections[validated.reason] += 1;
      continue;
    }
    externalSignalIds.add(validated.signal.externalSignalId);
    signals.push(validated.signal);
  }
  const referenced = referencedEntityRefs(signals);
  const acceptedEntities = entities.entities.filter(({ entityRef }) =>
    referenced.has(entityRef),
  );
  signals.sort((left, right) =>
    compareStrings(left.externalSignalId, right.externalSignalId),
  );
  const hashableBatch = {
    runId: envelope.runId,
    planFingerprint: envelope.planFingerprint,
    executedQueries: [...executed.queries],
    entities: [...acceptedEntities],
    signals: [...signals],
    sourceErrors: [...sourceErrors],
    rejections: { ...rejections },
  } satisfies Omit<PersistableGlobalRadarBatch, "canonicalSubmissionHash">;
  const candidate = persistableGlobalRadarBatchObjectSchema.parse({
    ...hashableBatch,
    canonicalSubmissionHash: createGlobalRadarPersistenceHash(hashableBatch),
  });
  const canonical = canonicalizeGlobalRadarPersistenceBatch(candidate);
  if (!canonical.valid) {
    throw new Error(
      `Global Radar validation invariant failed: ${canonical.reason}.`,
    );
  }
  return deepFreeze(candidate);
}
