import { z } from "zod";

import {
  ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  ECOSYSTEM_TAXONOMY,
  dependencyRelatedSignalTypes,
  normalizeIndiaCity,
  normalizeIndiaState,
  signalFreshnessDays,
  taxonomyOrder,
  type EcosystemTaxonomyKey,
  type EcosystemTaxonomyKind,
} from "./ecosystem-intelligence-taxonomy";
import {
  PHYSICAL_AI_ANALYSIS_VERSION,
  candidateStatuses,
  candidateTypes,
} from "./discovery";

export type FilterTaxonomyKind = Exclude<
  EcosystemTaxonomyKind,
  "signal_type" | "relationship_type"
>;
export type EcosystemFilterKey =
  | "ecosystemDomains"
  | "organisationSubtypes"
  | "ecosystemRoles"
  | "businessStages"
  | "technicalLayers"
  | "capabilities"
  | "componentCategories"
  | "roboticsVerticals"
  | "headquartersStates"
  | "headquartersCities"
  | "activeSignalTypes"
  | "reviewStatuses";

export type ParticipantType = (typeof candidateTypes)[number];
export type ReviewStatus = (typeof candidateStatuses)[number];
export type EvidenceFreshness = "current" | "stale" | "unknown";
export type PublicContactAvailability = "available" | "missing" | "unknown";
export type EcosystemSort =
  | "discovered_at"
  | "name"
  | "discovery_score"
  | "evidence_coverage";
export type SortDirection = "asc" | "desc";
export type TaxonomyFilterValue<Kind extends EcosystemTaxonomyKind> =
  | EcosystemTaxonomyKey<Kind>
  | "unknown";

export type EcosystemFilters = {
  participantType: ParticipantType;
  includeEnablers: boolean;
  analysisVersion: typeof PHYSICAL_AI_ANALYSIS_VERSION;
  ecosystemDomains: readonly TaxonomyFilterValue<"ecosystem_domain">[];
  organisationSubtypes: readonly TaxonomyFilterValue<"organisation_subtype">[];
  ecosystemRoles: readonly TaxonomyFilterValue<"ecosystem_role">[];
  businessStages: readonly TaxonomyFilterValue<"business_stage">[];
  technicalLayers: readonly TaxonomyFilterValue<"technical_layer">[];
  capabilities: readonly TaxonomyFilterValue<"capability">[];
  componentCategories: readonly TaxonomyFilterValue<"component_category">[];
  roboticsVerticals: readonly TaxonomyFilterValue<"robotics_vertical">[];
  headquartersStates: readonly string[];
  headquartersCities: readonly string[];
  activeSignalTypes: readonly TaxonomyFilterValue<"signal_type">[];
  reviewStatuses: readonly ReviewStatus[];
  publicContactAvailability?: PublicContactAvailability;
  evidenceCoverageBand?: "strong" | "partial" | "limited" | "unknown";
  evidenceFreshness?: EvidenceFreshness;
  minimumDiscoveryConfidence?: number;
  discoveredAfter?: string;
  discoveredBefore?: string;
  page: number;
  pageSize: number;
  sort: EcosystemSort;
  direction: SortDirection;
};

export const DEFAULT_ECOSYSTEM_FILTERS: EcosystemFilters = {
  participantType: "company",
  includeEnablers: false,
  analysisVersion: PHYSICAL_AI_ANALYSIS_VERSION,
  ecosystemDomains: [],
  organisationSubtypes: [],
  ecosystemRoles: [],
  businessStages: [],
  technicalLayers: [],
  capabilities: [],
  componentCategories: [],
  roboticsVerticals: [],
  headquartersStates: [],
  headquartersCities: [],
  activeSignalTypes: [],
  reviewStatuses: candidateStatuses.filter(
    (status) => status !== "rejected",
  ) as Exclude<ReviewStatus, "rejected">[],
  page: 1,
  pageSize: 25,
  sort: "discovered_at",
  direction: "desc",
};

type FilterInput = Record<string, unknown>;
type QueryValue = string | readonly string[] | undefined;

