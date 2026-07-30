import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  GLOBAL_RADAR_PLAN_VERSION,
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_QUERY_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  GLOBAL_RADAR_TAXONOMY_VERSION,
  MAX_GLOBAL_RADAR_BATCH_BYTES,
  generateGlobalRadarQueries,
  globalRadarBatchProposalSchema,
  globalRadarThemes,
  isoTimestampSchema,
  parseGlobalRadarPlanSnapshot,
  type RadarPlan,
  type SearchQuery,
} from "../app/domain/global-radar";
import {
  globalRadarRequestTimeoutMs,
  type GlobalRadarWorkerNetworkCommand,
} from "./global-radar-worker-timeout";
import { loadLocalEnvironment } from "./load-local-env.mjs";

export const MAX_GLOBAL_RADAR_WORKER_FILE_BYTES =
  MAX_GLOBAL_RADAR_BATCH_BYTES;

const MAX_API_ERROR_BYTES = 16 * 1_024;
const MAX_API_SUCCESS_BYTES = MAX_GLOBAL_RADAR_WORKER_FILE_BYTES;
const MAX_SAFE_MESSAGE_CHARACTERS = 1_000;

type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type GlobalRadarWorkerRuntime = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  fetch: FetchFunction;
  timeoutSignal: (milliseconds: number) => AbortSignal;
}>;

export type GlobalRadarWorkerIo = Readonly<{
  writeStdout(value: string): void;
  writeStderr(value: string): void;
}>;

type ParsedArguments = Readonly<{
  command: string | undefined;
  options: ReadonlyMap<string, string>;
}>;

type JsonDocument = Readonly<{
  bytes: Uint8Array;
  value: unknown;
}>;

type ValidatedPrivateClaim = Readonly<{
  runId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  versions: Readonly<{
    prompt: typeof GLOBAL_RADAR_PROMPT_VERSION;
    schema: typeof GLOBAL_RADAR_SCHEMA_VERSION;
    taxonomy: typeof GLOBAL_RADAR_TAXONOMY_VERSION;
    scoring: typeof GLOBAL_RADAR_SCORE_VERSION;
    plan: typeof GLOBAL_RADAR_PLAN_VERSION;
    query: typeof GLOBAL_RADAR_QUERY_VERSION;
  }>;
  plan: RadarPlan;
  queries: readonly SearchQuery[];
  config: Readonly<{
    countries: readonly string[];
    languages: readonly ("en" | "zh-CN")[];
    themes: readonly string[];
    enabledSources: readonly ["codex_public_web"];
    resultLimit: number;
    thresholds: Readonly<{
      direct_demand: number;
      demand_precursor: number;
      ecosystem_momentum: number;
    }>;
  }>;
  outputSchema: Readonly<Record<string, unknown>>;
}>;

class GlobalRadarCliError extends Error {
  constructor(
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "GlobalRadarCliError";
  }
}

const defaultRuntime: GlobalRadarWorkerRuntime = {
  environment: process.env,
  fetch: globalThis.fetch,
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
};

const defaultIo: GlobalRadarWorkerIo = {
  writeStdout: (value) => process.stdout.write(value),
  writeStderr: (value) => process.stderr.write(value),
};

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const [command, ...rest] = arguments_;
  const options = new Map<string, string>();

  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const value = rest[index + 1];
    if (
      !option?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new GlobalRadarCliError(
        "Global Radar worker command arguments are invalid.",
      );
    }
    if (options.has(option)) {
      throw new GlobalRadarCliError(
        `Global Radar worker option ${option} was provided twice.`,
      );
    }
    options.set(option, value);
  }

  return { command, options };
}

function assertAllowedOptions(
  options: ReadonlyMap<string, string>,
  allowed: readonly string[],
): void {
  const allowlist = new Set(allowed);
  const unsupported = [...options.keys()].find(
    (option) => !allowlist.has(option),
  );
  if (unsupported) {
    throw new GlobalRadarCliError(
      `Global Radar worker option ${unsupported} is not supported.`,
    );
  }
}

