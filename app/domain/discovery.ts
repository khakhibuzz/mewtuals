import { z } from "zod";

export const candidateTypes = ["company", "creator"] as const;
export const candidateStatuses = [
  "discovered",
  "shortlisted",
  "rejected",
  "queued_for_profile",
] as const;
export const MAX_DISCOVERY_BATCH_BYTES = 512 * 1_024;
export const candidateTypeSchema = z.enum(candidateTypes);
export const candidateStatusSchema = z.enum(candidateStatuses);

const normalizedNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, { message: "Candidate name is required." })
      .max(200, {
        message: "Candidate name must be at most 200 characters.",
      }),
  );

function boundedRequiredString(
  label: string,
  maximumLength: number,
): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, { message: `${label} is required.` })
    .max(maximumLength, {
      message: `${label} must be at most ${maximumLength} characters.`,
    });
}

const publicDiscoveryUrlSchema = z.string().transform((value, context) => {
  try {
    return normalizePublicDiscoveryUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error ? error.message : "Discovery URL is invalid.",
    });
    return z.NEVER;
  }
});

const canonicalDiscoveryUrlSchema = z.string().transform((value, context) => {
  try {
    return normalizeDiscoveryUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error ? error.message : "Discovery URL is invalid.",
    });
    return z.NEVER;
  }
});

const metadataIssueMessages = {
  invalid:
    "Candidate raw metadata must contain only JSON-compatible values.",
  keys: "Candidate raw metadata must contain at most 20 keys.",
  keyLength: "Candidate raw metadata keys must be at most 64 characters.",
  depth: "Candidate raw metadata must have JSON depth at most 3.",
} as const;

type MetadataInspectionTask =
  | { action: "visit"; value: unknown; depth: number }
  | { action: "leave"; value: object };

function inspectRawMetadata(metadata: Record<string, unknown>): string | null {
  const activeObjects = new Set<object>();
  const tasks: MetadataInspectionTask[] = [
    { action: "visit", value: metadata, depth: 1 },
  ];
  let keyCount = 0;

  try {
    while (tasks.length > 0) {
      const task = tasks.pop();
      if (!task) break;

      if (task.action === "leave") {
        activeObjects.delete(task.value);
        continue;
      }

      const { value, depth } = task;
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
      ) {
        continue;
      }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return metadataIssueMessages.invalid;
        continue;
      }
      if (typeof value !== "object" || activeObjects.has(value)) {
        return metadataIssueMessages.invalid;
      }
      if (depth > 3) return metadataIssueMessages.depth;

      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (!array && prototype !== Object.prototype && prototype !== null) {
        return metadataIssueMessages.invalid;
      }

      activeObjects.add(value);
      tasks.push({ action: "leave", value });

      if (array) {
        if (Object.hasOwn(value, "toJSON")) return metadataIssueMessages.invalid;
        for (let index = value.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, index);
          if (!descriptor) continue;
          if (!("value" in descriptor)) return metadataIssueMessages.invalid;
          tasks.push({
            action: "visit",
            value: descriptor.value,
            depth: depth + 1,
          });
        }
        continue;
      }

      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.hasOwn(descriptors, "toJSON")) {
        return metadataIssueMessages.invalid;
      }
      const entries = Object.entries(descriptors).filter(
        ([, descriptor]) => descriptor.enumerable,
      );
      keyCount += entries.length;
      if (keyCount > 20) return metadataIssueMessages.keys;

      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, descriptor] = entries[index];
        if (key.length > 64) return metadataIssueMessages.keyLength;
        if (!("value" in descriptor)) return metadataIssueMessages.invalid;
        tasks.push({
          action: "visit",
          value: descriptor.value,
          depth: depth + 1,
        });
      }
    }
  } catch {
    return metadataIssueMessages.invalid;
  }

  return null;
}

function serializedByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export const rawMetadataSchema = z
  .record(z.string(), z.unknown())
  .superRefine((metadata, context) => {
    const inspectionIssue = inspectRawMetadata(metadata);
    if (inspectionIssue) {
      context.addIssue({
        code: "custom",
        message: inspectionIssue,
      });
      return;
    }
    if (serializedByteLength(metadata) > 8_192) {
      context.addIssue({
        code: "custom",
        message: "Candidate raw metadata must be at most 8192 bytes.",
      });
    }
  });

