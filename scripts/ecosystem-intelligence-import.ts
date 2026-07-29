import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { getuid } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  normalizeDiscoveryUrl,
  normalizePublicDiscoveryUrl,
} from "../app/domain/discovery";
import {
  ECOSYSTEM_TAXONOMY,
  ecosystemTaxonomyKinds,
  isRegisteredTaxonomyKey,
  normalizeIndiaCity,
  normalizeIndiaState,
} from "../app/domain/ecosystem-intelligence-taxonomy";
import { loadLocalEnvironment } from "./load-local-env.mjs";

export const ECOSYSTEM_IMPORT_SCHEMA_VERSION =
  "ecosystem-intelligence-import-v1" as const;
export const MAX_ECOSYSTEM_IMPORT_BYTES = 1_024 * 1_024;
const MAX_CANDIDATES = 100;
const MAX_FACTS_PER_KIND = 50;
const MAX_SOURCES_PER_FACT = 12;
const MAX_SAFE_ISSUES = 20;

const classificationKinds = ecosystemTaxonomyKinds.filter(
  (kind) => kind !== "signal_type" && kind !== "relationship_type",
) as [
  Exclude<(typeof ecosystemTaxonomyKinds)[number], "signal_type" | "relationship_type">,
  ...Exclude<(typeof ecosystemTaxonomyKinds)[number], "signal_type" | "relationship_type">[],
];
const signalTypeKeys = ECOSYSTEM_TAXONOMY.termsByKind.signal_type.map(
  ({ key }) => key,
) as [
  (typeof ECOSYSTEM_TAXONOMY.termsByKind.signal_type)[number]["key"],
  ...(typeof ECOSYSTEM_TAXONOMY.termsByKind.signal_type)[number]["key"][],
];
const relationshipTypeKeys =
  ECOSYSTEM_TAXONOMY.termsByKind.relationship_type.map(({ key }) => key) as [
    (typeof ECOSYSTEM_TAXONOMY.termsByKind.relationship_type)[number]["key"],
    ...(typeof ECOSYSTEM_TAXONOMY.termsByKind.relationship_type)[number]["key"][],
  ];

const boundedString = (maximum: number) =>
  z.string().transform((value) => value.trim().replace(/\s+/g, " ")).pipe(
    z.string().min(1).max(maximum),
  );
const confidenceSchema = z.number().int().min(0).max(100);
const evidenceStateSchema = z.enum(["evidence_backed", "inferred"]);
const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

function normalizedUrlSchema(canonical: boolean) {
  return z.string().transform((value, context) => {
    try {
      return canonical
        ? normalizeDiscoveryUrl(value)
        : normalizePublicDiscoveryUrl(value);
    } catch {
      context.addIssue({ code: "custom", message: "invalid_url" });
      return z.NEVER;
    }
  });
}

const publicUrlSchema = normalizedUrlSchema(false);
const canonicalUrlSchema = normalizedUrlSchema(true);
const sourceUrlsSchema = z
  .array(publicUrlSchema)
  .min(1)
  .max(MAX_SOURCES_PER_FACT)
  .transform((values) => [...new Set(values)]);

const classificationSchema = z
  .strictObject({
    kind: z.enum(classificationKinds),
    termKey: boundedString(100),
    evidenceState: evidenceStateSchema,
    confidence: confidenceSchema,
    basis: boundedString(1_000),
    sourceUrls: sourceUrlsSchema,
  })
  .superRefine((value, context) => {
    if (!isRegisteredTaxonomyKey(value.kind, value.termKey)) {
      context.addIssue({
        code: "custom",
        path: ["termKey"],
        message: "unregistered_taxonomy_key",
      });
    }
  });

const headquartersSchema = z
  .strictObject({
    countryCode: z.literal("IN"),
    stateKey: boundedString(100).transform((value, context) => {
      const normalized = normalizeIndiaState(value);
      if (!normalized) {
        context.addIssue({ code: "custom", message: "invalid_state_key" });
        return z.NEVER;
      }
      return normalized;
    }),
    stateLabel: boundedString(100),
    cityKey: boundedString(100).transform((value, context) => {
      const normalized = normalizeIndiaCity(value);
      if (!normalized) {
        context.addIssue({ code: "custom", message: "invalid_city_key" });
        return z.NEVER;
      }
      return normalized;
    }),
    cityLabel: boundedString(100),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    evidenceState: evidenceStateSchema,
    confidence: confidenceSchema,
    sourceUrls: sourceUrlsSchema,
  })
  .superRefine((value, context) => {
    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "coordinate_pair_required",
      });
    }
  });