const rawFilterValueSchema = z.union([z.string(), z.array(z.string())]).optional();
const rawFilterSchema = z.strictObject({
  participantType: rawFilterValueSchema,
  includeEnablers: rawFilterValueSchema,
  ecosystemDomain: rawFilterValueSchema,
  organisationSubtype: rawFilterValueSchema,
  ecosystemRole: rawFilterValueSchema,
  businessStage: rawFilterValueSchema,
  technicalLayer: rawFilterValueSchema,
  capability: rawFilterValueSchema,
  componentCategory: rawFilterValueSchema,
  roboticsVertical: rawFilterValueSchema,
  headquartersState: rawFilterValueSchema,
  headquartersCity: rawFilterValueSchema,
  activeSignalType: rawFilterValueSchema,
  reviewStatus: rawFilterValueSchema,
  publicContact: rawFilterValueSchema,
  publicContactAvailability: rawFilterValueSchema,
  evidenceCoverageBand: rawFilterValueSchema,
  evidenceFreshness: rawFilterValueSchema,
  minimumDiscoveryConfidence: rawFilterValueSchema,
  discoveredAfter: rawFilterValueSchema,
  discoveredBefore: rawFilterValueSchema,
  page: rawFilterValueSchema,
  pageSize: rawFilterValueSchema,
  sort: rawFilterValueSchema,
  direction: rawFilterValueSchema,
});

function values(input: FilterInput, name: string): string[] {
  const value = input[name];
  if (value === undefined || value === null || value === "") return [];
  const source = Array.isArray(value) ? value : [value];
  return source.flatMap((item) =>
    typeof item === "string" ? item.split(",") : [],
  ).map((item) => item.trim()).filter(Boolean);
}

function scalarValue(input: FilterInput, name: string): string | undefined {
  if (Array.isArray(input[name]) && input[name].length > 1) {
    throw new Error(`Duplicate scalar filter parameter: ${name}.`);
  }
  const parsed = values(input, name);
  if (parsed.length > 1) {
    throw new Error(`Duplicate scalar filter parameter: ${name}.`);
  }
  return parsed[0];
}

function orderedUnique<Kind extends EcosystemTaxonomyKind>(
  kind: Kind,
  value: readonly string[],
): TaxonomyFilterValue<Kind>[] {
  const known = ECOSYSTEM_TAXONOMY.termsByKind[kind];
  const unique = [...new Set(value)];
  for (const key of unique) {
    if (key !== "unknown" && !known.some((term) => term.key === key)) {
      throw new Error(`Unknown ${kind} filter key: ${key}.`);
    }
  }
  return unique.sort((left, right) =>
    (left === "unknown" ? Number.MAX_SAFE_INTEGER : taxonomyOrder(kind, left) ?? Number.MAX_SAFE_INTEGER) -
    (right === "unknown" ? Number.MAX_SAFE_INTEGER : taxonomyOrder(kind, right) ?? Number.MAX_SAFE_INTEGER),
  ) as TaxonomyFilterValue<Kind>[];
}

function orderedLocations(
  values: readonly string[],
  normalize: (value: string) => string | undefined,
  label: string,
): string[] {
  const normalized = values.map((value) => {
    if (value.trim().toLowerCase() === "unknown") return "unknown";
    const result = normalize(value);
    if (!result) throw new Error(`Unknown headquarters ${label} filter key: ${value}.`);
    return result;
  });
  return [...new Set(normalized)].sort((left, right) => {
    if (left === right) return 0;
    if (left === "unknown") return 1;
    if (right === "unknown") return -1;
    return left.localeCompare(right);
  });
}

function orderedReviewStatuses(value: readonly string[]): ReviewStatus[] {
  const order: readonly ReviewStatus[] = candidateStatuses;
  const unique = [...new Set(value)];
  for (const status of unique) {
    if (!order.includes(status as ReviewStatus)) {
      throw new Error(`Unknown review status filter key: ${status}.`);
    }
  }
  return unique.sort(
    (left, right) =>
      order.indexOf(left as ReviewStatus) - order.indexOf(right as ReviewStatus),
  ) as ReviewStatus[];
}

function publicContactAvailability(input: FilterInput): PublicContactAvailability | undefined {
  const canonical = scalarValue(input, "publicContact");
  const legacy = scalarValue(input, "publicContactAvailability");
  if (canonical !== undefined && legacy !== undefined) {
    throw new Error("Use only one public-contact filter parameter.");
  }
  const value = canonical ?? legacy;
  if (value === undefined) return undefined;
  if (value === "unavailable") return "missing";
  return z.enum(["available", "missing", "unknown"]).parse(value);
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, {
    message: "Date filters must be ISO calendar dates.",
  });