export const discoveryCandidateInputSchema = z.object({
  type: candidateTypeSchema,
  name: normalizedNameSchema,
  canonicalUrl: canonicalDiscoveryUrlSchema,
  websiteUrl: publicDiscoveryUrlSchema.nullish(),
  primarySocialUrl: publicDiscoveryUrlSchema.nullish(),
  linkedinUrl: publicDiscoveryUrlSchema.nullish(),
  discoveredDescription: boundedRequiredString(
    "Discovered description",
    1_000,
  ),
  category: boundedRequiredString("Candidate category", 100),
  subcategory: z
    .string()
    .trim()
    .max(100, {
      message: "Candidate subcategory must be at most 100 characters.",
    })
    .nullish(),
  geography: boundedRequiredString("Candidate geography", 100),
  sourceName: boundedRequiredString("Candidate source name", 100),
  sourceUrl: publicDiscoveryUrlSchema,
  discoveryScore: z.number().refine(
    (score) => Number.isInteger(score) && score >= 0 && score <= 100,
    { message: "Discovery score must be an integer from 0 to 100." },
  ),
  rawMetadata: rawMetadataSchema.default({}),
});

export const discoverySourceErrorSchema = z.object({
  sourceName: boundedRequiredString("Discovery source name", 100),
  message: boundedRequiredString("Discovery source error", 1_000),
});

const discoveryBatchObjectSchema = z.object({
  runId: z.string().uuid({ message: "Discovery run id must be a valid UUID." }),
  leaseToken: boundedRequiredString("Discovery lease token", 512),
  promptVersion: z.literal("codex-web-v1", {
    error: "Discovery prompt version must be codex-web-v1.",
  }),
  candidates: z.array(discoveryCandidateInputSchema).max(50, {
    message: "Discovery batch must contain at most 50 candidates.",
  }),
  sourceErrors: z.array(discoverySourceErrorSchema).max(20, {
    message: "Discovery batch must contain at most 20 source errors.",
  }),
});

export const discoveryBatchSchema = discoveryBatchObjectSchema.superRefine(
  (batch, context) => {
    if (serializedByteLength(batch) > MAX_DISCOVERY_BATCH_BYTES) {
      context.addIssue({
        code: "custom",
        message: "Discovery batch must be at most 524288 bytes.",
      });
    }
  },
);

export type DiscoveryCandidateInput = z.input<
  typeof discoveryCandidateInputSchema
>;

export type DiscoveryCandidate = z.infer<typeof discoveryCandidateInputSchema>;
export type DiscoveryBatch = z.infer<typeof discoveryBatchSchema>;

export type CandidateIdentifier = {
  kind: "canonical" | "website_host" | "social_url" | "linkedin_url";
  value: string;
};

const trackingParameterNames = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

function parseIpv4(hostname: string): number[] | null {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return null;
  }
  return octets;
}

function isNonGlobalIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) return false;

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function expandIpv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;

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
}

function embeddedIpv4(address: string): string | null {
  const groups = expandIpv6(address);
  if (!groups || groups.length !== 8) return null;

  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const compatible = groups.slice(0, 6).every((group) => group === 0);
  if (!mapped && !compatible) return null;

  return [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ].join(".");
}

function isNonGlobalIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipv4 = embeddedIpv4(address);
  const groups = expandIpv6(address);
  const discardOnly =
    groups?.[0] === 0x100 && groups.slice(1, 4).every((group) => group === 0);
  const benchmarking =
    groups?.[0] === 0x2001 &&
    groups[1] === 0x2 &&
    groups[2] === 0;
  const orchid =
    groups?.[0] === 0x2001 &&
    ((groups[1] & 0xfff0) === 0x10 || (groups[1] & 0xfff0) === 0x20);
  return (
    address === "::" ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    /^fe[89ab]/.test(address) ||
    /^fe[c-f]/.test(address) ||
    address.startsWith("ff") ||
    address.startsWith("2001:db8:") ||
    discardOnly ||
    benchmarking ||
    orchid ||
    (ipv4 !== null && isNonGlobalIpv4(ipv4))
  );
}

function assertPublicHostname(hostname: string): void {
  // This is a literal-address guard only. Fetch boundaries must resolve DNS and
  // revalidate resolved addresses and every redirect target before connecting.
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  const privateName =
    normalized === "localhost" ||
    (!normalized.includes(".") && !normalized.includes(":")) ||
    [".home", ".internal", ".lan", ".local", ".localhost"].some((suffix) =>
      normalized.endsWith(suffix),
    );

  if (
    privateName ||
    isNonGlobalIpv4(normalized) ||
    isNonGlobalIpv6(normalized)
  ) {
    throw new Error("Discovery URL must use a public host.");
  }
}