const signalSchema = z
  .strictObject({
    signalType: z.enum(signalTypeKeys),
    title: boundedString(300),
    occurredAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    sourceUrl: publicUrlSchema,
    confidence: confidenceSchema,
  })
  .superRefine((value, context) => {
    if (value.expiresAt && value.expiresAt < value.occurredAt) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiry_before_occurrence",
      });
    }
  });

const relationshipSchema = z
  .strictObject({
    targetCandidateId: z.uuid().optional(),
    targetCanonicalUrl: canonicalUrlSchema.optional(),
    targetPublicName: boundedString(200).optional(),
    relationshipType: z.enum(relationshipTypeKeys),
    evidenceUrl: publicUrlSchema,
    confidence: confidenceSchema,
    observedAt: isoDateTimeSchema.optional(),
  })
  .superRefine((value, context) => {
    const routes = [
      value.targetCandidateId,
      value.targetCanonicalUrl,
      value.targetPublicName,
    ].filter((route) => route !== undefined);
    if (routes.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["targetCandidateId"],
        message: "exactly_one_target_identity",
      });
    }
  });

const candidateSchema = z
  .strictObject({
    candidateId: z.uuid().optional(),
    canonicalUrl: canonicalUrlSchema.optional(),
    classifications: z.array(classificationSchema).max(MAX_FACTS_PER_KIND).default([]),
    headquarters: headquartersSchema.optional(),
    signals: z.array(signalSchema).max(MAX_FACTS_PER_KIND).default([]),
    relationships: z.array(relationshipSchema).max(MAX_FACTS_PER_KIND).default([]),
  })
  .superRefine((value, context) => {
    if (Number(value.candidateId !== undefined) + Number(value.canonicalUrl !== undefined) !== 1) {
      context.addIssue({
        code: "custom",
        path: ["candidateId"],
        message: "exactly_one_candidate_identity",
      });
    }
    if (
      value.classifications.length === 0 &&
      !value.headquarters &&
      value.signals.length === 0 &&
      value.relationships.length === 0
    ) {
      context.addIssue({ code: "custom", message: "candidate_has_no_facts" });
    }

    addDuplicateIssues(
      value.classifications.map(({ kind, termKey }) => `${kind}\n${termKey}`),
      "classifications",
      context,
    );
    addDuplicateIssues(
      value.signals.map(({ signalType, occurredAt, sourceUrl }) =>
        `${signalType}\n${datePart(occurredAt)}\n${sourceUrl}`,
      ),
      "signals",
      context,
    );
    addDuplicateIssues(
      value.relationships.map((relationship) =>
        [
          relationship.relationshipType,
          relationship.targetCandidateId ??
            relationship.targetCanonicalUrl ??
            normalizePublicName(relationship.targetPublicName ?? ""),
          relationship.evidenceUrl,
          observedDate(relationship.observedAt),
        ].join("\n"),
      ),
      "relationships",
      context,
    );
  });

function addDuplicateIssues(
  keys: readonly string[],
  field: "classifications" | "signals" | "relationships",
  context: z.RefinementCtx,
): void {
  const firstIndex = new Map<string, number>();
  keys.forEach((key, index) => {
    if (firstIndex.has(key)) {
      context.addIssue({
        code: "custom",
        path: [field, index],
        message: "duplicate_fact",
      });
    } else {
      firstIndex.set(key, index);
    }
  });
}

export const ecosystemImportDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(ECOSYSTEM_IMPORT_SCHEMA_VERSION),
    generatedAt: isoDateTimeSchema,
    candidates: z.array(candidateSchema).min(1).max(MAX_CANDIDATES),
  })
  .superRefine((value, context) => {
    const firstIdentityIndex = new Map<string, number>();
    value.candidates.forEach((candidate, index) => {
      const key = candidate.candidateId
        ? `id:${candidate.candidateId}`
        : `url:${candidate.canonicalUrl}`;
      if (firstIdentityIndex.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index],
          message: "duplicate_candidate_identity",
        });
      } else {
        firstIdentityIndex.set(key, index);
      }
    });
  });

