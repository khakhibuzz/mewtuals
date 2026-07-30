import {
  canonicalizeEvidenceUrl,
  createEvidenceFingerprint,
  persistableRadarEvidenceSchema,
} from "../../app/domain/global-radar";

export type GlobalRadarAdminEvidenceInput = Readonly<{
  globalEntityId: string | null;
  sourceUrl: string;
  canonicalSourceUrl: string;
  sourceName: string;
  sourceType: string;
  sourceLanguage: string;
  sourceCountry: string;
  sourceFamily: string;
  claim: string;
  sourceExcerpt: string | null;
  englishSummary: string;
  publishedAt: string | null;
  observedAt: string;
  evidenceConfidence: number;
  translationConfidence: number | null;
  isPrimarySource: boolean;
  isSyndicated: boolean;
  supportsDirectDemand: boolean;
  supportsIndiaRelevance: boolean;
  supportedFieldPaths: readonly string[];
  rawMetadata: Record<string, unknown>;
}>;

export type CanonicalGlobalRadarAdminEvidence = Omit<
  GlobalRadarAdminEvidenceInput,
  "supportedFieldPaths"
> &
  Readonly<{
    supportedFieldPaths: string[];
    evidenceFingerprint: string;
    sourceUrl: string;
    canonicalSourceUrl: string;
  }>;

function isSearchResultEvidenceUrl(value: string): boolean {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return (
    ((host.includes("google.") ||
      host.includes("bing.") ||
      host.includes("baidu.")) &&
      ["/search", "/s"].some((path) => url.pathname.startsWith(path))) ||
    (host === "search.brave.com" && url.pathname.startsWith("/search")) ||
    (host.includes("duckduckgo.") && url.searchParams.has("q"))
  );
}

export function canonicalizeGlobalRadarAdminEvidence(
  value: GlobalRadarAdminEvidenceInput,
  now: Date,
): CanonicalGlobalRadarAdminEvidence | null {
  if (!value || typeof value !== "object") return null;
  let sourceUrl: string;
  let proposedCanonicalSourceUrl: string;
  try {
    sourceUrl = canonicalizeEvidenceUrl(value.sourceUrl);
    proposedCanonicalSourceUrl = canonicalizeEvidenceUrl(
      value.canonicalSourceUrl,
    );
  } catch {
    return null;
  }
  const canonicalSourceUrl = sourceUrl;
  const proposedObservedAt = new Date(value.observedAt);
  const publishedAt =
    value.publishedAt === null ? null : new Date(value.publishedAt);
  if (
    isSearchResultEvidenceUrl(sourceUrl) ||
    isSearchResultEvidenceUrl(proposedCanonicalSourceUrl) ||
    Number.isNaN(proposedObservedAt.getTime()) ||
    proposedObservedAt > now ||
    (publishedAt !== null &&
      (Number.isNaN(publishedAt.getTime()) || publishedAt > now))
  ) return null;
  const documentMarkup =
    /<(?:!doctype\b|\?xml\b|!\[cdata\[|\/?[a-z][a-z0-9:-]*(?:\s[^<>]*?)?\/?>)/i;
  if (
    documentMarkup.test(value.claim) ||
    documentMarkup.test(value.englishSummary) ||
    (value.sourceExcerpt !== null && documentMarkup.test(value.sourceExcerpt))
  ) return null;
  const evidenceFingerprint = createEvidenceFingerprint({
    sourceUrl,
    canonicalSourceUrl,
    isPrimarySource: value.isPrimarySource,
  });
  const { globalEntityId, ...persistableValue } = value;
  const parsed = persistableRadarEvidenceSchema.safeParse({
    contributorEntityRef: null,
    ...persistableValue,
    sourceUrl,
    canonicalSourceUrl,
    observedAt: now.toISOString(),
    rawMetadata: {},
    evidenceFingerprint,
    supportedFieldPaths: [...value.supportedFieldPaths],
  });
  if (!parsed.success) return null;
  if (
    parsed.data.sourceLanguage.toLowerCase() !== "en" &&
    (parsed.data.translationConfidence === null ||
      parsed.data.englishSummary.trim() === parsed.data.claim.trim())
  ) return null;
  const { contributorEntityRef: _contributorEntityRef, ...canonical } =
    parsed.data;
  void _contributorEntityRef;
  return {
    ...canonical,
    globalEntityId,
  };
}

export function isGlobalRadarEvidenceContributorEligible(input: {
  contributorEntityId: string | null;
  primaryEntityId: string | null;
  associatedEntityIds: readonly string[];
}): boolean {
  return (
    input.contributorEntityId === null ||
    input.contributorEntityId === input.primaryEntityId ||
    input.associatedEntityIds.includes(input.contributorEntityId)
  );
}
