import { pathToFileURL } from "node:url";

import { z } from "zod";

import type {
  FormNotificationManager,
  FormNotificationOutcome,
  StoredFormSubmission,
} from "../app/server/form-notification-contracts";
import {
  createFormNotificationManager,
  createResendFormNotificationSender,
  FORM_NOTIFICATION_TIMEOUT_MS,
} from "../app/server/form-notifications";
import { readServerEnvironment } from "../app/server/env";
import { closeDb, getDb } from "../db/client";
import {
  createFormSubmissionRepository,
  findFormSubmission,
} from "../db/repositories/form-submission-repository";
import { loadLocalEnvironment } from "./load-local-env.mjs";

export type FormNotificationsCliRuntime = {
  listPending(limit: number): Promise<StoredFormSubmission[]>;
  find(id: string): Promise<StoredFormSubmission | null>;
  deliver(submission: StoredFormSubmission): Promise<FormNotificationOutcome>;
  now(): Date;
  stdout(line: string): void;
  stderr(line: string): void;
};

type Selection = { id: string } | { limit: number };
type Command = { action: "status" | "retry"; selection: Selection };
const usage = "Usage: form-notifications [status [uuid | --limit 1..100] | retry <uuid | --limit 1..100>]";

function parseArguments(args: readonly string[]): Command {
  const [action = "status", ...selection] = args;
  if (action !== "status" && action !== "retry") throw new Error(usage);
  if (selection.length === 0 && action === "status") {
    return { action, selection: { limit: 20 } };
  }
  if (selection.length === 1 && z.uuid().safeParse(selection[0]).success) {
    return { action, selection: { id: selection[0] } };
  }
  if (selection.length === 2 && selection[0] === "--limit" && /^\d+$/.test(selection[1])) {
    const limit = Number(selection[1]);
    if (Number.isSafeInteger(limit) && limit >= 1 && limit <= 100) {
      return { action, selection: { limit } };
    }
  }
  throw new Error(usage);
}

function statusRow(submission: StoredFormSubmission, at: Date) {
  const age = submission.firstAttemptAt
    ? at.getTime() - submission.firstAttemptAt.getTime()
    : null;
  const reconciliationNeeded = age !== null && (
    !Number.isFinite(age) || age >= 24 * 60 * 60 * 1_000 - FORM_NOTIFICATION_TIMEOUT_MS
  );
  return {
    id: submission.id,
    form: submission.form,
    createdAt: submission.createdAt.toISOString(),
    status: submission.acceptedAt
      ? "provider_accepted"
      : reconciliationNeeded ? "reconciliation_needed" : "pending",
    providerMessageId: submission.providerMessageId,
  };
}

function defaultRuntime(): FormNotificationsCliRuntime {
  loadLocalEnvironment();
  const database = getDb();
  const repository = createFormSubmissionRepository(database);
  let manager: FormNotificationManager | undefined;
  return {
    listPending: (limit) => repository.listPending(limit),
    find: (id) => findFormSubmission(database, id),
    async deliver(submission) {
      if (!manager) {
        const environment = readServerEnvironment();
        if (!environment.resendApiKey) throw new Error("Notification delivery is not configured.");
        manager = createFormNotificationManager({
          repository,
          sender: createResendFormNotificationSender({ apiKey: environment.resendApiKey }),
          from: environment.emailFrom ?? "",
        });
      }
      return manager.deliver(submission);
    },
    now: () => new Date(),
    stdout: (line) => { process.stdout.write(`${line}\n`); },
    stderr: (line) => { process.stderr.write(`${line}\n`); },
  };
}

async function selectedSubmissions(selection: Selection, runtime: FormNotificationsCliRuntime) {
  if ("limit" in selection) return runtime.listPending(selection.limit);
  const submission = await runtime.find(selection.id);
  if (!submission) throw new Error("Submission not found.");
  return [submission];
}

export async function runFormNotificationsCli(
  args: readonly string[],
  providedRuntime?: FormNotificationsCliRuntime,
): Promise<number> {
  const writeError = providedRuntime?.stderr ?? ((line: string) => { process.stderr.write(`${line}\n`); });
  let command: Command;
  try {
    command = parseArguments(args);
  } catch {
    writeError(usage);
    return 2;
  }

  try {
    const runtime = providedRuntime ?? defaultRuntime();
    const submissions = await selectedSubmissions(command.selection, runtime);
    let failed = false;
    for (const submission of submissions) {
      let current = submission;
      if (command.action === "retry") {
        const result = await runtime.deliver(submission);
        const refreshed = await runtime.find(submission.id);
        if (!refreshed) throw new Error("Submission could not be read back.");
        current = refreshed;
        failed ||= !result.ok || !current.acceptedAt;
      }
      runtime.stdout(JSON.stringify(statusRow(current, runtime.now())));
    }
    return failed ? 1 : 0;
  } catch {
    writeError("Notification command failed. Check configuration and the submission ID; no delivery success was assumed.");
    return 1;
  } finally {
    if (!providedRuntime) await closeDb();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runFormNotificationsCli(process.argv.slice(2));
  } catch {
    process.stderr.write("Notification command could not complete safely. No delivery success was assumed.\n");
    process.exitCode = 1;
  }
}