export type EcosystemImportDocument = z.infer<typeof ecosystemImportDocumentSchema>;
export type EcosystemImportCandidate = EcosystemImportDocument["candidates"][number];

export function parseEcosystemImportDocument(input: unknown): EcosystemImportDocument {
  return ecosystemImportDocumentSchema.parse(input);
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function observedDate(value: string | undefined): string {
  return value ? datePart(value) : "";
}

function normalizePublicName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function sha256Tuple(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export function deriveSignalEvidenceKey(input: {
  candidateId: string;
  signalType: string;
  occurredAt: string;
  sourceUrl: string;
}): string {
  return sha256Tuple([
    input.candidateId,
    input.signalType,
    datePart(input.occurredAt),
    input.sourceUrl,
  ]);
}

export function deriveRelationshipEvidenceKey(input: {
  sourceCandidateId: string;
  relationshipType: string;
  targetCandidateId?: string;
  targetPublicName?: string;
  evidenceUrl: string;
  observedAt?: string;
}): string {
  const target = input.targetCandidateId ?? normalizePublicName(input.targetPublicName ?? "");
  return sha256Tuple([
    input.sourceCandidateId,
    input.relationshipType,
    target,
    input.evidenceUrl,
    observedDate(input.observedAt),
  ]);
}

type SafeCounts = {
  classifications: number;
  headquarters: number;
  signals: number;
  relationships: number;
};

function factCounts(document: EcosystemImportDocument): SafeCounts {
  return document.candidates.reduce<SafeCounts>(
    (counts, candidate) => ({
      classifications: counts.classifications + candidate.classifications.length,
      headquarters: counts.headquarters + Number(Boolean(candidate.headquarters)),
      signals: counts.signals + candidate.signals.length,
      relationships: counts.relationships + candidate.relationships.length,
    }),
    { classifications: 0, headquarters: 0, signals: 0, relationships: 0 },
  );
}

type SafeIssue = { path: string; code: string };

class EcosystemImportCliError extends Error {
  constructor(
    readonly status: "validation_failed" | "import_failed",
    readonly issues: readonly SafeIssue[],
    readonly fileHash?: string,
  ) {
    super(status);
  }
}

function issueCode(issue: z.core.$ZodIssue): string {
  if (issue.code === "custom" && typeof issue.message === "string") {
    return issue.message.slice(0, 80);
  }
  if (issue.code === "unrecognized_keys") return "unknown_key";
  if (issue.code === "too_big") return "limit_exceeded";
  if (issue.code === "too_small") return "required_or_too_small";
  if (issue.path.at(-1) === "sourceUrl" || issue.path.at(-1) === "evidenceUrl") {
    return "invalid_url";
  }
  return "invalid_value";
}

function safeZodIssues(error: z.ZodError): SafeIssue[] {
  return error.issues.slice(0, MAX_SAFE_ISSUES).map((issue) => ({
    path: issue.path.map(String).join(".").slice(0, 256),
    code: issueCode(issue),
  }));
}

async function readPrivateDocument(fileArgument: string): Promise<{
  fileHash: string;
  document: EcosystemImportDocument;
}> {
  const file = resolve(fileArgument);
  let metadata;
  try {
    metadata = await lstat(file);
  } catch {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "file_unreadable" },
    ]);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "file_not_regular" },
    ]);
  }
  if (typeof getuid === "function" && metadata.uid !== getuid()) {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "file_not_owned" },
    ]);
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "unsafe_file_mode" },
    ]);
  }
  if (metadata.size > MAX_ECOSYSTEM_IMPORT_BYTES) {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "file_too_large" },
    ]);
  }

  let handle: FileHandle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "file_unreadable" },
    ]);
  }
  let contents: Buffer;
  try {
    const openedMetadata = await handle.stat();
    if (
      !openedMetadata.isFile() ||
      openedMetadata.dev !== metadata.dev ||
      openedMetadata.ino !== metadata.ino
    ) {
      throw new EcosystemImportCliError("validation_failed", [
        { path: "file", code: "file_changed" },
      ]);
    }
    if (
      (typeof getuid === "function" && openedMetadata.uid !== getuid()) ||
      (openedMetadata.mode & 0o077) !== 0
    ) {
      throw new EcosystemImportCliError("validation_failed", [
        { path: "file", code: "unsafe_file_mode" },
      ]);
    }
    if (openedMetadata.size > MAX_ECOSYSTEM_IMPORT_BYTES) {
      throw new EcosystemImportCliError("validation_failed", [
        { path: "file", code: "file_too_large" },
      ]);
    }
    contents = await handle.readFile();
  } finally {
    await handle.close();
  }
  if (contents.byteLength > MAX_ECOSYSTEM_IMPORT_BYTES) {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "file", code: "file_too_large" },
    ]);
  }
  const fileHash = createHash("sha256").update(contents).digest("hex");
  let input: unknown;
  try {
    input = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new EcosystemImportCliError(
      "validation_failed",
      [{ path: "$", code: "invalid_json" }],
      fileHash,
    );
  }
  const parsed = ecosystemImportDocumentSchema.safeParse(input);
  if (!parsed.success) {
    throw new EcosystemImportCliError(
      "validation_failed",
      safeZodIssues(parsed.error),
      fileHash,
    );
  }
  return { fileHash, document: parsed.data };
}