const integer = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);

function enumValue<const Values extends readonly [string, ...string[]]>(
  input: FilterInput,
  name: string,
  allowed: Values,
  defaultValue: Values[number],
): Values[number] {
  const value = scalarValue(input, name);
  return value === undefined ? defaultValue : z.enum(allowed).parse(value);
}

function optionalEnum<const Values extends readonly [string, ...string[]]>(
  input: FilterInput,
  name: string,
  allowed: Values,
): Values[number] | undefined {
  const value = scalarValue(input, name);
  return value === undefined ? undefined : z.enum(allowed).parse(value);
}

function optionalPositiveScore(input: FilterInput): number | undefined {
  const value = scalarValue(input, "minimumDiscoveryConfidence");
  return value === undefined ? undefined : integer(0, 100).parse(value);
}

function optionalDate(input: FilterInput, name: string): string | undefined {
  const value = scalarValue(input, name);
  return value === undefined ? undefined : dateSchema.parse(value);
}

export function parseEcosystemFilters(input: FilterInput = {}): EcosystemFilters {
  rawFilterSchema.parse(input);
  const discoveredAfter = optionalDate(input, "discoveredAfter");
  const discoveredBefore = optionalDate(input, "discoveredBefore");
  if (discoveredAfter && discoveredBefore && discoveredAfter > discoveredBefore) {
    throw new Error("Discovery date range must be ordered from earliest to latest.");
  }

  const reviewStatuses = values(input, "reviewStatus");
  const page = scalarValue(input, "page");
  const pageSize = scalarValue(input, "pageSize");
  const includeEnablers = scalarValue(input, "includeEnablers");

  return {
    participantType: enumValue(input, "participantType", candidateTypes, "company"),
    includeEnablers: includeEnablers === undefined ? false : z.enum(["true", "false"]).parse(includeEnablers) === "true",
    analysisVersion: PHYSICAL_AI_ANALYSIS_VERSION,
    ecosystemDomains: orderedUnique("ecosystem_domain", values(input, "ecosystemDomain")),
    organisationSubtypes: orderedUnique("organisation_subtype", values(input, "organisationSubtype")),
    ecosystemRoles: orderedUnique("ecosystem_role", values(input, "ecosystemRole")),
    businessStages: orderedUnique("business_stage", values(input, "businessStage")),
    technicalLayers: orderedUnique("technical_layer", values(input, "technicalLayer")),
    capabilities: orderedUnique("capability", values(input, "capability")),
    componentCategories: orderedUnique("component_category", values(input, "componentCategory")),
    roboticsVerticals: orderedUnique("robotics_vertical", values(input, "roboticsVertical")),
    headquartersStates: orderedLocations(values(input, "headquartersState"), normalizeIndiaState, "state"),
    headquartersCities: orderedLocations(values(input, "headquartersCity"), normalizeIndiaCity, "city"),
    activeSignalTypes: orderedUnique("signal_type", values(input, "activeSignalType")),
    reviewStatuses: reviewStatuses.length === 0
      ? DEFAULT_ECOSYSTEM_FILTERS.reviewStatuses
      : orderedReviewStatuses(reviewStatuses),
    publicContactAvailability: publicContactAvailability(input),
    evidenceCoverageBand: optionalEnum(input, "evidenceCoverageBand", ["strong", "partial", "limited", "unknown"]),
    evidenceFreshness: optionalEnum(input, "evidenceFreshness", ["current", "stale", "unknown"]),
    minimumDiscoveryConfidence: optionalPositiveScore(input),
    discoveredAfter,
    discoveredBefore,
    page: page === undefined ? 1 : integer(1, Number.MAX_SAFE_INTEGER).parse(page),
    pageSize: pageSize === undefined ? 25 : integer(1, 100).parse(pageSize),
    sort: enumValue(input, "sort", ["discovered_at", "name", "discovery_score", "evidence_coverage"], "discovered_at"),
    direction: enumValue(input, "direction", ["asc", "desc"], "desc"),
  };
}

