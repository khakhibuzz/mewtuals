import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";
import { getuid } from "node:process";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  ECOSYSTEM_IMPORT_SCHEMA_VERSION,
  ecosystemImportDocumentSchema,
  type EcosystemImportDocument,
} from "../app/domain/ecosystem-intelligence-import";
import { loadLocalEnvironment } from "./load-local-env.mjs";

export const MAX_ECOSYSTEM_IMPORT_BYTES = 1_024 * 1_024;
const READ_CHUNK_BYTES = 64 * 1_024;
const MAX_SAFE_ISSUES = 20;

type SafeCounts = {
  classifications: number;
  headquarters: number;
  signals: number;
  relationships: number;
};

type SafeIssue = { path: string; code: string };

type PrivateFileReadDependencies = {
  platform?: string;
  uid?: number;
  afterChunk?: (state: { file: string; totalBytes: number }) => void | Promise<void>;
  onAllocate?: (bytes: number) => void;
  onReadRequest?: (bytes: number) => void;
};

export class EcosystemImportCliError extends Error {
  constructor(
    readonly status: "validation_failed" | "import_failed",
    readonly issues: readonly SafeIssue[],
    readonly fileHash?: string,
  ) {
    super(status);
  }
}

const SAFE_VALIDATION_CODES = new Set([
  "candidate_has_no_facts",
  "coordinate_pair_required",
  "duplicate_candidate_identity",
  "duplicate_fact",
  "exactly_one_candidate_identity",
  "exactly_one_target_identity",
  "expiry_before_occurrence",
  "invalid_city_key",
  "invalid_state_key",
  "invalid_url",
  "unregistered_taxonomy_key",
  "url_too_long",
]);

const SAFE_IMPORT_CODES = new Set([
  "duplicate_relationship_fact",
  "duplicate_signal_fact",
  "evidence_key_conflict",
  "identity_ambiguous",
  "identity_not_found",
  "invalid_candidate_identity",
  "repeated_candidate_identity",
  "self_relationship",
  "unregistered_taxonomy_key",
]);

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

function unresolvedRelationshipCount(document: EcosystemImportDocument): number {
  return document.candidates.reduce(
    (count, candidate) =>
      count + candidate.relationships.filter(
        ({ targetPublicName }) => targetPublicName !== undefined,
      ).length,
    0,
  );
}

