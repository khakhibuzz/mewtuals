import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoveryBatchSchema,
  MAX_DISCOVERY_BATCH_BYTES,
} from "../app/domain/discovery";
import { loadLocalEnvironment } from "./load-local-env.mjs";

type ParsedArguments = {
  command: string | undefined;
  options: Map<string, string>;
};

class DiscoveryCliError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DiscoveryCliError";
  }
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const [command, ...rest] = arguments_;
  const options = new Map<string, string>();

  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const value = rest[index + 1];
    if (!option?.startsWith("--") || value === undefined) {
      throw new DiscoveryCliError("Worker command arguments are invalid.");
    }
    if (options.has(option)) {
      throw new DiscoveryCliError(`Worker option ${option} was provided twice.`);
    }
    options.set(option, value);
  }

  return { command, options };
}

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name)?.trim();
  if (!value) {
    throw new DiscoveryCliError(`Worker option ${name} is required.`);
  }
  return value;
}

function assertAllowedOptions(
  options: Map<string, string>,
  allowed: readonly string[],
): void {
  const allowedOptions = new Set(allowed);
  const unsupported = [...options.keys()].find(
    (option) => !allowedOptions.has(option),
  );
  if (unsupported) {
    throw new DiscoveryCliError(`Worker option ${unsupported} is not supported.`);
  }
}

async function readJsonDocument(
  file: string,
): Promise<{ contents: string; value: unknown }> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    throw new DiscoveryCliError("The discovery JSON file could not be read.");
  }
  if (Buffer.byteLength(contents, "utf8") > MAX_DISCOVERY_BATCH_BYTES) {
    throw new DiscoveryCliError(
      `The discovery batch file must be at most ${MAX_DISCOVERY_BATCH_BYTES} bytes.`,
    );
  }

  try {
    return { contents, value: JSON.parse(contents) };
  } catch {
    throw new DiscoveryCliError("The discovery JSON file is not valid JSON.");
  }
}

async function readJsonFile(file: string): Promise<unknown> {
  return (await readJsonDocument(file)).value;
}