function requiredOption(
  options: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = options.get(name)?.trim();
  if (!value) {
    throw new GlobalRadarCliError(
      `Global Radar worker option ${name} is required.`,
    );
  }
  return value;
}

async function readJsonDocument(file: string): Promise<JsonDocument> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(file);
  } catch {
    throw new GlobalRadarCliError(
      "The Global Radar JSON file could not be read.",
    );
  }
  if (bytes.byteLength > MAX_GLOBAL_RADAR_WORKER_FILE_BYTES) {
    throw new GlobalRadarCliError(
      `The Global Radar file must be at most ${MAX_GLOBAL_RADAR_WORKER_FILE_BYTES} bytes.`,
    );
  }

  let contents: string;
  try {
    contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GlobalRadarCliError(
      "The Global Radar JSON file is not valid UTF-8.",
    );
  }

  try {
    return { bytes, value: JSON.parse(contents) };
  } catch {
    throw new GlobalRadarCliError(
      "The Global Radar JSON file is not valid JSON.",
    );
  }
}

const safeTopLevelBatchFields = new Set([
  "schemaVersion",
  "promptVersion",
  "taxonomyVersion",
  "runId",
  "planFingerprint",
  "executedQueries",
  "entities",
  "signals",
  "sourceErrors",
]);

function safeSchemaIssuePath(path: readonly PropertyKey[]): string {
  return path
    .map((segment, index) => {
      if (typeof segment === "number") return String(segment);
      return index === 0 &&
        typeof segment === "string" &&
        safeTopLevelBatchFields.has(segment)
        ? segment
        : "field";
    })
    .join(".")
    .slice(0, 300);
}

function schemaIssues(error: {
  issues: readonly {
    code?: unknown;
    path: readonly PropertyKey[];
    message: string;
  }[];
}) {
  return error.issues.slice(0, 20).map((issue) => ({
    path: safeSchemaIssuePath(issue.path),
    message:
      issue.code === "unrecognized_keys" || issue.code === "invalid_key"
        ? "Object contains unsupported fields."
        : issue.message.slice(0, 300),
  }));
}

async function validatedBatchDocument(file: string): Promise<
  JsonDocument & {
    batch: ReturnType<typeof globalRadarBatchProposalSchema.parse>;
  }
> {
  const document = await readJsonDocument(file);
  const parsed = globalRadarBatchProposalSchema.safeParse(document.value);
  if (!parsed.success) {
    throw new GlobalRadarCliError(
      "The Global Radar batch failed validation.",
      { issues: schemaIssues(parsed.error) },
    );
  }
  return { ...document, batch: parsed.data };
}

async function validate(options: ReadonlyMap<string, string>) {
  assertAllowedOptions(options, ["--file"]);
  const document = await validatedBatchDocument(
    requiredOption(options, "--file"),
  );
  const evidenceCount = document.batch.signals.reduce(
    (total, signal) => total + signal.evidence.length,
    0,
  );
  const requirementCount = document.batch.signals.reduce(
    (total, signal) => total + signal.requirements.length,
    0,
  );
  return {
    ok: true as const,
    command: "validate" as const,
    runId: document.batch.runId,
    entityCount: document.batch.entities.length,
    signalCount: document.batch.signals.length,
    evidenceCount,
    requirementCount,
    executedQueryCount: document.batch.executedQueries.length,
    sourceErrorCount: document.batch.sourceErrors.length,
  };
}