export function filtersFromSearchParams(
  searchParams: URLSearchParams | Record<string, QueryValue>,
): EcosystemFilters {
  if (searchParams instanceof URLSearchParams) {
    const input: FilterInput = {};
    for (const [key, value] of searchParams.entries()) {
      const existing = input[key];
      input[key] = existing === undefined
        ? value
        : Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
    }
    return parseEcosystemFilters(input);
  }
  return parseEcosystemFilters(searchParams);
}

const analyticalKeys: readonly (keyof EcosystemFilters)[] = [
  "participantType", "includeEnablers", "ecosystemDomains", "organisationSubtypes",
  "ecosystemRoles", "businessStages", "technicalLayers", "capabilities",
  "componentCategories", "roboticsVerticals", "headquartersStates", "headquartersCities",
  "activeSignalTypes", "reviewStatuses", "publicContactAvailability", "evidenceCoverageBand",
  "evidenceFreshness", "minimumDiscoveryConfidence", "discoveredAfter", "discoveredBefore",
];

function equalFilterValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyEcosystemFilterChanges(
  current: EcosystemFilters,
  changes: Partial<EcosystemFilters>,
): EcosystemFilters {
  const next = { ...current, ...changes } as EcosystemFilters;
  if (analyticalKeys.some((key) => !equalFilterValue(current[key], next[key]))) {
    return { ...next, page: 1 };
  }
  return next;
}

function appendValues(
  params: URLSearchParams,
  name: string,
  values: readonly string[],
): void {
  for (const value of values) params.append(name, value);
}

export function serializeEcosystemFilters(filters: EcosystemFilters): string {
  const normalized = parseEcosystemFilters({
    participantType: filters.participantType,
    includeEnablers: String(filters.includeEnablers),
    ecosystemDomain: filters.ecosystemDomains,
    organisationSubtype: filters.organisationSubtypes,
    ecosystemRole: filters.ecosystemRoles,
    businessStage: filters.businessStages,
    technicalLayer: filters.technicalLayers,
    capability: filters.capabilities,
    componentCategory: filters.componentCategories,
    roboticsVertical: filters.roboticsVerticals,
    headquartersState: filters.headquartersStates,
    headquartersCity: filters.headquartersCities,
    activeSignalType: filters.activeSignalTypes,
    reviewStatus: filters.reviewStatuses,
    publicContact: filters.publicContactAvailability,
    evidenceCoverageBand: filters.evidenceCoverageBand,
    evidenceFreshness: filters.evidenceFreshness,
    minimumDiscoveryConfidence: filters.minimumDiscoveryConfidence?.toString(),
    discoveredAfter: filters.discoveredAfter,
    discoveredBefore: filters.discoveredBefore,
    page: filters.page.toString(),
    pageSize: filters.pageSize.toString(),
    sort: filters.sort,
    direction: filters.direction,
  });
  const params = new URLSearchParams();
  if (normalized.participantType !== DEFAULT_ECOSYSTEM_FILTERS.participantType) params.set("participantType", normalized.participantType);
  if (normalized.includeEnablers) params.set("includeEnablers", "true");
  appendValues(params, "businessStage", normalized.businessStages);
  appendValues(params, "ecosystemDomain", normalized.ecosystemDomains);
  appendValues(params, "organisationSubtype", normalized.organisationSubtypes);
  appendValues(params, "ecosystemRole", normalized.ecosystemRoles);
  appendValues(params, "technicalLayer", normalized.technicalLayers);
  appendValues(params, "capability", normalized.capabilities);
  appendValues(params, "componentCategory", normalized.componentCategories);
  appendValues(params, "roboticsVertical", normalized.roboticsVerticals);
  appendValues(params, "headquartersState", normalized.headquartersStates);
  appendValues(params, "headquartersCity", normalized.headquartersCities);
  appendValues(params, "activeSignalType", normalized.activeSignalTypes);
  if (!equalFilterValue(normalized.reviewStatuses, DEFAULT_ECOSYSTEM_FILTERS.reviewStatuses)) appendValues(params, "reviewStatus", normalized.reviewStatuses);
  if (normalized.publicContactAvailability) params.set("publicContact", normalized.publicContactAvailability);
  if (normalized.evidenceCoverageBand) params.set("evidenceCoverageBand", normalized.evidenceCoverageBand);
  if (normalized.evidenceFreshness) params.set("evidenceFreshness", normalized.evidenceFreshness);
  if (normalized.minimumDiscoveryConfidence !== undefined) params.set("minimumDiscoveryConfidence", String(normalized.minimumDiscoveryConfidence));
  if (normalized.discoveredAfter) params.set("discoveredAfter", normalized.discoveredAfter);
  if (normalized.discoveredBefore) params.set("discoveredBefore", normalized.discoveredBefore);
  if (normalized.page !== DEFAULT_ECOSYSTEM_FILTERS.page) params.set("page", String(normalized.page));
  if (normalized.pageSize !== DEFAULT_ECOSYSTEM_FILTERS.pageSize) params.set("pageSize", String(normalized.pageSize));
  if (normalized.sort !== DEFAULT_ECOSYSTEM_FILTERS.sort) params.set("sort", normalized.sort);
  if (normalized.direction !== DEFAULT_ECOSYSTEM_FILTERS.direction) params.set("direction", normalized.direction);
  return params.toString();
}

