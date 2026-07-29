import {
  candidateEvidenceSourceKindLookup,
  confidenceSchema,
  directDemandAskTypeLookup,
  isoTimestampSchema,
  precursorDevelopmentTypeLookup,
  professionalResponsePathSchema,
  type CandidateEvidence,
  type ClassificationResult,
  type EvidenceCandidate,
  type ProfessionalResponsePath,
  type RadarRejectionReason,
  type SignalClass,
  type SignalGateFacts,
} from "./contracts";
import {
  canonicalizeEvidenceUrl,
  createEvidenceFingerprint,
} from "./normalization";

const documentMarkupPattern =
  /<(?:!doctype\b|\?xml\b|!\[cdata\[|\/?[a-z][a-z0-9:-]*(?:\s[^<>]*?)?\/?>)/i;
const hanTextPattern = /\p{Script=Han}/u;
const latinTextPattern = /[A-Za-z]/;
const responseFieldNames = new Set([
  "professionalresponsepath",
  "publicresponsepath",
  "responsepath",
]);
const roleEmailTerms = new Set([
  "bd",
  "business",
  "contact",
  "distribution",
  "distributor",
  "enquiry",
  "hello",
  "india",
  "info",
  "installation",
  "manufacturing",
  "partner",
  "partnerships",
  "procurement",
  "purchasing",
  "research",
  "rfp",
  "sales",
  "service",
  "sourcing",
  "supplier",
  "support",
  "tender",
  "vendor",
]);

type ValidatedEvidence = Readonly<{
  item: CandidateEvidence;
  fingerprint: string;
}>;

type EvidenceAggregate = {
  primary: boolean;
  nonSyndicated: boolean;
  organizationId: string;
  corporateGroupId: string;
};

function reject(reason: RadarRejectionReason): ClassificationResult {
  return Object.freeze({ accepted: false, reason });
}

function accept(
  signalClass: SignalClass,
  gateFacts: SignalGateFacts,
): ClassificationResult {
  return Object.freeze({
    accepted: true,
    signalClass,
    gateFacts: Object.freeze(gateFacts),
  });
}

function normalizedFieldPath(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSearchResultUrl(value: string): boolean {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return (
    ((host.startsWith("google.") || host === "bing.com") &&
      ["/search", "/url", "/ck/"].some((prefix) =>
        path.startsWith(prefix),
      )) ||
    (host === "baidu.com" && ["/s", "/link"].includes(path)) ||
    host === "search.yahoo.com" ||
    host === "duckduckgo.com"
  );
}

function isConcisePlainText(value: string, maximumLength: number): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= maximumLength &&
    !documentMarkupPattern.test(trimmed)
  );
}

function validateEvidenceItem(
  item: CandidateEvidence,
): RadarRejectionReason | null {
  if (!candidateEvidenceSourceKindLookup[item.sourceKind]) {
    return "invalid_evidence";
  }
  if (item.sourceKind === "summary") return "summary_is_not_evidence";
  if (item.sourceKind === "search_result") {
    return "search_result_is_not_evidence";
  }

  let sourceUrl: string;
  try {
    sourceUrl = canonicalizeEvidenceUrl(item.sourceUrl);
    if (item.canonicalSourceUrl) {
      canonicalizeEvidenceUrl(item.canonicalSourceUrl);
    }
  } catch {
    return "invalid_evidence_url";
  }
  if (isSearchResultUrl(sourceUrl)) return "search_result_is_not_evidence";

  if (
    !isConcisePlainText(item.originalText, 1_000) ||
    !isConcisePlainText(item.englishSummary, 2_000) ||
    !item.sourceLanguage.trim() ||
    !item.organizationId.trim() ||
    !item.corporateGroupId.trim() ||
    item.supportedFieldPaths.length === 0 ||
    item.supportedFieldPaths.length > 50 ||
    !isoTimestampSchema.safeParse(item.observedAt).success ||
    (item.publishedAt !== null &&
      !isoTimestampSchema.safeParse(item.publishedAt).success) ||
    !confidenceSchema.safeParse(item.evidenceConfidence).success ||
    (item.translationConfidence !== null &&
      !confidenceSchema.safeParse(item.translationConfidence).success)
  ) {
    return "invalid_evidence";
  }

  if (item.sourceLanguage.toLowerCase().startsWith("zh")) {
    if (!hanTextPattern.test(item.originalText)) {
      return "missing_original_language_evidence";
    }
    if (item.translationConfidence === null) {
      return "missing_translation_confidence";
    }
    if (!latinTextPattern.test(item.englishSummary)) {
      return "missing_english_summary";
    }
  }
  return null;
}

function validateEvidence(
  input: EvidenceCandidate,
):
  | Readonly<{ valid: true; evidence: readonly ValidatedEvidence[] }>
  | Readonly<{ valid: false; reason: RadarRejectionReason }> {
  if (
    input.evidence.length === 0 ||
    !isoTimestampSchema.safeParse(input.observedAt).success
  ) {
    return input.evidence.length === 0
      ? { valid: false, reason: "insufficient_evidence" }
      : { valid: false, reason: "invalid_evidence" };
  }

  const validated: ValidatedEvidence[] = [];
  for (const item of input.evidence) {
    const reason = validateEvidenceItem(item);
    if (reason) return { valid: false, reason };
    validated.push(
      Object.freeze({
        item,
        fingerprint: createEvidenceFingerprint({
          sourceUrl: item.sourceUrl,
          canonicalSourceUrl: item.canonicalSourceUrl,
          isPrimarySource: item.isPrimarySource,
          publishedAt: item.publishedAt,
        }),
      }),
    );
  }
  return { valid: true, evidence: Object.freeze(validated) };
}

function evidenceAggregates(
  evidence: readonly ValidatedEvidence[],
): ReadonlyMap<string, EvidenceAggregate> {
  const aggregates = new Map<string, EvidenceAggregate>();
  for (const { item, fingerprint } of evidence) {
    const aggregate = aggregates.get(fingerprint);
    if (!aggregate) {
      aggregates.set(fingerprint, {
        primary: item.isPrimarySource && !item.isSyndicated,
        nonSyndicated: !item.isSyndicated,
        organizationId: item.organizationId,
        corporateGroupId: item.corporateGroupId,
      });
      continue;
    }
    aggregate.primary ||= item.isPrimarySource && !item.isSyndicated;
    if (!item.isSyndicated) {
      aggregate.nonSyndicated = true;
      aggregate.organizationId = item.organizationId;
      aggregate.corporateGroupId = item.corporateGroupId;
    }
  }
  return aggregates;
}

function average(values: readonly number[]): number {
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function supportsField(
  item: CandidateEvidence,
  fieldPrefix: string,
): boolean {
  const normalizedPrefix = normalizedFieldPath(fieldPrefix);
  return item.supportedFieldPaths.some((fieldPath) =>
    normalizedFieldPath(fieldPath).startsWith(normalizedPrefix),
  );
}

function baseGateFacts(
  input: EvidenceCandidate,
  evidence: readonly ValidatedEvidence[],
  responsePathVerified: boolean,
): SignalGateFacts {
  const aggregates = evidenceAggregates(evidence);
  const aggregateValues = [...aggregates.values()];
  const translationConfidences = evidence.flatMap(({ item }) =>
    item.translationConfidence === null ? [] : [item.translationConfidence],
  );
  const expiresAt = input.directDemandAsk?.expiresAt;
  const explicitCurrentAsk = Boolean(
    input.directDemandAsk?.isExplicit &&
      directDemandAskTypeLookup[input.directDemandAsk.type] &&
      (expiresAt === null ||
        (typeof expiresAt === "string" &&
          isoTimestampSchema.safeParse(expiresAt).success &&
          Date.parse(expiresAt) > Date.parse(input.observedAt))),
  );

  return {
    explicitCurrentAsk,
    officialDirectDemandEvidence: evidence.some(
      ({ item }) =>
        item.supportsDirectDemand &&
        supportsField(item, "directDemandAsk") &&
        (item.isPrimarySource || item.isOfficialProcurementSource),
    ),
    datedDevelopment: evidence.some(
      ({ item }) =>
        item.publishedAt !== null &&
        Date.parse(item.publishedAt) <= Date.parse(input.observedAt) &&
        supportsField(item, "precursorDevelopment"),
    ),
    evidenceItemCount: aggregates.size,
    independentOrganizationCount: Math.min(
      new Set(
        aggregateValues
          .filter((item) => item.nonSyndicated)
          .map((item) => item.organizationId),
      ).size,
      new Set(
        aggregateValues
          .filter((item) => item.nonSyndicated)
          .map((item) => item.corporateGroupId),
      ).size,
    ),
    primarySourceCount: aggregateValues.filter((item) => item.primary).length,
    nonSyndicatedEvidenceCount: aggregateValues.filter(
      (item) => item.nonSyndicated,
    ).length,
    taxonomyConsistency: input.momentumMetrics?.taxonomyConsistency ?? null,
    evidenceQuality: input.momentumMetrics?.evidenceQuality ?? null,
    evidenceConfidence: average(
      evidence.map(({ item }) => item.evidenceConfidence),
    ),
    translationConfidence:
      translationConfidences.length === 0
        ? null
        : average(translationConfidences),
    responsePathVerified,
  };
}

function isRoleBusinessEmail(value: string): boolean {
  const [localPart] = value.toLowerCase().split("@");
  const terms = localPart.split(/[^a-z0-9]+/).filter(Boolean);
  return terms.some((term) => roleEmailTerms.has(term));
}

function canonicalEvidenceUrls(item: CandidateEvidence): readonly string[] {
  const urls = [canonicalizeEvidenceUrl(item.sourceUrl)];
  if (item.canonicalSourceUrl) {
    urls.push(canonicalizeEvidenceUrl(item.canonicalSourceUrl));
  }
  return urls;
}

function citedResponseEvidence(
  path: ProfessionalResponsePath,
  evidence: readonly ValidatedEvidence[],
): CandidateEvidence | null {
  const citedUrl = canonicalizeEvidenceUrl(path.evidenceUrl);
  return (
    evidence.find(
      ({ item }) =>
        item.isPrimarySource &&
        item.sourceKind === "original" &&
        canonicalEvidenceUrls(item).includes(citedUrl) &&
        item.supportedFieldPaths.some((fieldPath) =>
          responseFieldNames.has(normalizedFieldPath(fieldPath)),
        ),
    )?.item ?? null
  );
}

function validateResponsePath(
  responsePath: EvidenceCandidate["responsePath"],
  evidence: readonly ValidatedEvidence[],
):
  | Readonly<{ valid: true; verified: boolean }>
  | Readonly<{ valid: false; reason: RadarRejectionReason }> {
  if (responsePath === null) return { valid: true, verified: false };
  const parsed = professionalResponsePathSchema.safeParse(responsePath);
  if (!parsed.success) {
    return { valid: false, reason: "unsupported_response_path" };
  }
  const path = parsed.data;
  if (
    path.url !== null &&
    isSearchResultUrl(canonicalizeEvidenceUrl(path.url))
  ) {
    return { valid: false, reason: "unsupported_response_path" };
  }
  const citedEvidence = citedResponseEvidence(path, evidence);
  if (!citedEvidence) {
    return { valid: false, reason: "response_path_not_cited" };
  }

  if (path.type === "official_business_email") {
    const email = path.businessEmail;
    if (!email) return { valid: false, reason: "unsupported_response_path" };
    if (!isRoleBusinessEmail(email)) {
      return { valid: false, reason: "personal_contact_not_allowed" };
    }
    if (!citedEvidence.originalText.toLowerCase().includes(email)) {
      return { valid: false, reason: "response_path_not_cited" };
    }
    return { valid: true, verified: true };
  }

  const responseUrl = path.url;
  if (!responseUrl) {
    return { valid: false, reason: "unsupported_response_path" };
  }
  const canonicalResponseUrl = canonicalizeEvidenceUrl(responseUrl);
  const targetIsEvidence = canonicalEvidenceUrls(citedEvidence).includes(
    canonicalResponseUrl,
  );
  if (
    !targetIsEvidence &&
    !citedEvidence.originalText.includes(responseUrl) &&
    !citedEvidence.originalText.includes(canonicalResponseUrl)
  ) {
    return { valid: false, reason: "response_path_not_cited" };
  }
  return { valid: true, verified: true };
}

function classifyDirectDemand(
  input: EvidenceCandidate,
  gateFacts: SignalGateFacts,
): ClassificationResult {
  const ask = input.directDemandAsk;
  if (!ask?.isExplicit || !directDemandAskTypeLookup[ask.type]) {
    return reject("missing_explicit_current_ask");
  }
  if (
    ask.expiresAt !== null &&
    (!isoTimestampSchema.safeParse(ask.expiresAt).success ||
      Date.parse(ask.expiresAt) <= Date.parse(input.observedAt))
  ) {
    return reject("expired_direct_demand");
  }
  if (!gateFacts.officialDirectDemandEvidence) {
    return reject("missing_official_direct_demand_evidence");
  }
  return accept("direct_demand", gateFacts);
}

function classifyPrecursor(
  input: EvidenceCandidate,
  gateFacts: SignalGateFacts,
): ClassificationResult {
  const developmentType = input.precursorDevelopmentType;
  if (
    developmentType === null ||
    !precursorDevelopmentTypeLookup[developmentType]
  ) {
    return reject("unsupported_precursor_development");
  }
  if (!gateFacts.datedDevelopment) {
    return reject("missing_dated_precursor_evidence");
  }
  return accept("demand_precursor", gateFacts);
}

function scoreIsValid(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function classifyMomentum(
  input: EvidenceCandidate,
  gateFacts: SignalGateFacts,
): ClassificationResult {
  const metrics = input.momentumMetrics;
  if (!metrics || input.evidence.length < 2) {
    return reject("insufficient_momentum_evidence");
  }
  if (
    !scoreIsValid(metrics.taxonomyConsistency) ||
    !scoreIsValid(metrics.evidenceQuality)
  ) {
    return reject("invalid_evidence");
  }
  if (gateFacts.nonSyndicatedEvidenceCount < 2) {
    return reject("insufficient_non_syndicated_evidence");
  }
  if (gateFacts.independentOrganizationCount < 2) {
    return reject("insufficient_independent_organizations");
  }
  if (gateFacts.primarySourceCount < 1) {
    return reject("missing_primary_source");
  }
  if (metrics.taxonomyConsistency < 70) {
    return reject("taxonomy_inconsistent");
  }
  if (metrics.evidenceQuality < 60) {
    return reject("evidence_quality_too_low");
  }
  return accept("ecosystem_momentum", gateFacts);
}

export function classifySignal(input: EvidenceCandidate): ClassificationResult {
  const evidenceResult = validateEvidence(input);
  if (!evidenceResult.valid) return reject(evidenceResult.reason);

  const responseResult = validateResponsePath(
    input.responsePath,
    evidenceResult.evidence,
  );
  if (!responseResult.valid) return reject(responseResult.reason);

  const gateFacts = baseGateFacts(
    input,
    evidenceResult.evidence,
    responseResult.verified,
  );
  if (input.proposedSignalClass === "direct_demand") {
    return classifyDirectDemand(input, gateFacts);
  }
  if (input.proposedSignalClass === "demand_precursor") {
    return classifyPrecursor(input, gateFacts);
  }
  if (input.proposedSignalClass === "ecosystem_momentum") {
    return classifyMomentum(input, gateFacts);
  }
  return reject("invalid_evidence");
}