function networkEnvironment(
  runtime: GlobalRadarWorkerRuntime,
): Readonly<{ baseUrl: URL; workerSecret: string }> {
  const baseUrlValue = runtime.environment.GLOBAL_RADAR_API_BASE_URL?.trim();
  if (!baseUrlValue) {
    throw new GlobalRadarCliError(
      "GLOBAL_RADAR_API_BASE_URL is required for network commands.",
    );
  }
  const workerSecret = runtime.environment.GLOBAL_RADAR_WORKER_SECRET?.trim();
  if (!workerSecret) {
    throw new GlobalRadarCliError(
      "GLOBAL_RADAR_WORKER_SECRET is required for network commands.",
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new GlobalRadarCliError(
      "GLOBAL_RADAR_API_BASE_URL must be a credential-free HTTP(S) URL.",
    );
  }
  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new GlobalRadarCliError(
      "GLOBAL_RADAR_API_BASE_URL must be a credential-free HTTP(S) URL.",
    );
  }
  return { baseUrl, workerSecret };
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

async function postWorkerJson(
  command: GlobalRadarWorkerNetworkCommand,
  path: string,
  body: BodyInit,
  runtime: GlobalRadarWorkerRuntime,
  leaseToken?: string,
): Promise<Record<string, unknown>> {
  const { baseUrl, workerSecret } = networkEnvironment(runtime);
  let response: Response;
  try {
    response = await runtime.fetch(new URL(path, baseUrl.origin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
        ...(leaseToken
          ? { "X-Global-Radar-Lease-Token": leaseToken }
          : {}),
      },
      body,
      signal: runtime.timeoutSignal(globalRadarRequestTimeoutMs(command)),
    });
  } catch (error) {
    const errorName =
      error !== null &&
      typeof error === "object" &&
      typeof (error as { name?: unknown }).name === "string"
        ? (error as { name: string }).name
        : "";
    const reason =
      errorName === "TimeoutError"
        ? "request_timeout"
        : errorName === "AbortError"
          ? "request_aborted"
          : "network_error";
    throw new GlobalRadarCliError(
      `The Global Radar API could not be reached for ${command}.`,
      { reason },
    );
  }

  if (!response.ok) {
    const error = await readBoundedJson(response, MAX_API_ERROR_BYTES);
    const safe = safeApiFailure(error);
    throw new GlobalRadarCliError(
      `The Global Radar API rejected ${command} with HTTP ${response.status}.`,
      { httpStatus: response.status, ...safe },
    );
  }

  const value = await readBoundedJson(response, MAX_API_SUCCESS_BYTES);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GlobalRadarCliError(
      `The Global Radar API returned invalid JSON for ${command}.`,
    );
  }
  return value as Record<string, unknown>;
}

const recognizedConflictReasons = new Set([
  "active_race",
  "active_run",
  "empty_queue",
  "failure_mismatch",
  "invalid_input",
  "invalid_plan",
  "invalid_state",
  "lease_expired",
  "lease_mismatch",
  "not_found",
  "submission_mismatch",
]);

function safeApiFailure(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const response = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  if (
    typeof response.outcome === "string" &&
    ["conflict", "invalid", "not_found", "unauthorized"].includes(
      response.outcome,
    )
  ) {
    output.outcome = response.outcome;
  }
  if (
    typeof response.reason === "string" &&
    recognizedConflictReasons.has(response.reason)
  ) {
    output.reason = response.reason;
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function boundedStringArray(
  value: unknown,
  maximumItems: number,
  maximumCharacters: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximumItems &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0 &&
        item.length <= maximumCharacters,
    )
  );
}

function parseClaimConfig(value: unknown): ValidatedPrivateClaim["config"] | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "countries",
      "languages",
      "themes",
      "enabledSources",
      "resultLimit",
      "thresholds",
    ]) ||
    !boundedStringArray(value.countries, 50, 100) ||
    !Array.isArray(value.languages) ||
    value.languages.length > 2 ||
    !value.languages.every(
      (language) => language === "en" || language === "zh-CN",
    ) ||
    !boundedStringArray(value.themes, globalRadarThemes.length, 100) ||
    !value.themes.every((theme) =>
      (globalRadarThemes as readonly string[]).includes(theme),
    ) ||
    !Array.isArray(value.enabledSources) ||
    value.enabledSources.length !== 1 ||
    value.enabledSources[0] !== "codex_public_web" ||
    !Number.isInteger(value.resultLimit) ||
    Number(value.resultLimit) < 1 ||
    Number(value.resultLimit) > 20 ||
    !isPlainObject(value.thresholds) ||
    !hasExactKeys(value.thresholds, [
      "direct_demand",
      "demand_precursor",
      "ecosystem_momentum",
    ]) ||
    !Object.values(value.thresholds).every(
      (threshold) =>
        Number.isInteger(threshold) && Number(threshold) >= 0 && Number(threshold) <= 100,
    )
  ) {
    return null;
  }
  return value as unknown as ValidatedPrivateClaim["config"];
}