function parseArguments(arguments_: readonly string[]): {
  command: "validate" | "import";
  file: string;
} {
  const [command, option, file, ...rest] = arguments_;
  if (
    (command !== "validate" && command !== "import") ||
    option !== "--file" ||
    !file?.trim() ||
    rest.length > 0
  ) {
    throw new EcosystemImportCliError("validation_failed", [
      { path: "arguments", code: "invalid_arguments" },
    ]);
  }
  return { command, file };
}

const zeroDuplicates: SafeCounts = {
  classifications: 0,
  headquarters: 0,
  signals: 0,
  relationships: 0,
};

async function runCommand(arguments_: readonly string[]) {
  const { command, file } = parseArguments(arguments_);
  const { fileHash, document } = await readPrivateDocument(file);
  const counts = factCounts(document);
  if (command === "validate") {
    return {
      schemaVersion: document.schemaVersion,
      fileHash,
      candidateCount: document.candidates.length,
      factCounts: counts,
      duplicateCounts: zeroDuplicates,
      unresolvedCount: 0,
      status: "validated" as const,
    };
  }

  try {
    loadLocalEnvironment();
    const repositoryModulePath =
      "../db/repositories/ecosystem-intelligence-import-repository";
    const [{ closeDb, getDb }, repositoryModule] = await Promise.all([
      import("../db/client"),
      import(repositoryModulePath),
    ]);
    const { createEcosystemIntelligenceImportRepository } = repositoryModule as {
      createEcosystemIntelligenceImportRepository(database: ReturnType<typeof getDb>): {
        importDocument(document: EcosystemImportDocument, now: Date): Promise<{
          candidatesResolved: number;
          duplicateCounts: SafeCounts;
          unresolvedCount: number;
        }>;
      };
    };
    const repository = createEcosystemIntelligenceImportRepository(getDb());
    try {
      const result = await repository.importDocument(document, new Date());
      return {
        schemaVersion: document.schemaVersion,
        fileHash,
        candidateCount: result.candidatesResolved,
        factCounts: counts,
        duplicateCounts: result.duplicateCounts,
        unresolvedCount: result.unresolvedCount,
        status: "imported" as const,
      };
    } finally {
      await closeDb();
    }
  } catch (error) {
    if (error instanceof EcosystemImportCliError) throw error;
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code.slice(0, 80)
        : "import_failed";
    throw new EcosystemImportCliError(
      "import_failed",
      [{ path: "$", code }],
      fileHash,
    );
  }
}

async function main(): Promise<void> {
  try {
    const result = await runCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const safeError =
      error instanceof EcosystemImportCliError
        ? error
        : new EcosystemImportCliError("validation_failed", [
            { path: "$", code: "unexpected_failure" },
          ]);
    process.stderr.write(`${JSON.stringify({
      schemaVersion: ECOSYSTEM_IMPORT_SCHEMA_VERSION,
      ...(safeError.fileHash ? { fileHash: safeError.fileHash } : {}),
      status: safeError.status,
      issues: safeError.issues,
    })}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main();
}
