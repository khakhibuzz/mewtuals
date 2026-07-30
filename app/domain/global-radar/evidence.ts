import { z } from "zod";

import { globalRadarSourceFamilies } from "../taxonomies/global-radar-v1";
import {
  boundedRecordSchema,
  candidateEvidenceSourceKinds,
  complianceFactsSchema,
  confidenceSchema,
  isoTimestampSchema,
  publicHttpUrlSchema,
  sensitiveDataFlagsSchema,
  type CandidateEvidence,
} from "./contracts";
import {
  canonicalizeEvidenceUrl,
  createEvidenceFingerprint,
} from "./normalization";
import { persistableRadarEvidenceSchema } from "./persistence";
import { normalizedRequirementInputSchema } from "./requirements";
import {
  isMomentumWorkerScoredMetricEvidencePath,
  isWorkerScoredComponentEvidencePath,
} from "./score-evidence";

const applicationRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
const conciseTextSchema = (maximum: number) =>
  z.string().trim().min(1).max(maximum);
const supportedFieldPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/);
const documentMarkupPattern =
  /<(?:!doctype\b|\?xml\b|!\[cdata\[|\/?[a-z][a-z0-9:-]*(?:\s[^<>]*?)?\/?>)/i;
const hanTextPattern = /\p{Script=Han}/u;
const devanagariTextPattern = /\p{Script=Devanagari}/u;

const signalEvidenceFields = new Set([
  "announcedAt",
  "collectionGeographies",
  "deliveryGeographies",
  "demandDomain",
  "effectiveFrom",
  "expiresAt",
  "factualSummary",
  "industry",
  "manufacturingGeographies",
  "partnerApplicationUrl",
  "sourceCountry",
  "targetCapabilityTags",
  "targetGeographies",
  "targetModelOrSystem",
  "title",
]);
const systemsContextFields = new Set([
  "downstreamModelOrRobotBehavior",
  "factualElements",
  "higherLevelSystemGoal",
  "lowerLevelInputsRequired",
  "possibleIndianExecutionRole",
  "relevantStackLayer",
  "systemsContextSummary",
  "transformationOrCapabilityAdded",
  "whyTheRequirementMatters",
]);
const responsePathFields = new Set([
  "responsePath",
  "professionalResponsePath",
  "publicResponsePath",
]);
const directAskTypes = new Set([
  "rfp",
  "procurement",
  "supplier_registration",
  "vendor_request",
  "partner_application",
  "distributor_request",
  "manufacturing_request",
  "data_collection_request",
  "testing_or_certification_request",
  "installation_or_service_request",
]);
const precursorTypes = new Set([
  "funding",
  "hiring",
  "deployment",
  "facility",
  "platform_launch",
  "expansion",
]);
const indiaRelevanceTypes = new Set([
  "explicit_India",
  "existing_India_presence",
  "India_expansion",
  "globally_open",
  "inferred_India_compatible",
  "no_current_India_fit",
]);
const indiaFactKinds = new Set([
  "suppliers",
  "participants",
  "languages",
  "roads_or_environments",
  "manufacturing",
  "distribution",
  "collection",
  "installation",
  "service",
  "requirement_access",
]);

export function evidenceSupportsDocumentedIndianRelationship(
  supportedFieldPaths: readonly string[],
): boolean {
  return supportedFieldPaths.some((path) => {
    const segments = path.split(".");
    return (
      segments.length === 3 &&
      segments[0] === "indiaRelevance" &&
      segments[1] === "existing_India_presence" &&
      indiaFactKinds.has(segments[2] ?? "")
    );
  });
}
const requirementEvidenceFields = new Set([
  ...Object.keys(normalizedRequirementInputSchema.shape),
  "globallyDeliverable",
  "openToExternalCounterparties",
]);
const sensitiveDataEvidenceFields = new Set(
  Object.keys(sensitiveDataFlagsSchema.shape),
);
const complianceEvidenceFields = new Set(
  Object.keys(complianceFactsSchema.shape),
);

export const radarEvidenceProposalSchema = z
  .strictObject({
    contributorEntityRef: applicationRefSchema.nullable(),
    sourceUrl: publicHttpUrlSchema,
    canonicalSourceUrl: publicHttpUrlSchema.nullable(),
    sourceName: conciseTextSchema(200),
    sourceType: conciseTextSchema(100),
    sourceKind: z.enum(candidateEvidenceSourceKinds),
    sourceLanguage: conciseTextSchema(35),
    sourceCountry: conciseTextSchema(100),
    sourceFamily: z.enum(globalRadarSourceFamilies),
    claim: conciseTextSchema(1_000),
    excerpt: conciseTextSchema(500).nullable(),
    englishSummary: conciseTextSchema(2_000),
    publishedAt: isoTimestampSchema.nullable(),
    observedAt: isoTimestampSchema,
    evidenceConfidence: confidenceSchema,
    translationConfidence: confidenceSchema.nullable(),
    isPrimarySource: z.boolean(),
    isOfficialProcurementSource: z.boolean(),
    isSyndicated: z.boolean(),
    supportsDirectDemand: z.boolean(),
    supportsIndiaRelevance: z.boolean(),
    supportedFieldPaths: z
      .array(supportedFieldPathSchema)
      .min(1)
      .max(50),
    rawMetadata: boundedRecordSchema,
  })
  .superRefine((proposal, context) => {
    if (looksLikeFullPageContent(proposal)) {
      context.addIssue({
        code: "custom",
        message: "Evidence must contain concise claims, not full-page content.",
        path: ["claim"],
      });
    }
    proposal.supportedFieldPaths.forEach((path, index) => {
      if (!isGlobalRadarEvidenceFieldPathSupported(path)) {
        context.addIssue({
          code: "custom",
          message: "Evidence field provenance is not supported.",
          path: ["supportedFieldPaths", index],
        });
      }
    });
  });

export type RadarEvidenceProposal = Readonly<
  z.output<typeof radarEvidenceProposalSchema>
>;

export type NormalizedRadarEvidence = Readonly<
  z.output<typeof persistableRadarEvidenceSchema>
>;

export const radarEvidenceNormalizationFailureReasons = [
  "invalid_evidence",
  "invalid_evidence_url",
  "full_page_content",
  "unsupported_field_path",
  "search_result_is_not_evidence",
  "summary_is_not_evidence",
  "missing_original_language_evidence",
  "missing_english_summary",
  "missing_translation_confidence",
  "invalid_evidence_date",
] as const;

export type RadarEvidenceNormalizationFailureReason =
  (typeof radarEvidenceNormalizationFailureReasons)[number];

export type RadarEvidenceNormalizationResult =
  | Readonly<{
      valid: true;
      evidence: NormalizedRadarEvidence;
      classification: CandidateEvidence;
    }>
  | Readonly<{
      valid: false;
      reason: RadarEvidenceNormalizationFailureReason;
    }>;

export function isGlobalRadarEvidenceFieldPathSupported(path: string): boolean {
  if (responsePathFields.has(path)) return true;
  if (isWorkerScoredComponentEvidencePath(path)) return true;
  if (isMomentumWorkerScoredMetricEvidencePath(path)) return true;
  const segments = path.split(".");
  if (segments[0] === "signal" && signalEvidenceFields.has(segments[1] ?? "")) {
    return segments.length === 2;
  }
  if (
    segments[0] === "directDemandAsk" &&
    directAskTypes.has(segments[1] ?? "")
  ) {
    return segments.length === 2;
  }
  if (
    segments[0] === "precursorDevelopment" &&
    precursorTypes.has(segments[1] ?? "")
  ) {
    return segments.length === 2;
  }
  if (
    segments[0] === "indiaRelevance" &&
    indiaRelevanceTypes.has(segments[1] ?? "") &&
    indiaFactKinds.has(segments[2] ?? "")
  ) {
    return segments.length === 3;
  }
  if (
    segments[0] === "systemsContext" &&
    systemsContextFields.has(segments[1] ?? "")
  ) {
    return segments.length === 2;
  }
  if (
    segments[0] === "requirement" &&
    segments.length === 2 &&
    requirementEvidenceFields.has(segments[1] ?? "")
  ) {
    return true;
  }
  if (segments[0] === "sensitiveDataAndCompliance" && segments.length === 3) {
    if (segments[1] === "sensitiveDataFlags") {
      return sensitiveDataEvidenceFields.has(segments[2] ?? "");
    }
    if (segments[1] === "complianceFacts") {
      return complianceEvidenceFields.has(segments[2] ?? "");
    }
  }
  return false;
}

function wordCount(value: string): number {
  return value.match(/\p{L}[\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

function looksLikeFullPageContent(input: unknown): boolean {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const record = input as Record<string, unknown>;
  const texts = [record.claim, record.excerpt, record.englishSummary].filter(
    (value): value is string => typeof value === "string",
  );
  return texts.some(
    (value) =>
      documentMarkupPattern.test(value) ||
      wordCount(value) > 220 ||
      (value.match(/\n\s*\n/g)?.length ?? 0) >= 4,
  );
}

function hasEnglishSummarySignal(value: string): boolean {
  const words = value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)?/g) ?? [];
  const latinLetters = value.match(/[A-Za-z]/g)?.length ?? 0;
  return words.length >= 3 && latinLetters >= 10;
}

function normalizeLanguage(value: string): string {
  const [language, ...rest] = value.trim().split("-");
  if (rest.length === 0) return language!.toLowerCase();
  return `${language!.toLowerCase()}-${rest
    .map((part) => (part.length === 2 ? part.toUpperCase() : part))
    .join("-")}`;
}

function originalLanguageIsPresent(
  sourceLanguage: string,
  claim: string,
): boolean {
  const language = sourceLanguage.toLowerCase();
  if (language.startsWith("zh")) return hanTextPattern.test(claim);
  if (language.startsWith("hi")) return devanagariTextPattern.test(claim);
  return true;
}

function reject(
  reason: RadarEvidenceNormalizationFailureReason,
): RadarEvidenceNormalizationResult {
  return Object.freeze({ valid: false, reason });
}

export function normalizeRadarEvidence(
  input: unknown,
): RadarEvidenceNormalizationResult {
  if (looksLikeFullPageContent(input)) return reject("full_page_content");
  if (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Array.isArray((input as Record<string, unknown>).supportedFieldPaths) &&
    ((input as Record<string, unknown>).supportedFieldPaths as unknown[]).some(
      (path) =>
        typeof path === "string" &&
        !isGlobalRadarEvidenceFieldPathSupported(path),
    )
  ) {
    return reject("unsupported_field_path");
  }
  const parsed = radarEvidenceProposalSchema.safeParse(input);
  if (!parsed.success) return reject("invalid_evidence");
  const proposal = parsed.data;
  if (proposal.sourceKind === "summary") {
    return reject("summary_is_not_evidence");
  }
  if (proposal.sourceKind === "search_result") {
    return reject("search_result_is_not_evidence");
  }
  if (
    proposal.supportedFieldPaths.some(
      (path) => !isGlobalRadarEvidenceFieldPathSupported(path),
    )
  ) {
    return reject("unsupported_field_path");
  }
  if (
    proposal.publishedAt !== null &&
    Date.parse(proposal.publishedAt) > Date.parse(proposal.observedAt)
  ) {
    return reject("invalid_evidence_date");
  }

  const sourceLanguage = normalizeLanguage(proposal.sourceLanguage);
  const nonEnglish = !sourceLanguage.toLowerCase().startsWith("en");
  if (!originalLanguageIsPresent(sourceLanguage, proposal.claim)) {
    return reject("missing_original_language_evidence");
  }
  if (!hasEnglishSummarySignal(proposal.englishSummary)) {
    return reject("missing_english_summary");
  }
  if (nonEnglish && proposal.translationConfidence === null) {
    return reject("missing_translation_confidence");
  }
  if (
    nonEnglish &&
    proposal.claim.normalize("NFKC").toLowerCase() ===
      proposal.englishSummary.normalize("NFKC").toLowerCase()
  ) {
    return reject("missing_original_language_evidence");
  }

  let sourceUrl: string;
  let canonicalSourceUrl: string;
  try {
    sourceUrl = canonicalizeEvidenceUrl(proposal.sourceUrl);
    canonicalSourceUrl = canonicalizeEvidenceUrl(
      proposal.canonicalSourceUrl ?? sourceUrl,
    );
  } catch {
    return reject("invalid_evidence_url");
  }
  const supportedFieldPaths = [
    ...new Set(proposal.supportedFieldPaths),
  ].sort();
  const supportsDirectDemand = supportedFieldPaths.some((path) =>
    path.startsWith("directDemandAsk."),
  );
  const supportsIndiaRelevance = supportedFieldPaths.some((path) =>
    path.startsWith("indiaRelevance."),
  );
  const evidenceFingerprint = createEvidenceFingerprint({
    sourceUrl,
    canonicalSourceUrl,
    isPrimarySource: proposal.isPrimarySource,
  });
  const evidence = persistableRadarEvidenceSchema.parse({
    contributorEntityRef: proposal.contributorEntityRef,
    sourceUrl,
    canonicalSourceUrl,
    sourceName: proposal.sourceName,
    sourceType: proposal.sourceType,
    sourceLanguage,
    sourceCountry: proposal.sourceCountry,
    sourceFamily: proposal.sourceFamily,
    claim: proposal.claim,
    sourceExcerpt: proposal.excerpt,
    englishSummary: proposal.englishSummary,
    publishedAt: proposal.publishedAt,
    observedAt: proposal.observedAt,
    evidenceConfidence: proposal.evidenceConfidence,
    translationConfidence: nonEnglish
      ? proposal.translationConfidence
      : null,
    isPrimarySource: proposal.isPrimarySource,
    isSyndicated: proposal.isSyndicated,
    supportsDirectDemand,
    supportsIndiaRelevance,
    rawMetadata: proposal.rawMetadata,
    evidenceFingerprint,
    supportedFieldPaths,
  });
  const classification: CandidateEvidence = {
    sourceUrl,
    canonicalSourceUrl,
    sourceKind: proposal.sourceKind,
    sourceLanguage,
    originalText: proposal.claim,
    englishSummary: proposal.englishSummary,
    publishedAt: proposal.publishedAt,
    observedAt: proposal.observedAt,
    evidenceConfidence: proposal.evidenceConfidence,
    translationConfidence: nonEnglish
      ? proposal.translationConfidence
      : null,
    isPrimarySource: proposal.isPrimarySource,
    isOfficialProcurementSource: proposal.isOfficialProcurementSource,
    supportsDirectDemand,
    isSyndicated: proposal.isSyndicated,
    organizationId: proposal.contributorEntityRef ?? "unresolved_entity",
    corporateGroupId: proposal.contributorEntityRef ?? "unresolved_entity",
    supportedFieldPaths: [...supportedFieldPaths],
  };
  Object.freeze(evidence.supportedFieldPaths);
  Object.freeze(evidence.rawMetadata);
  Object.freeze(evidence);
  Object.freeze(classification.supportedFieldPaths);
  Object.freeze(classification);
  return Object.freeze({ valid: true, evidence, classification });
}