function parsePrivateClaim(value: unknown): ValidatedPrivateClaim | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "runId",
      "leaseToken",
      "leaseExpiresAt",
      "versions",
      "plan",
      "queries",
      "config",
      "outputSchema",
    ]) ||
    typeof value.runId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.runId,
    ) ||
    typeof value.leaseToken !== "string" ||
    value.leaseToken.length < 1 ||
    value.leaseToken.length > 512 ||
    typeof value.leaseExpiresAt !== "string" ||
    !isoTimestampSchema.safeParse(value.leaseExpiresAt).success ||
    !isPlainObject(value.versions) ||
    !hasExactKeys(value.versions, [
      "prompt",
      "schema",
      "taxonomy",
      "scoring",
      "plan",
      "query",
    ]) ||
    value.versions.prompt !== GLOBAL_RADAR_PROMPT_VERSION ||
    value.versions.schema !== GLOBAL_RADAR_SCHEMA_VERSION ||
    value.versions.taxonomy !== GLOBAL_RADAR_TAXONOMY_VERSION ||
    value.versions.scoring !== GLOBAL_RADAR_SCORE_VERSION ||
    value.versions.plan !== GLOBAL_RADAR_PLAN_VERSION ||
    value.versions.query !== GLOBAL_RADAR_QUERY_VERSION ||
    !isPlainObject(value.plan) ||
    !Array.isArray(value.queries) ||
    value.queries.length > 120 ||
    !isPlainObject(value.outputSchema)
  ) {
    return null;
  }
  const fingerprint = value.plan.fingerprint;
  if (typeof fingerprint !== "string") return null;
  const plan = parseGlobalRadarPlanSnapshot(value.plan, fingerprint);
  const config = parseClaimConfig(value.config);
  if (!plan || !config) return null;
  const expectedQueries = generateGlobalRadarQueries(plan);
  if (JSON.stringify(value.queries) !== JSON.stringify(expectedQueries)) {
    return null;
  }
  return {
    runId: value.runId,
    leaseToken: value.leaseToken,
    leaseExpiresAt: value.leaseExpiresAt,
    versions: value.versions as ValidatedPrivateClaim["versions"],
    plan,
    queries: expectedQueries,
    config,
    outputSchema: value.outputSchema,
  };
}

