import { normalizePublicHttpUrl } from "../public-url";

export type StablePublicIdentifier = Readonly<{
  namespace: string;
  value: string;
}>;

export type EntityIdentityInput = Readonly<{
  name: string;
  headquartersCountry: string;
  websiteUrl: string | null;
  linkedinOrganizationUrl: string | null;
  stablePublicIdentifiers: readonly StablePublicIdentifier[];
}>;

export type EntityIdentity = Readonly<{
  normalizedName: string;
  normalizedCountry: string;
  canonicalDomain: string | null;
  officialWebsiteUrl: string | null;
  linkedinOrganizationUrl: string | null;
  stableIdentifiers: readonly string[];
  collisionCandidateKey: string;
}>;

export type EntityIdentityComparison =
  | "same_entity"
  | "collision_candidate"
  | "distinct";

export type QueryFingerprintInput = Readonly<{
  query: string;
  language: string;
  sourceCountry: string;
  theme: string;
  signalIntent: string;
  sourceAdapter: string;
}>;

export type EvidenceFingerprintInput = Readonly<{
  sourceUrl: string;
  canonicalSourceUrl?: string | null;
  claim: string;
}>;

export type RequirementFingerprintInput = Readonly<{
  kind: string;
  summary: string;
}>;

const organizationSuffixPattern =
  /\b(?:co|company|corp|corporation|inc|incorporated|ltd|limited|llc|plc|pvt|private)\b/g;

const countryAliases: Readonly<Record<string, string>> = Object.freeze({
  america: "us",
  china: "cn",
  cn: "cn",
  india: "in",
  in: "in",
  prc: "cn",
  "people s republic of china": "cn",
  usa: "us",
  us: "us",
  "united states": "us",
  "united states of america": "us",
});

function normalizeWords(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEntityName(value: string): string {
  return normalizeWords(value)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(organizationSuffixPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(value: string): string {
  const normalized = normalizeEntityName(value);
  return countryAliases[normalized] ?? normalized;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fnv1a32(value: string, seed: number): string {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function createGlobalRadarFingerprint(value: unknown): string {
  const canonical = canonicalJson(value);
  return Array.from({ length: 8 }, (_, index) =>
    fnv1a32(canonical, Math.imul(index + 1, 0x9e3779b1)),
  ).join("");
}

function forceHttps(value: string): string {
  const url = new URL(value);
  url.protocol = "https:";
  return url.toString().replace(/\/$/, "");
}

export function normalizeEntityDomain(value: string): string {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  return new URL(normalizePublicHttpUrl(candidate, "Entity domain")).hostname;
}

export function normalizeOfficialWebsiteUrl(value: string): string {
  const normalized = new URL(
    normalizePublicHttpUrl(value, "Official website URL"),
  );
  normalized.protocol = "https:";
  normalized.pathname = "/";
  normalized.search = "";
  normalized.hash = "";
  return normalized.toString().replace(/\/$/, "");
}

export function normalizeLinkedInOrganizationUrl(value: string): string {
  const normalized = new URL(
    normalizePublicHttpUrl(value, "LinkedIn organization URL"),
  );
  const match = normalized.pathname.match(
    /^\/(company|school|showcase)\/([^/]+)\/?$/i,
  );
  if (normalized.hostname !== "linkedin.com" || !match) {
    throw new Error(
      "LinkedIn organization URL must identify a public organization.",
    );
  }
  normalized.protocol = "https:";
  normalized.pathname = `/${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
  normalized.search = "";
  return normalized.toString().replace(/\/$/, "");
}

export function canonicalizeEvidenceUrl(value: string): string {
  return forceHttps(normalizePublicHttpUrl(value, "Evidence URL"));
}

function normalizePublicIdentifier(
  identifier: StablePublicIdentifier,
): string {
  const namespace = normalizeWords(identifier.namespace).replace(/\s+/g, "_");
  const value = normalizeWords(identifier.value);
  if (!namespace || !value) {
    throw new Error("Stable public identifiers require namespace and value.");
  }
  return `public:${namespace}:${value}`;
}

export function createEntityIdentity(input: EntityIdentityInput): EntityIdentity {
  const officialWebsiteUrl = input.websiteUrl
    ? normalizeOfficialWebsiteUrl(input.websiteUrl)
    : null;
  const canonicalDomain = officialWebsiteUrl
    ? normalizeEntityDomain(officialWebsiteUrl)
    : null;
  const linkedinOrganizationUrl = input.linkedinOrganizationUrl
    ? normalizeLinkedInOrganizationUrl(input.linkedinOrganizationUrl)
    : null;
  const normalizedName = normalizeEntityName(input.name);
  const normalizedCountry = normalizeCountry(input.headquartersCountry);
  if (!normalizedName || !normalizedCountry) {
    throw new Error("Entity identity requires a name and headquarters country.");
  }
  const stableIdentifiers = [
    ...(canonicalDomain ? [`domain:${canonicalDomain}`] : []),
    ...(linkedinOrganizationUrl
      ? [`linkedin:${linkedinOrganizationUrl}`]
      : []),
    ...input.stablePublicIdentifiers.map(normalizePublicIdentifier),
  ].filter((value, index, values) => values.indexOf(value) === index);
  stableIdentifiers.sort();

  return Object.freeze({
    normalizedName,
    normalizedCountry,
    canonicalDomain,
    officialWebsiteUrl,
    linkedinOrganizationUrl,
    stableIdentifiers: Object.freeze(stableIdentifiers),
    collisionCandidateKey: `name-country:${normalizedName}:${normalizedCountry}`,
  });
}

export function compareEntityIdentities(
  left: EntityIdentity,
  right: EntityIdentity,
): EntityIdentityComparison {
  const rightIdentifiers = new Set(right.stableIdentifiers);
  if (left.stableIdentifiers.some((identifier) => rightIdentifiers.has(identifier))) {
    return "same_entity";
  }
  return left.collisionCandidateKey === right.collisionCandidateKey
    ? "collision_candidate"
    : "distinct";
}

export function createQueryFingerprint(
  input: QueryFingerprintInput,
): string {
  return createGlobalRadarFingerprint({
    version: "global-radar-query-fingerprint-v1",
    query: normalizeWords(input.query),
    language: normalizeWords(input.language),
    sourceCountry: normalizeCountry(input.sourceCountry),
    theme: normalizeWords(input.theme),
    signalIntent: normalizeWords(input.signalIntent),
    sourceAdapter: normalizeWords(input.sourceAdapter),
  });
}

export function createEvidenceFingerprint(
  input: EvidenceFingerprintInput,
): string {
  return createGlobalRadarFingerprint({
    version: "global-radar-evidence-fingerprint-v1",
    canonicalSourceUrl: canonicalizeEvidenceUrl(
      input.canonicalSourceUrl ?? input.sourceUrl,
    ),
    claim: normalizeWords(input.claim),
  });
}

export function createRequirementFingerprint(
  input: RequirementFingerprintInput,
): string {
  return createGlobalRadarFingerprint({
    version: "global-radar-requirement-fingerprint-v1",
    kind: normalizeWords(input.kind),
    summary: normalizeWords(input.summary),
  });
}