export type EvidenceClassification = "none" | "inferred" | "evidence_backed";
export type EvidenceCoverageInput = {
  candidateSourceEvidence: boolean;
  currentSystemsContext: boolean;
  classification: EvidenceClassification;
  resolvedHeadquarters: boolean;
  publicProfessionalContact: boolean;
};
export type EvidenceCoverage = {
  score: number;
  numerator: number;
  denominator: 100;
  classification: EvidenceClassification;
  dimensions: {
    candidateSourceEvidence: number;
    currentSystemsContext: number;
    classification: number;
    resolvedHeadquarters: number;
    publicProfessionalContact: number;
  };
};

export function calculateEvidenceCoverage(input: EvidenceCoverageInput): EvidenceCoverage {
  const dimensions = {
    candidateSourceEvidence: input.candidateSourceEvidence ? 20 : 0,
    currentSystemsContext: input.currentSystemsContext ? 20 : 0,
    classification: input.classification === "evidence_backed" ? 20 : input.classification === "inferred" ? 10 : 0,
    resolvedHeadquarters: input.resolvedHeadquarters ? 20 : 0,
    publicProfessionalContact: input.publicProfessionalContact ? 20 : 0,
  };
  const score = Object.values(dimensions).reduce((total, value) => total + value, 0);
  return { score, numerator: score, denominator: 100, classification: input.classification, dimensions };
}

export function isStrongEvidence(coverage: EvidenceCoverage): boolean {
  return coverage.score >= 80 && coverage.classification === "evidence_backed";
}

export type PublicSignalInput = {
  type: EcosystemTaxonomyKey<"signal_type">;
  occurredAt: Date | string;
  expiresAt?: Date | string | null;
};

function signalDate(value: Date | string, field: "occurredAt" | "expiresAt"): Date {
  if (value instanceof Date) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed;
    }
  }
  throw new Error(`Public signal ${field} must be a valid ISO calendar date or Date.`);
}

export function activeUntilForSignal(signal: PublicSignalInput): Date | undefined {
  const occurredAt = signalDate(signal.occurredAt, "occurredAt");
  const freshnessDays = signalFreshnessDays(signal.type);
  if (freshnessDays === undefined) return undefined;
  const defaultExpiry = new Date(occurredAt);
  defaultExpiry.setUTCDate(defaultExpiry.getUTCDate() + freshnessDays);
  const explicitExpiry = signal.expiresAt === undefined || signal.expiresAt === null
    ? undefined
    : signalDate(signal.expiresAt, "expiresAt");
  return explicitExpiry && explicitExpiry < defaultExpiry ? explicitExpiry : defaultExpiry;
}

export function isActiveSignal(signal: PublicSignalInput, now: Date): boolean {
  const occurredAt = signalDate(signal.occurredAt, "occurredAt");
  const activeUntil = activeUntilForSignal(signal);
  return occurredAt !== undefined && occurredAt <= now && activeUntil !== undefined && activeUntil > now;
}

export type RelationshipReadinessInput = {
  evidencedEdges: number;
  candidates: number;
  unresolvedTargets?: number;
};
export type RelationshipReadiness = RelationshipReadinessInput & {
  ready: boolean;
  requiredEvidencedEdges: number;
  requiredCandidates: number;
  message: string;
};