function isSearchResultUrl(url: URL): boolean {
  const firstPathSegment = url.pathname
    .split("/")
    .filter(Boolean)[0]
    ?.toLowerCase();
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return (
    ["search", "results"].includes(firstPathSegment ?? "") ||
    host.startsWith("search.") ||
    (["google.com", "bing.com", "duckduckgo.com"].includes(host) &&
      url.searchParams.has("q"))
  );
}

function isArticleOnlyUrl(url: URL): boolean {
  const segments = url.pathname.toLowerCase().split("/").filter(Boolean);
  const articleSegments = new Set([
    "article",
    "articles",
    "blog",
    "news",
    "post",
    "posts",
    "story",
  ]);
  const datedArticlePath = /^\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(url.pathname);
  const mediumArticlePath =
    url.hostname === "medium.com" &&
    segments.length > 1 &&
    segments[0]?.startsWith("@");
  return (
    datedArticlePath ||
    mediumArticlePath ||
    segments.some((segment) => articleSegments.has(segment))
  );
}

export function normalizeDiscoveryUrl(value: string): string {
  const normalized = normalizePublicDiscoveryUrl(value);
  const url = new URL(normalized);
  if (isSearchResultUrl(url) || isArticleOnlyUrl(url)) {
    throw new Error("Canonical URL must identify a stable public profile.");
  }
  return normalized;
}

function normalizePublicDiscoveryUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Discovery URL must be a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Discovery URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Discovery URL must not contain credentials.");
  }
  assertPublicHostname(url.hostname);
  url.hostname = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.+$/, "");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      trackingParameterNames.has(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  const retainedParameters = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
  url.search = new URLSearchParams(retainedParameters).toString();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function appendIdentifier(
  identifiers: CandidateIdentifier[],
  identifier: CandidateIdentifier | null,
): void {
  if (
    identifier &&
    !identifiers.some(({ value }) => value === identifier.value)
  ) {
    identifiers.push(identifier);
  }
}

const socialHosts = new Set([
  "facebook.com",
  "instagram.com",
  "open.spotify.com",
  "substack.com",
  "tiktok.com",
  "threads.net",
  "twitter.com",
  "x.com",
  "youtu.be",
  "youtube.com",
]);

function canonicalIdentifier(
  canonicalUrl: string,
  websiteUrl: string | null | undefined,
): CandidateIdentifier {
  const value = normalizeDiscoveryUrl(canonicalUrl);
  const url = new URL(value);
  const host = url.hostname;
  const websiteHost = websiteUrl
    ? new URL(normalizePublicDiscoveryUrl(websiteUrl)).hostname
    : null;

  if (host === "linkedin.com") return { kind: "linkedin_url", value };
  if (socialHosts.has(host)) return { kind: "social_url", value };
  if (host === websiteHost) return { kind: "website_host", value: host };
  if (url.pathname !== "/") return { kind: "canonical", value };
  return { kind: "website_host", value: host };
}

export function candidateIdentifiers(
  input: DiscoveryCandidateInput,
): CandidateIdentifier[] {
  const proposed: CandidateIdentifier[] = [
    ...(input.websiteUrl
      ? [
          {
            kind: "website_host" as const,
            value: new URL(normalizePublicDiscoveryUrl(input.websiteUrl))
              .hostname,
          },
        ]
      : []),
    ...(input.linkedinUrl
      ? [
          {
            kind: "linkedin_url" as const,
            value: normalizePublicDiscoveryUrl(input.linkedinUrl),
          },
        ]
      : []),
    ...(input.primarySocialUrl
      ? [
          {
            kind: "social_url" as const,
            value: normalizePublicDiscoveryUrl(input.primarySocialUrl),
          },
        ]
      : []),
    canonicalIdentifier(input.canonicalUrl, input.websiteUrl),
  ];
  const priority =
    input.type === "company"
      ? ["website_host", "linkedin_url", "social_url", "canonical"]
      : ["social_url", "canonical", "linkedin_url", "website_host"];
  proposed.sort(
    (left, right) => priority.indexOf(left.kind) - priority.indexOf(right.kind),
  );

  const identifiers: CandidateIdentifier[] = [];
  for (const identifier of proposed) appendIdentifier(identifiers, identifier);

  return identifiers;
}

export function allocateCandidates(
  total: number,
  companyPercentage: number,
): { companies: number; creators: number } {
  const companies = Math.min(
    total,
    Math.max(0, Math.round((total * companyPercentage) / 100)),
  );
  return { companies, creators: total - companies };
}