async function validate(options: Map<string, string>) {
  assertAllowedOptions(options, ["--file"]);
  const file = requiredOption(options, "--file");
  const parsed = discoveryBatchSchema.safeParse(await readJsonFile(file));
  if (!parsed.success) {
    throw new DiscoveryCliError("The discovery batch failed validation.", {
      issues: parsed.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return {
    ok: true as const,
    command: "validate",
    runId: parsed.data.runId,
    candidateCount: parsed.data.candidates.length,
    sourceErrorCount: parsed.data.sourceErrors.length,
  };
}

function workerEnvironment(): { baseUrl: URL; workerSecret: string } {
  const baseUrlValue = process.env.DISCOVERY_API_BASE_URL?.trim();
  if (!baseUrlValue) {
    throw new DiscoveryCliError(
      "DISCOVERY_API_BASE_URL is required for network commands.",
    );
  }
  const workerSecret = process.env.DISCOVERY_WORKER_SECRET?.trim();
  if (!workerSecret) {
    throw new DiscoveryCliError(
      "DISCOVERY_WORKER_SECRET is required for network commands.",
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new DiscoveryCliError("DISCOVERY_API_BASE_URL must be a valid URL.");
  }
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new DiscoveryCliError(
      "DISCOVERY_API_BASE_URL must use HTTP or HTTPS.",
    );
  }
  if (baseUrl.username || baseUrl.password) {
    throw new DiscoveryCliError(
      "DISCOVERY_API_BASE_URL must not contain credentials.",
    );
  }

  return { baseUrl, workerSecret };
}

async function postWorkerJson(
  command: string,
  path: string,
  body: string,
): Promise<Record<string, unknown>> {
  const { baseUrl, workerSecret } = workerEnvironment();
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl.origin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new DiscoveryCliError(
      `The discovery API could not be reached for ${command}.`,
    );
  }

  if (!response.ok) {
    throw new DiscoveryCliError(
      `The discovery API rejected ${command} with HTTP ${response.status}.`,
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new DiscoveryCliError(
      `The discovery API returned invalid JSON for ${command}.`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DiscoveryCliError(
      `The discovery API returned an invalid response for ${command}.`,
    );
  }
  return value as Record<string, unknown>;
}

async function writePrivateClaimFile(
  response: Record<string, unknown>,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mewtuals-discovery-claim-"));
  await chmod(directory, 0o700);
  const file = join(directory, "claim.json");
  await writeFile(file, `${JSON.stringify(response)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return file;
}

async function claim(options: Map<string, string>) {
  assertAllowedOptions(options, ["--trigger"]);
  const trigger = options.get("--trigger")?.trim() || "scheduled";
  if (trigger !== "scheduled" && trigger !== "trial") {
    throw new DiscoveryCliError(
      "Worker option --trigger must be scheduled or trial.",
    );
  }
  const response = await postWorkerJson(
    "claim",
    "/api/discovery/worker/claim",
    JSON.stringify(trigger === "trial" ? { trigger } : {}),
  );
  if (response.ok !== true || typeof response.claimed !== "boolean") {
    throw new DiscoveryCliError(
      "The discovery API returned an invalid response for claim.",
    );
  }
  if (!response.claimed) {
    return { ok: true as const, command: "claim", claimed: false as const };
  }
  if (
    typeof response.runId !== "string" ||
    typeof response.leaseToken !== "string" ||
    response.leaseToken.length === 0 ||
    response.promptVersion !== "codex-web-v1" ||
    !response.config ||
    typeof response.config !== "object" ||
    !response.outputSchema ||
    typeof response.outputSchema !== "object"
  ) {
    throw new DiscoveryCliError(
      "The discovery API returned an invalid response for claim.",
    );
  }
  const claimFile = await writePrivateClaimFile(response);
  return {
    ok: true as const,
    command: "claim",
    claimed: true as const,
    runId: response.runId,
    promptVersion: response.promptVersion,
    config: response.config,
    outputSchema: response.outputSchema,
    claimFile,
  };
}

async function runCredentials(
  options: Map<string, string>,
): Promise<{ runId: string; leaseToken: string }> {
  const claimFile = options.get("--claim-file")?.trim();
  const hasDirectCredentials =
    options.has("--run-id") || options.has("--lease-token");
  if (claimFile && hasDirectCredentials) {
    throw new DiscoveryCliError(
      "Use either --claim-file or --run-id with --lease-token, not both.",
    );
  }
  if (!claimFile) {
    return {
      runId: requiredOption(options, "--run-id"),
      leaseToken: requiredOption(options, "--lease-token"),
    };
  }

  const value = await readJsonFile(claimFile);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DiscoveryCliError(
      "The private claim file does not contain valid run credentials.",
    );
  }
  const claim = value as Record<string, unknown>;
  if (
    claim.ok !== true ||
    claim.claimed !== true ||
    typeof claim.runId !== "string" ||
    typeof claim.leaseToken !== "string" ||
    claim.leaseToken.length === 0 ||
    claim.promptVersion !== "codex-web-v1"
  ) {
    throw new DiscoveryCliError(
      "The private claim file does not contain valid run credentials.",
    );
  }
  return { runId: claim.runId, leaseToken: claim.leaseToken };
}

function safeRunSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DiscoveryCliError(
      "The discovery API returned an invalid worker run.",
    );
  }
  const run = value as Record<string, unknown>;
  if (typeof run.id !== "string" || typeof run.status !== "string") {
    throw new DiscoveryCliError(
      "The discovery API returned an invalid worker run.",
    );
  }
  const output: Record<string, unknown> = {};
  for (const key of [
    "id",
    "trigger",
    "status",
    "completedAt",
    "requestedCount",
    "foundCount",
    "newCount",
    "duplicateCount",
  ]) {
    const field = run[key];
    if (
      field === null ||
      typeof field === "string" ||
      typeof field === "number" ||
      typeof field === "boolean"
    ) {
      output[key] = field;
    }
  }
  return output;
}

function safeMutationResult(
  command: "submit" | "fail" | "abandon",
  response: Record<string, unknown>,
  requestedRunId: string,
) {
  const allowedOutcomes =
    command === "submit"
      ? new Set(["completed", "replayed"])
      : new Set(["failed", "replayed"]);
  if (
    response.ok !== true ||
    typeof response.outcome !== "string" ||
    !allowedOutcomes.has(response.outcome)
  ) {
    throw new DiscoveryCliError(
      `The discovery API returned an invalid response for ${command}.`,
    );
  }
  if (
    !response.run ||
    typeof response.run !== "object" ||
    Array.isArray(response.run) ||
    (response.run as Record<string, unknown>).id !== requestedRunId
  ) {
    throw new DiscoveryCliError(
      `The discovery API returned an invalid response for ${command}.`,
    );
  }
  const run = response.run as Record<string, unknown>;
  const allowedStatuses =
    command === "submit"
      ? new Set(["succeeded", "partial", "failed"])
      : new Set(["failed"]);
  if (typeof run.status !== "string" || !allowedStatuses.has(run.status)) {
    throw new DiscoveryCliError(
      `The discovery API returned an invalid response for ${command}.`,
    );
  }
  return {
    ok: true as const,
    command,
    outcome: response.outcome,
    run: safeRunSummary(response.run),
  };
}

async function submit(options: Map<string, string>) {
  assertAllowedOptions(options, [
    "--run-id",
    "--lease-token",
    "--claim-file",
    "--file",
  ]);
  const { runId, leaseToken } = await runCredentials(options);
  const file = requiredOption(options, "--file");
  const document = await readJsonDocument(file);
  const parsed = discoveryBatchSchema.safeParse(document.value);
  if (!parsed.success) {
    throw new DiscoveryCliError("The discovery batch failed validation.", {
      issues: parsed.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  if (parsed.data.runId !== runId) {
    throw new DiscoveryCliError(
      "The discovery batch run id does not match --run-id.",
    );
  }
  if (parsed.data.leaseToken !== leaseToken) {
    throw new DiscoveryCliError(
      "The discovery batch lease does not match --lease-token.",
    );
  }

  return safeMutationResult(
    "submit",
    await postWorkerJson(
      "submit",
      `/api/discovery/worker/runs/${encodeURIComponent(runId)}/complete`,
      document.contents,
    ),
    runId,
  );
}

async function fail(options: Map<string, string>) {
  assertAllowedOptions(options, [
    "--run-id",
    "--lease-token",
    "--claim-file",
    "--message",
  ]);
  const { runId, leaseToken } = await runCredentials(options);
  const message = requiredOption(options, "--message");
  if (message.length > 1_000) {
    throw new DiscoveryCliError(
      "Worker option --message must be at most 1000 characters.",
    );
  }

  return safeMutationResult(
    "fail",
    await postWorkerJson(
      "fail",
      `/api/discovery/worker/runs/${encodeURIComponent(runId)}/fail`,
      JSON.stringify({ runId, leaseToken, message }),
    ),
    runId,
  );
}

async function abandon(options: Map<string, string>) {
  assertAllowedOptions(options, ["--run-id", "--message"]);
  const runId = requiredOption(options, "--run-id");
  const message = requiredOption(options, "--message");
  if (message.length > 1_000) {
    throw new DiscoveryCliError(
      "Worker option --message must be at most 1000 characters.",
    );
  }

  return safeMutationResult(
    "abandon",
    await postWorkerJson(
      "abandon",
      `/api/discovery/worker/runs/${encodeURIComponent(runId)}/abandon`,
      JSON.stringify({ runId, message }),
    ),
    runId,
  );
}

async function main() {
  loadLocalEnvironment();
  const { command, options } = parseArguments(process.argv.slice(2));
  const result =
    command === "validate"
      ? await validate(options)
      : command === "claim"
        ? await claim(options)
        : command === "submit"
          ? await submit(options)
      : command === "fail"
        ? await fail(options)
        : command === "abandon"
          ? await abandon(options)
        : null;
  if (!result) {
    throw new DiscoveryCliError(
      "Worker command must be one of: validate, claim, submit, fail, abandon.",
    );
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof DiscoveryCliError
      ? error.message
      : "The discovery worker command failed unexpectedly.";
  const details = error instanceof DiscoveryCliError ? error.details : {};
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: message, ...details })}\n`,
  );
  process.exitCode = 1;
});