async function writePrivateClaimFile(
  claim: ValidatedPrivateClaim,
): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), "mewtuals-global-radar-claim-"),
  );
  await chmod(directory, 0o700);
  const file = join(directory, "claim.json");
  await writeFile(file, `${JSON.stringify(claim)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(file, 0o600);
  return file;
}

async function readPrivateClaimFile(file: string): Promise<ValidatedPrivateClaim> {
  const document = await readJsonDocument(file);
  const claim = parsePrivateClaim(document.value);
  if (!claim) {
    throw new GlobalRadarCliError(
      "The private Global Radar claim file is invalid.",
    );
  }
  return claim;
}

function validIsoTimestamp(value: unknown, nullable = false): boolean {
  return (
    (nullable && value === null) ||
    isoTimestampSchema.safeParse(value).success
  );
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

const safeRunCountKeys = [
  "resultsExamined",
  "entitiesObserved",
  "signalsFound",
  "directDemands",
  "precursors",
  "momentumRecords",
  "new",
  "updated",
  "duplicates",
  "rejectedForWeakEvidence",
  "sourceErrors",
] as const;

const safeNoticeMessages = {
  lease_expired: "The worker lease expired before completion.",
  run_failed: "The run ended without a completed batch.",
  source_errors: "One or more public sources could not be processed.",
} as const;

function parseSafeRun(
  value: unknown,
  requestedRunId: string,
): Record<string, unknown> | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "id",
      "trigger",
      "scanMode",
      "status",
      "startedAt",
      "completedAt",
      "sourceCountries",
      "sourceLanguages",
      "targetDomains",
      "targetSignalTypes",
      "sourcesUsed",
      "counts",
      "notices",
      "createdAt",
      "updatedAt",
    ]) ||
    value.id !== requestedRunId ||
    typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.id,
    ) ||
    !["scheduled", "manual", "trial"].includes(String(value.trigger)) ||
    !["daily", "thematic", "watchlist_refresh", "manual"].includes(
      String(value.scanMode),
    ) ||
    !["queued", "running", "succeeded", "partial", "failed"].includes(
      String(value.status),
    ) ||
    !validIsoTimestamp(value.startedAt, true) ||
    !validIsoTimestamp(value.completedAt, true) ||
    !boundedStringArray(value.sourceCountries, 50, 100) ||
    !boundedStringArray(value.sourceLanguages, 10, 35) ||
    !boundedStringArray(value.targetDomains, 50, 200) ||
    !boundedStringArray(value.targetSignalTypes, 50, 200) ||
    !boundedStringArray(value.sourcesUsed, 10, 100) ||
    !isPlainObject(value.counts) ||
    !Array.isArray(value.notices) ||
    value.notices.length > 10 ||
    !validIsoTimestamp(value.createdAt) ||
    !validIsoTimestamp(value.updatedAt)
  ) {
    return null;
  }
  const counts = value.counts;
  if (
    !isPlainObject(counts) ||
    !hasExactKeys(counts, safeRunCountKeys) ||
    !safeRunCountKeys.every((key) => safeInteger(counts[key]))
  ) {
    return null;
  }
  for (const noticeValue of value.notices) {
    if (!isPlainObject(noticeValue)) return null;
    const hasCount = Object.hasOwn(noticeValue, "count");
    if (
      !hasExactKeys(
        noticeValue,
        hasCount ? ["code", "message", "count"] : ["code", "message"],
      ) ||
      typeof noticeValue.code !== "string" ||
      !Object.hasOwn(safeNoticeMessages, noticeValue.code) ||
      noticeValue.message !==
        safeNoticeMessages[
          noticeValue.code as keyof typeof safeNoticeMessages
        ] ||
      (hasCount && !safeInteger(noticeValue.count))
    ) {
      return null;
    }
  }
  return value;
}

function safeMutationResult(
  command: "submit" | "fail" | "abandon",
  response: Record<string, unknown>,
  requestedRunId: string,
) {
  if (
    response.ok !== true ||
    !hasExactKeys(response, ["ok", "outcome", "run"]) ||
    (response.outcome !== "completed" && response.outcome !== "replayed")
  ) {
    throw new GlobalRadarCliError(
      `The Global Radar API returned an invalid response for ${command}.`,
    );
  }
  const run = parseSafeRun(response.run, requestedRunId);
  if (!run) {
    throw new GlobalRadarCliError(
      `The Global Radar API returned an invalid response for ${command}.`,
    );
  }
  const status = run.status;
  if (
    (command === "submit" &&
      status !== "succeeded" &&
      status !== "partial" &&
      status !== "failed") ||
    (command !== "submit" && status !== "failed")
  ) {
    throw new GlobalRadarCliError(
      `The Global Radar API returned an invalid response for ${command}.`,
    );
  }
  return {
    ok: true as const,
    command,
    outcome: response.outcome,
    run,
  };
}

async function claim(
  options: ReadonlyMap<string, string>,
  runtime: GlobalRadarWorkerRuntime,
) {
  assertAllowedOptions(options, ["--trigger", "--scan-mode"]);
  const trigger = options.get("--trigger")?.trim() || "scheduled";
  if (trigger !== "scheduled" && trigger !== "trial") {
    throw new GlobalRadarCliError(
      "Global Radar worker option --trigger must be scheduled or trial.",
    );
  }
  const scanMode = options.get("--scan-mode")?.trim() || "daily";
  if (
    scanMode !== "daily" &&
    scanMode !== "thematic" &&
    scanMode !== "watchlist_refresh"
  ) {
    throw new GlobalRadarCliError(
      "Global Radar worker option --scan-mode must be daily, thematic, or watchlist_refresh.",
    );
  }
  const response = await postWorkerJson(
    "claim",
    "/api/global-radar/worker/claim",
    JSON.stringify({ trigger, scanMode }),
    runtime,
  );
  if (response.ok !== true) {
    throw new GlobalRadarCliError(
      "The Global Radar API returned an invalid response for claim.",
    );
  }
  if (response.outcome === "no_work") {
    const hasRun = Object.hasOwn(response, "run");
    const validReason =
      response.reason === "active_run" ||
      response.reason === "empty_queue" ||
      response.reason === "active_race";
    const validRun =
      !hasRun ||
      (isPlainObject(response.run) &&
        typeof response.run.id === "string" &&
        Boolean(parseSafeRun(response.run, response.run.id)));
    if (
      !hasExactKeys(
        response,
        hasRun
          ? ["ok", "outcome", "reason", "run"]
          : ["ok", "outcome", "reason"],
      ) ||
      !validReason ||
      !validRun
    ) {
      throw new GlobalRadarCliError(
        "The Global Radar API returned an invalid response for claim.",
      );
    }
    return {
      ok: true as const,
      command: "claim" as const,
      claimed: false as const,
      reason: response.reason,
    };
  }
  if (
    response.outcome === "claimed" &&
    hasExactKeys(response, ["ok", "outcome", "claim"])
  ) {
    const privateClaim = parsePrivateClaim(response.claim);
    if (!privateClaim) {
      throw new GlobalRadarCliError(
        "The Global Radar API returned an invalid response for claim.",
      );
    }
    const claimFile = await writePrivateClaimFile(privateClaim);
    return {
      ok: true as const,
      command: "claim" as const,
      claimed: true as const,
      runId: privateClaim.runId,
      leaseExpiresAt: privateClaim.leaseExpiresAt,
      versions: privateClaim.versions,
      plan: {
        scanMode: privateClaim.plan.scanMode,
        fingerprint: privateClaim.plan.fingerprint,
        countryCount: privateClaim.plan.countries.length,
        languageCount: privateClaim.plan.languages.length,
        themeCount: privateClaim.plan.themes.length,
        sourceAdapterCount: privateClaim.plan.sourceAdapters.length,
        sourceFamilyCount: privateClaim.plan.sourceFamilies.length,
        watchlistCount: privateClaim.plan.watchlist.length,
        resultLimit: privateClaim.plan.resultLimit,
        dateWindow: privateClaim.plan.dateWindow,
      },
      queries: { count: privateClaim.queries.length },
      config: {
        countryCount: privateClaim.config.countries.length,
        languageCount: privateClaim.config.languages.length,
        themeCount: privateClaim.config.themes.length,
        enabledSources: privateClaim.config.enabledSources,
        resultLimit: privateClaim.config.resultLimit,
        thresholds: privateClaim.config.thresholds,
      },
      claimFile,
    };
  }
  throw new GlobalRadarCliError(
    "The Global Radar API returned an invalid response for claim.",
  );
}

async function submit(
  options: ReadonlyMap<string, string>,
  runtime: GlobalRadarWorkerRuntime,
) {
  assertAllowedOptions(options, ["--claim-file", "--file"]);
  const claim = await readPrivateClaimFile(
    requiredOption(options, "--claim-file"),
  );
  const document = await validatedBatchDocument(
    requiredOption(options, "--file"),
  );
  if (document.batch.runId !== claim.runId) {
    throw new GlobalRadarCliError(
      "The Global Radar batch run id does not match the private claim file.",
    );
  }
  if (document.batch.planFingerprint !== claim.plan.fingerprint) {
    throw new GlobalRadarCliError(
      "The Global Radar batch plan fingerprint does not match the private claim file.",
    );
  }
  return safeMutationResult(
    "submit",
    await postWorkerJson(
      "submit",
      `/api/global-radar/worker/runs/${encodeURIComponent(claim.runId)}/complete`,
      document.bytes as BodyInit,
      runtime,
      claim.leaseToken,
    ),
    claim.runId,
  );
}

function safeMessage(options: ReadonlyMap<string, string>): string {
  const message = requiredOption(options, "--message");
  if (message.length > MAX_SAFE_MESSAGE_CHARACTERS) {
    throw new GlobalRadarCliError(
      `Global Radar worker option --message must be at most ${MAX_SAFE_MESSAGE_CHARACTERS} characters.`,
    );
  }
  return message;
}

async function fail(
  options: ReadonlyMap<string, string>,
  runtime: GlobalRadarWorkerRuntime,
) {
  assertAllowedOptions(options, ["--claim-file", "--message"]);
  const claim = await readPrivateClaimFile(
    requiredOption(options, "--claim-file"),
  );
  const reason = safeMessage(options);
  return safeMutationResult(
    "fail",
    await postWorkerJson(
      "fail",
      `/api/global-radar/worker/runs/${encodeURIComponent(claim.runId)}/fail`,
      JSON.stringify({ runId: claim.runId, reason }),
      runtime,
      claim.leaseToken,
    ),
    claim.runId,
  );
}

function requiredRunId(options: ReadonlyMap<string, string>): string {
  const runId = requiredOption(options, "--run-id");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  ) {
    throw new GlobalRadarCliError(
      "Global Radar worker option --run-id must be a UUID.",
    );
  }
  return runId;
}

async function abandon(
  options: ReadonlyMap<string, string>,
  runtime: GlobalRadarWorkerRuntime,
) {
  assertAllowedOptions(options, ["--run-id", "--message"]);
  const runId = requiredRunId(options);
  const reason = safeMessage(options);
  return safeMutationResult(
    "abandon",
    await postWorkerJson(
      "abandon",
      `/api/global-radar/worker/runs/${encodeURIComponent(runId)}/abandon`,
      JSON.stringify({ runId, reason }),
      runtime,
    ),
    runId,
  );
}

function assertCommandArguments(
  command: string | undefined,
  options: ReadonlyMap<string, string>,
): void {
  if (command === "validate") {
    assertAllowedOptions(options, ["--file"]);
    requiredOption(options, "--file");
    return;
  }
  if (command === "claim") {
    assertAllowedOptions(options, ["--trigger", "--scan-mode"]);
    return;
  }
  if (command === "submit") {
    assertAllowedOptions(options, ["--claim-file", "--file"]);
    requiredOption(options, "--claim-file");
    requiredOption(options, "--file");
    return;
  }
  if (command === "fail") {
    assertAllowedOptions(options, ["--claim-file", "--message"]);
    requiredOption(options, "--claim-file");
    requiredOption(options, "--message");
    return;
  }
  if (command === "abandon") {
    assertAllowedOptions(options, ["--run-id", "--message"]);
    requiredOption(options, "--run-id");
    requiredOption(options, "--message");
    return;
  }
  throw new GlobalRadarCliError(
    "Global Radar worker command must be one of: claim, validate, submit, fail, abandon.",
  );
}

async function executeGlobalRadarWorkerCommand(
  arguments_: readonly string[],
  runtime: GlobalRadarWorkerRuntime,
) {
  const { command, options } = parseArguments(arguments_);
  assertCommandArguments(command, options);
  if (command === "validate") return validate(options);
  if (command === "claim") return claim(options, runtime);
  if (command === "submit") return submit(options, runtime);
  if (command === "fail") return fail(options, runtime);
  if (command === "abandon") return abandon(options, runtime);
  throw new GlobalRadarCliError("Global Radar worker command is invalid.");
}

export async function runGlobalRadarWorkerCli(
  arguments_: readonly string[],
  runtime: GlobalRadarWorkerRuntime = defaultRuntime,
  io: GlobalRadarWorkerIo = defaultIo,
): Promise<number> {
  try {
    const result = await executeGlobalRadarWorkerCommand(arguments_, runtime);
    io.writeStdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const message =
      error instanceof GlobalRadarCliError
        ? error.message
        : "The Global Radar worker command failed unexpectedly.";
    const details = error instanceof GlobalRadarCliError ? error.details : {};
    io.writeStderr(
      `${JSON.stringify({ ok: false, error: message, ...details })}\n`,
    );
    return 1;
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(
    entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href,
  );
}

if (isDirectExecution()) {
  loadLocalEnvironment();
  void runGlobalRadarWorkerCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