export function relationshipReadiness(input: RelationshipReadinessInput): RelationshipReadiness {
  const thresholds = ECOSYSTEM_INTELLIGENCE_THRESHOLDS.relationships;
  const ready = input.evidencedEdges >= thresholds.minimumEvidencedEdges && input.candidates >= thresholds.minimumCandidates;
  return {
    evidencedEdges: input.evidencedEdges,
    candidates: input.candidates,
    unresolvedTargets: input.unresolvedTargets ?? 0,
    ready,
    requiredEvidencedEdges: thresholds.minimumEvidencedEdges,
    requiredCandidates: thresholds.minimumCandidates,
    message: ready
      ? "Verified relationship evidence is ready to view."
      : "More verified relationship evidence is needed before showing the graph.",
  };
}

type InsightMeasure = {
  numerator: number;
  denominator: number;
  label: string;
};

export type InsightUnknownDimension =
  | "ecosystem_domain"
  | "organisation_subtype"
  | "ecosystem_role"
  | "business_stage"
  | "technical_layer"
  | "capability"
  | "component_category"
  | "robotics_vertical";
export type MissingDataDimension =
  | InsightUnknownDimension
  | "headquarters_state"
  | "headquarters_city"
  | "public_contact"
  | "evidence_coverage";

export type RepresentationGapInput = InsightMeasure & {
  dimension: InsightUnknownDimension;
};
export type GeographicConcentrationInput = InsightMeasure & { stateKey: string };
export type MissingDataGapInput = InsightMeasure & { dimension: MissingDataDimension };
export type ResearchGapInsightInput = {
  representation?: RepresentationGapInput;
  geographicConcentration?: GeographicConcentrationInput;
  missingData?: MissingDataGapInput;
  publicContacts?: InsightMeasure;
  dependencySignals?: InsightMeasure;
  staleEvidence?: InsightMeasure;
};
export type ResearchGapInsight = {
  ruleKey: string;
  title: string;
  copy: string;
  numerator: number;
  denominator: number;
  percentage: number;
  confidence: "map_evidence";
  supportingFilters: EcosystemFilters;
};

function percentage(measure: InsightMeasure): number {
  return measure.denominator === 0 ? 0 : Math.round((measure.numerator / measure.denominator) * 100);
}

function insight(
  ruleKey: string,
  title: string,
  copy: string,
  measure: InsightMeasure,
  supportingFilters: EcosystemFilters,
): ResearchGapInsight {
  const coverage = percentage(measure);
  const confidence = "map_evidence" as const;
  return {
    ruleKey,
    title: `Current Mewtuals map: ${title}`,
    copy: `Current Mewtuals map: ${copy} Counts: ${measure.numerator} of ${measure.denominator}. Coverage: ${coverage}%. Confidence: ${confidence}. Rule key: ${ruleKey}.`,
    numerator: measure.numerator,
    denominator: measure.denominator,
    percentage: coverage,
    confidence,
    supportingFilters: filtersFromSearchParams(
      new URLSearchParams(serializeEcosystemFilters(supportingFilters)),
    ),
  };
}

function filtersForUnknownDimension(dimension: InsightUnknownDimension): EcosystemFilters {
  switch (dimension) {
    case "ecosystem_domain": return parseEcosystemFilters({ ecosystemDomain: "unknown" });
    case "organisation_subtype": return parseEcosystemFilters({ organisationSubtype: "unknown" });
    case "ecosystem_role": return parseEcosystemFilters({ ecosystemRole: "unknown" });
    case "business_stage": return parseEcosystemFilters({ businessStage: "unknown" });
    case "technical_layer": return parseEcosystemFilters({ technicalLayer: "unknown" });
    case "capability": return parseEcosystemFilters({ capability: "unknown" });
    case "component_category": return parseEcosystemFilters({ componentCategory: "unknown" });
    case "robotics_vertical": return parseEcosystemFilters({ roboticsVertical: "unknown" });
    default: throw new Error(`Unsupported representation dimension: ${dimension}.`);
  }
}

function filtersForMissingDimension(dimension: MissingDataDimension): EcosystemFilters {
  if (dimension in unknownDimensionFilterBuilders) {
    return filtersForUnknownDimension(dimension as InsightUnknownDimension);
  }
  switch (dimension) {
    case "headquarters_state": return parseEcosystemFilters({ headquartersState: "unknown" });
    case "headquarters_city": return parseEcosystemFilters({ headquartersCity: "unknown" });
    case "public_contact": return parseEcosystemFilters({ publicContact: "missing" });
    case "evidence_coverage": return parseEcosystemFilters({ evidenceCoverageBand: "unknown" });
    default: throw new Error(`Unsupported missing-data dimension: ${dimension}.`);
  }
}

