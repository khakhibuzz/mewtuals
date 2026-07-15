import { z } from "zod";

import { identitySchema, type ParticipantIdentity } from "./identity";

const privateHostnameSuffixes = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
];

const isPrivateIpv4 = (hostname: string) => {
  const octets = hostname.split(".").map(Number);

  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const expandIpv6 = (address: string) => {
  const halves = address.split("::");

  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missingGroupCount = 8 - left.length - right.length;

  if (
    (halves.length === 1 && missingGroupCount !== 0) ||
    (halves.length === 2 && missingGroupCount < 1)
  ) {
    return null;
  }

  return [
    ...left,
    ...Array.from({ length: missingGroupCount }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group || "0", 16));
};

const embeddedIpv4 = (address: string) => {
  const groups = expandIpv6(address);

  if (!groups || groups.length !== 8) {
    return null;
  }

  const isMapped =
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff;
  const isCompatible = groups.slice(0, 6).every((group) => group === 0);

  if (!isMapped && !isCompatible) {
    return null;
  }

  const high = groups[6];
  const low = groups[7];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
};

const isPrivateIpv6 = (hostname: string) => {
  const address = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (!address.includes(":")) {
    return false;
  }

  if (address === "::" || address === "::1") {
    return true;
  }

  if (address.startsWith("fc") || address.startsWith("fd")) {
    return true;
  }

  if (/^fe[89ab]/.test(address)) {
    return true;
  }

  const ipv4 = embeddedIpv4(address);
  return ipv4 ? isPrivateIpv4(ipv4) : false;
};

const assertPublicHostname = (hostname: string) => {
  const isIpv6 = hostname.startsWith("[");
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  const isPrivateName =
    normalized === "localhost" ||
    (!normalized.includes(".") && !normalized.includes(":")) ||
    privateHostnameSuffixes.some((suffix) => normalized.endsWith(suffix));

  if (
    isPrivateName ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  ) {
    throw new Error("Source URL must use a public host");
  }

  return isIpv6 ? `[${normalized}]` : normalized;
};

export const normalizePublicUrl = (input: string) => {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Source URL must be a valid absolute URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Source URL must use HTTP or HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Source URL must not contain credentials");
  }

  url.hostname = assertPublicHostname(url.hostname);
  url.hash = "";

  return url.toString();
};

export const publicUrlSchema = z.string().trim().min(1).transform((value, ctx) => {
  try {
    return normalizePublicUrl(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid source URL",
    });
    return z.NEVER;
  }
});

const optionalPublicUrlSchema = z
  .union([publicUrlSchema, z.literal("")])
  .optional()
  .transform((value) => value || undefined);

const businessEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => {
    const separator = email.lastIndexOf("@");
    return `${email.slice(0, separator)}@${email.slice(separator + 1).toLowerCase()}`;
  });

export const organisationSourceSchema = z.object({
  kind: z.literal("organisation"),
  websiteUrl: publicUrlSchema,
  linkedInUrl: optionalPublicUrlSchema,
});

export const creatorSourceSchema = z.object({
  kind: z.literal("creator"),
  primaryUrl: publicUrlSchema,
  businessEmail: z
    .union([businessEmailSchema, z.literal("")])
    .optional()
    .transform((value) => value || undefined),
});

export const profileSourceSchema = z.discriminatedUnion("kind", [
  organisationSourceSchema,
  creatorSourceSchema,
]);

export type ProfileSource = z.infer<typeof profileSourceSchema>;

export type ProfileDraft = {
  name: string;
  organisationName: string | null;
  identityKind: ParticipantIdentity["kind"];
  organisationSubtype: Extract<
    ParticipantIdentity,
    { kind: "organisation" }
  >["subtype"] | null;
  creatorSubtype: Extract<
    ParticipantIdentity,
    { kind: "creator" }
  >["subtype"] | null;
  domain: string;
  primaryUrl: string;
  websiteUrl: string | null;
  linkedInUrl: string | null;
  socialUrl: string | null;
};

export type GenerateProfileDraftInput = {
  identity: ParticipantIdentity;
  source: ProfileSource;
  displayName?: string;
  organisationName?: string;
};

const canonicalDomain = (url: string) =>
  new URL(url).hostname.toLowerCase().replace(/^www\./, "");

const readableName = (evidence: string) => {
  let decoded = evidence;

  try {
    decoded = decodeURIComponent(evidence);
  } catch {
    // The URL parser has already validated the source. Keep undecodable text.
  }

  const words = decoded
    .replace(/^@/, "")
    .replace(/\.[a-z\d]{2,}$/i, "")
    .split(/[-_.\s]+/)
    .filter(Boolean);

  return words.map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
};

const nameFromDomain = (domain: string) => readableName(domain.split(".")[0]);

const nameFromProfileUrl = (url: string) => {
  const parsed = new URL(url);
  const pathEvidence = parsed.pathname.split("/").filter(Boolean).at(-1);
  const pathName = pathEvidence ? readableName(pathEvidence) : "";
  return pathName || nameFromDomain(canonicalDomain(url));
};

const suppliedName = (value?: string) => value?.trim() || undefined;

export const generateProfileDraft = (
  rawInput: GenerateProfileDraftInput,
): ProfileDraft => {
  const identity = identitySchema.parse(rawInput.identity);
  const source = profileSourceSchema.parse(rawInput.source);

  if (identity.kind !== source.kind) {
    throw new Error("Identity and profile source kinds must match");
  }

  if (identity.kind === "organisation" && source.kind === "organisation") {
    const domain = canonicalDomain(source.websiteUrl);
    const organisationName =
      suppliedName(rawInput.organisationName) || nameFromDomain(domain);

    return {
      name: suppliedName(rawInput.displayName) || organisationName,
      organisationName,
      identityKind: identity.kind,
      organisationSubtype: identity.subtype,
      creatorSubtype: null,
      domain,
      primaryUrl: source.websiteUrl,
      websiteUrl: source.websiteUrl,
      linkedInUrl: source.linkedInUrl ?? null,
      socialUrl: null,
    };
  }

  if (identity.kind === "creator" && source.kind === "creator") {
    return {
      name:
        suppliedName(rawInput.displayName) || nameFromProfileUrl(source.primaryUrl),
      organisationName: suppliedName(rawInput.organisationName) ?? null,
      identityKind: identity.kind,
      organisationSubtype: null,
      creatorSubtype: identity.subtype,
      domain: canonicalDomain(source.primaryUrl),
      primaryUrl: source.primaryUrl,
      websiteUrl: null,
      linkedInUrl: null,
      socialUrl: source.primaryUrl,
    };
  }

  throw new Error("Identity and profile source kinds must match");
};