function issueCode(issue: z.core.$ZodIssue): string {
  if (
    typeof issue.message === "string" &&
    SAFE_VALIDATION_CODES.has(issue.message)
  ) {
    return issue.message;
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

function fileIssue(code: string): EcosystemImportCliError {
  return new EcosystemImportCliError("validation_failed", [
    { path: "file", code },
  ]);
}

function validatePrivateFileMetadata(
  metadata: BigIntStats,
  expectedUid: bigint,
): void {
  if (!metadata.isFile()) throw fileIssue("file_not_regular");
  if (metadata.uid !== expectedUid) throw fileIssue("file_not_owned");
  if ((metadata.mode & BigInt(0o077)) !== BigInt(0)) {
    throw fileIssue("unsafe_file_mode");
  }
}

function sameFinalMetadata(opened: BigIntStats, final: BigIntStats): boolean {
  return (
    final.dev === opened.dev &&
    final.ino === opened.ino &&
    final.size === opened.size &&
    final.uid === opened.uid &&
    final.mode === opened.mode &&
    final.mtimeNs === opened.mtimeNs &&
    final.ctimeNs === opened.ctimeNs
  );
}

async function readBoundedFile(
  handle: FileHandle,
  file: string,
  dependencies: PrivateFileReadDependencies,
): Promise<{ contents: Buffer; finalMetadata: BigIntStats }> {
  const buffer = Buffer.allocUnsafe(MAX_ECOSYSTEM_IMPORT_BYTES + 1);
  dependencies.onAllocate?.(buffer.byteLength);
  let totalBytes = 0;
  let requestedTotal = 0;

  while (requestedTotal < buffer.byteLength) {
    const requestedBytes = Math.min(
      READ_CHUNK_BYTES,
      buffer.byteLength - requestedTotal,
    );
    requestedTotal += requestedBytes;
    dependencies.onReadRequest?.(requestedBytes);
    const { bytesRead } = await handle.read(
      buffer,
      totalBytes,
      requestedBytes,
      totalBytes,
    );
    if (bytesRead === 0) break;
    totalBytes += bytesRead;
    await dependencies.afterChunk?.({ file, totalBytes });
  }

  const finalMetadata = await handle.stat({ bigint: true });
  return { contents: buffer.subarray(0, totalBytes), finalMetadata };
}

export async function readPrivateEcosystemDocument(
  fileArgument: string,
  dependencies: PrivateFileReadDependencies = {},
): Promise<{ fileHash: string; document: EcosystemImportDocument }> {
  const platform = dependencies.platform ?? process.platform;
  const uid = dependencies.uid ?? (typeof getuid === "function" ? getuid() : undefined);
  if (platform === "win32" || uid === undefined) {
    throw fileIssue("unsupported_platform");
  }

  const file = resolve(fileArgument);
  let initialMetadata: BigIntStats;
  try {
    initialMetadata = await lstat(file, { bigint: true });
  } catch {
    throw fileIssue("file_unreadable");
  }
  if (initialMetadata.isSymbolicLink()) throw fileIssue("file_not_regular");
  validatePrivateFileMetadata(initialMetadata, BigInt(uid));
  if (initialMetadata.size > BigInt(MAX_ECOSYSTEM_IMPORT_BYTES)) {
    throw fileIssue("file_too_large");
  }

  let handle: FileHandle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw fileIssue("file_unreadable");
  }

  let contents: Buffer;
  try {
    const openedMetadata = await handle.stat({ bigint: true });
    validatePrivateFileMetadata(openedMetadata, BigInt(uid));
    if (!sameFinalMetadata(initialMetadata, openedMetadata)) {
      throw fileIssue("file_changed");
    }
    if (openedMetadata.size > BigInt(MAX_ECOSYSTEM_IMPORT_BYTES)) {
      throw fileIssue("file_too_large");
    }

    const result = await readBoundedFile(handle, file, dependencies);
    validatePrivateFileMetadata(result.finalMetadata, BigInt(uid));
    if (
      result.contents.byteLength > MAX_ECOSYSTEM_IMPORT_BYTES ||
      result.finalMetadata.size > BigInt(MAX_ECOSYSTEM_IMPORT_BYTES)
    ) {
      throw fileIssue("file_too_large");
    }
    if (!sameFinalMetadata(openedMetadata, result.finalMetadata)) {
      throw fileIssue("file_changed");
    }
    if (BigInt(result.contents.byteLength) !== result.finalMetadata.size) {
      throw fileIssue("file_changed");
    }
    contents = result.contents;
  } finally {
    await handle.close();
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

export function safeImportErrorCode(error: unknown): string {
  let current: unknown = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") {
      if (SAFE_IMPORT_CODES.has(candidate.code)) return candidate.code;
      if (/^[A-Z0-9]{5}$/.test(candidate.code)) return candidate.code;
    }
    current = candidate.cause;
  }
  return "import_failed";
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
  const { fileHash, document } = await readPrivateEcosystemDocument(file);
  const counts = factCounts(document);
  if (command === "validate") {
    return {
      schemaVersion: document.schemaVersion,
      fileHash,
      candidateCount: document.candidates.length,
      factCounts: counts,
      duplicateCounts: zeroDuplicates,
      unresolvedCount: unresolvedRelationshipCount(document),
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
    throw new EcosystemImportCliError(
      "import_failed",
      [{ path: "$", code: safeImportErrorCode(error) }],
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
