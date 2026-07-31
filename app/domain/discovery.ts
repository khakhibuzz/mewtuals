import { z } from "zod";

import { normalizePublicHttpUrl } from "./public-url";

export const candidateTypes = ["company", "creator"] as const;
export const candidateStatuses = [
  "discovered",
  "shortlisted",
  "rejected",
  "queued_for_profile",
] as const;
export const DISCOVERY_V1_PROMPT_VERSION = "codex-web-v1" as const;
export const DISCOVERY_V2_PROMPT_VERSION = "codex-web-v2" as const;
export const PHYSICAL_AI_ANALYSIS_VERSION = "physical-ai-v1" as const;
export const MAX_DISCOVERY_BATCH_BYTES = 1_024 * 1_024;
const MAX_RAW_METADATA_BYTES = 8_192;
const MAX_MINIMAL_ARRAY_ELEMENTS = Math.floor(
  (MAX_RAW_METADATA_BYTES - 1) / 2,
);
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
  bytes: "Candidate raw metadata must be at most 8192 bytes.",
} as const;

type MetadataInspectionTask =
  | { action: "visit"; value: unknown; depth: number }
  | { action: "leave"; value: object }
  | {
      action: "array-element";
      value: unknown[];
      index: number;
      length: number;
      depth: number;
    };

function inspectRawMetadata(metadata: Record<string, unknown>): string | null {
  const activeObjects = new Set<object>();
  const tasks: MetadataInspectionTask[] = [
    { action: "visit", value: metadata, depth: 1 },
  ];
  let keyCount = 0;
  let workUnits = 0;

  try {
    while (tasks.length > 0) {
      const task = tasks.pop();
      if (!task) break;

      if (task.action === "leave") {
        activeObjects.delete(task.value);
        continue;
      }

      workUnits += 1;
      if (workUnits > MAX_RAW_METADATA_BYTES) {
        return metadataIssueMessages.bytes;
      }

      if (task.action === "array-element") {
        if (task.index + 1 < task.length) {
          tasks.push({
            ...task,
            index: task.index + 1,
          });
        }
        const descriptor = Object.getOwnPropertyDescriptor(
          task.value,
          task.index,
        );
        if (!descriptor) continue;
        if (!("value" in descriptor)) return metadataIssueMessages.invalid;
        tasks.push({
          action: "visit",
          value: descriptor.value,
          depth: task.depth,
        });
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
        const length = value.length;
        if (length > MAX_MINIMAL_ARRAY_ELEMENTS) {
          return metadataIssueMessages.bytes;
        }
        if (length > 0) {
          tasks.push({
            action: "array-element",
            value,
            index: 0,
            length,
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
    if (serializedByteLength(metadata) > MAX_RAW_METADATA_BYTES) {
      context.addIssue({
        code: "custom",
        message: metadataIssueMessages.bytes,
      });
    }
  });

export const discoveryCandidateInputSchema = z.strictObject({
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

export const discoverySourceErrorSchema = z.strictObject({
  sourceName: boundedRequiredString("Discovery source name", 100),
  message: boundedRequiredString("Discovery source error", 1_000),
});

export const candidateResearchSchema = z.strictObject({
  summary: z.string().trim().min(80).max(1_200),
  findings: z.string().trim().min(600).max(12_000),
  sourceUrls: z
    .array(z.string().trim().max(2_048).pipe(publicDiscoveryUrlSchema))
    .min(1)
    .max(12)
    .refine((urls) => new Set(urls).size === urls.length, {
      message: "Research source URLs must be unique.",
    }),
  analysisVersion: z.literal(PHYSICAL_AI_ANALYSIS_VERSION),
});

export const physicalAiDiscoveryCandidateInputSchema =
  discoveryCandidateInputSchema.extend({ research: candidateResearchSchema });

const discoveryBatchFields = {
  runId: z.string().uuid({ message: "Discovery run id must be a valid UUID." }),
  leaseToken: boundedRequiredString("Discovery lease token", 512),
  sourceErrors: z.array(discoverySourceErrorSchema).max(20, {
    message: "Discovery batch must contain at most 20 source errors.",
  }),
} as const;

export const discoveryV1BatchSchema = z.strictObject({
  ...discoveryBatchFields,
  promptVersion: z.literal(DISCOVERY_V1_PROMPT_VERSION),
  candidates: z.array(discoveryCandidateInputSchema).max(50, {
    message: "Discovery batch must contain at most 50 candidates.",
  }),
});

export const discoveryV2BatchSchema = z.strictObject({
  ...discoveryBatchFields,
  promptVersion: z.literal(DISCOVERY_V2_PROMPT_VERSION),
  candidates: z.array(physicalAiDiscoveryCandidateInputSchema).max(50, {
    message: "Discovery batch must contain at most 50 candidates.",
  }),
});

export const discoveryBatchSchema = z
  .discriminatedUnion("promptVersion", [
    discoveryV1BatchSchema,
    discoveryV2BatchSchema,
  ])
  .superRefine((batch, context) => {
    if (serializedByteLength(batch) > MAX_DISCOVERY_BATCH_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Discovery batch must be at most ${MAX_DISCOVERY_BATCH_BYTES} bytes.`,
      });
    }

    if (batch.promptVersion === DISCOVERY_V2_PROMPT_VERSION) {
      const firstCandidateIndexByIdentifier = new Map<string, number>();
      batch.candidates.forEach((candidate, candidateIndex) => {
        let duplicateCandidateIndex: number | undefined;
        for (const identifier of candidateIdentifiers(candidate)) {
          const identifierKey = `${candidate.type}:${identifier.kind}:${identifier.value}`;
          const firstCandidateIndex =
            firstCandidateIndexByIdentifier.get(identifierKey);
          if (firstCandidateIndex !== undefined) {
            duplicateCandidateIndex = Math.min(
              duplicateCandidateIndex ?? firstCandidateIndex,
              firstCandidateIndex,
            );
            continue;
          }
          firstCandidateIndexByIdentifier.set(identifierKey, candidateIndex);
        }

        if (duplicateCandidateIndex !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["candidates", candidateIndex],
            message: "Candidate duplicates another candidate in this batch.",
            params: {
              duplicateCandidateIndexes: [
                duplicateCandidateIndex,
                candidateIndex,
              ],
            },
          });
        }
      });
    }
  });

export type DiscoveryCandidateInput = z.input<
  typeof discoveryCandidateInputSchema
>;

export type DiscoveryCandidate = z.infer<typeof discoveryCandidateInputSchema>;
export type DiscoveryBatch = z.infer<typeof discoveryBatchSchema>;
export type DiscoveryBatchCandidate = DiscoveryBatch["candidates"][number];

export type CandidateIdentifier = {
  kind: "canonical" | "website_host" | "social_url" | "linkedin_url";
  value: string;
};

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

export function normalizePublicDiscoveryUrl(value: string): string {
  return normalizePublicHttpUrl(value, "Discovery URL");
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

export function candidateIdentifierForProfileUrl(
  profileUrl: string,
): CandidateIdentifier {
  return canonicalIdentifier(profileUrl, undefined);
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