const unknownDimensionFilterBuilders: Record<InsightUnknownDimension, true> = {
  ecosystem_domain: true,
  organisation_subtype: true,
  ecosystem_role: true,
  business_stage: true,
  technical_layer: true,
  capability: true,
  component_category: true,
  robotics_vertical: true,
};

function geographicSupportingFilters(stateKey: string): EcosystemFilters {
  const filters = parseEcosystemFilters({ headquartersState: stateKey });
  if (!filters.headquartersStates.some((state) => state !== "unknown")) {
    throw new Error("Geographic concentration requires an explicit headquarters state filter.");
  }
  return filters;
}

function isAtLeast(measure: InsightMeasure, numerator: number, denominator: number): boolean {
  return measure.denominator > 0 && measure.numerator * denominator >= measure.denominator * numerator;
}

function isBelow(measure: InsightMeasure, numerator: number, denominator: number): boolean {
  return measure.denominator > 0 && measure.numerator * denominator < measure.denominator * numerator;
}

export function buildResearchGapInsights(input: ResearchGapInsightInput): readonly ResearchGapInsight[] {
  const insights: ResearchGapInsight[] = [];
  const thresholds = ECOSYSTEM_INTELLIGENCE_THRESHOLDS;
  const representation = input.representation;
  if (representation && isBelow(representation, thresholds.representationCoverageTargetPercent, 100)) {
    insights.push(insight("representation_below_target", "Map representation needs research", `${representation.numerator} of ${representation.denominator} ${representation.label.toLowerCase()} are represented, below the ${thresholds.representationCoverageTargetPercent}% coverage target.`, representation, filtersForUnknownDimension(representation.dimension)));
  }
  const geographic = input.geographicConcentration;
  if (geographic && geographic.denominator >= thresholds.geographicConcentration.minimumResolvedCandidates && isAtLeast(geographic, thresholds.geographicConcentration.minimumSharePercent, 100)) {
    insights.push(insight("geographic_concentration", "Map coverage is concentrated", `${geographic.label} accounts for ${geographic.numerator} of ${geographic.denominator} resolved locations.`, geographic, geographicSupportingFilters(geographic.stateKey)));
  }
  const missingData = input.missingData;
  if (missingData && missingData.numerator >= thresholds.missingData.minimumAffectedCandidates && isAtLeast(missingData, thresholds.missingData.minimumRatePercent, 100)) {
    insights.push(insight("missing_data", "More evidence can improve map quality", `${missingData.numerator} of ${missingData.denominator} records are missing ${missingData.label.toLowerCase()}.`, missingData, filtersForMissingDimension(missingData.dimension)));
  }
  const contacts = input.publicContacts;
  if (contacts && contacts.denominator >= thresholds.publicContacts.minimumGroupSize && isBelow(contacts, thresholds.publicContacts.maximumAvailabilityPercentExclusive, 100)) {
    insights.push(insight("low_public_contact_coverage", "Public contact coverage is limited", `${contacts.numerator} of ${contacts.denominator} records have ${contacts.label.toLowerCase()}.`, contacts, parseEcosystemFilters({ publicContact: "missing" })));
  }
  const dependencySignals = input.dependencySignals;
  if (dependencySignals && dependencySignals.numerator >= thresholds.dependencySignals.minimumSignals) {
    insights.push(insight("dependency_related_signals", "Dependency-related signals merit review", `${dependencySignals.numerator} active dependency-related signals are represented across ${dependencySignals.denominator} organisations.`, dependencySignals, parseEcosystemFilters({ activeSignalType: dependencyRelatedSignalTypes })));
  }
  const staleEvidence = input.staleEvidence;
  if (staleEvidence && isAtLeast(staleEvidence, thresholds.staleEvidence.minimumAffectedSharePercent, 100)) {
    insights.push(insight("stale_evidence", "Evidence freshness needs review", `${staleEvidence.numerator} of ${staleEvidence.denominator} records have evidence older than the ${thresholds.staleEvidence.maximumAgeDays}-day freshness threshold.`, staleEvidence, parseEcosystemFilters({ evidenceFreshness: "stale" })));
  }
  return insights;
}
