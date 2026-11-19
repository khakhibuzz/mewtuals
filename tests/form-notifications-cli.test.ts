import { describe, expect, it, vi } from "vitest";

import type { StoredFormSubmission } from "../app/server/form-notification-contracts";
import { createFormNotificationManager } from "../app/server/form-notifications";
import { runFormNotificationsCli, type FormNotificationsCliRuntime } from "../scripts/form-notifications";

const id = "166a115f-df79-4d7a-a9c3-e7f78322b886";
const providerMessageId = "bf48e379-78d6-44ec-a8f6-e31b2fa3f53c";
const now = new Date("2026-11-19T10:00:00.000Z");

function fixture() {
  let row: StoredFormSubmission = {
    id, form: "apply", payloadHash: "payload-hash",
    payload: { workEmail: "private@example.com" },
    message: { from: "private-sender@example.com", to: "keshav@mewtuals.com", subject: "Private subject", text: "Private content", html: "Private content" },
    requesterHash: "private-requester-hash", requestId: null, status: null,
    createdAt: now, firstAttemptAt: null, acceptedAt: null, providerMessageId: null,
    lastError: "private provider error", attemptCount: 0,
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const runtime: FormNotificationsCliRuntime = {
    listPending: vi.fn(async () => [row]),
    find: vi.fn(async () => row),
    deliver: vi.fn(async () => {
      row = { ...row, acceptedAt: now, providerMessageId };
      return { ok: true as const };
    }),
    now: () => now,
    stdout: (line) => { stdout.push(line); },
    stderr: (line) => { stderr.push(line); },
  };
  return {
    runtime, stdout, stderr,
    get row() { return row; },
    replace(value: StoredFormSubmission) { row = value; },
  };
}

describe("form notification operator commands", () => {
  it("defaults to a bounded read-only pending list with no personal data", async () => {
    const context = fixture();
    expect(await runFormNotificationsCli([], context.runtime)).toBe(0);
    expect(context.runtime.listPending).toHaveBeenCalledWith(20);
    expect(context.runtime.deliver).not.toHaveBeenCalled();
    expect(JSON.parse(context.stdout[0])).toEqual({ id, form: "apply", createdAt: now.toISOString(), status: "pending", providerMessageId: null });
    expect(context.stdout.join("")).not.toMatch(/private|mewtuals\.com|payload|requester|lastError/);
  });

  it("reads one exact submission regardless of the pending-list window", async () => {
    const context = fixture();
    context.replace({ ...context.row, acceptedAt: now, providerMessageId });
    expect(await runFormNotificationsCli(["status", id], context.runtime)).toBe(0);
    expect(context.runtime.find).toHaveBeenCalledWith(id);
    expect(context.runtime.listPending).not.toHaveBeenCalled();
    expect(context.runtime.deliver).not.toHaveBeenCalled();
    expect(JSON.parse(context.stdout[0])).toMatchObject({ status: "provider_accepted", providerMessageId });
  });

  it.each([["retry"], ["retry", "--limit", "0"], ["retry", "--limit", "101"], ["retry", "--limit", "1.5"], ["retry", "not-a-uuid"], ["retry", id, "--limit", "2"], ["send", id]])("rejects unbounded or invalid mutation selection: %j", async (...args) => {
    const context = fixture();
    expect(await runFormNotificationsCli(args, context.runtime)).toBe(2);
    expect(context.runtime.find).not.toHaveBeenCalled();
    expect(context.runtime.listPending).not.toHaveBeenCalled();
    expect(context.runtime.deliver).not.toHaveBeenCalled();
  });

  it("retries only an explicitly selected submission and reads back acceptance", async () => {
    const context = fixture();
    expect(await runFormNotificationsCli(["retry", id], context.runtime)).toBe(0);
    expect(context.runtime.deliver).toHaveBeenCalledTimes(1);
    expect(context.runtime.deliver).toHaveBeenCalledWith(expect.objectContaining({ id }));
    expect(context.runtime.find).toHaveBeenCalledTimes(2);
    expect(JSON.parse(context.stdout[0])).toMatchObject({ status: "provider_accepted", providerMessageId });
  });

  it("passes the explicit maximum through to the bounded repository query", async () => {
    const context = fixture();
    expect(await runFormNotificationsCli(["retry", "--limit", "100"], context.runtime)).toBe(0);
    expect(context.runtime.listPending).toHaveBeenCalledWith(100);
    expect(context.runtime.deliver).toHaveBeenCalledTimes(1);
  });

  it("returns failure when delivery is unconfirmed", async () => {
    const context = fixture();
    vi.mocked(context.runtime.deliver).mockResolvedValue({ ok: false, error: "Private transport detail", reconciliationNeeded: false });
    expect(await runFormNotificationsCli(["retry", id], context.runtime)).toBe(1);
    expect(JSON.parse(context.stdout[0]).status).toBe("pending");
    expect(context.stdout.join("")).not.toContain("Private transport detail");
  });

  it("uses the manager to prevent expired ambiguous notifications from being resent", async () => {
    const context = fixture();
    context.replace({ ...context.row, firstAttemptAt: new Date(now.getTime() - 24 * 60 * 60 * 1_000) });
    const send = vi.fn();
    const startAttempt = vi.fn();
    const manager = createFormNotificationManager({
      repository: {
        saveApplication: vi.fn(), startAttempt, recordAccepted: vi.fn(), recordFailure: vi.fn(), listPending: context.runtime.listPending,
      },
      sender: { send }, from: "hello@mewtuals.com", now: () => now,
    });
    context.runtime.deliver = manager.deliver;
    expect(await runFormNotificationsCli(["retry", id], context.runtime)).toBe(1);
    expect(JSON.parse(context.stdout[0]).status).toBe("reconciliation_needed");
    expect(send).not.toHaveBeenCalled();
    expect(startAttempt).not.toHaveBeenCalled();
  });

  it("reports missing IDs without falling back to a batch send", async () => {
    const context = fixture();
    vi.mocked(context.runtime.find).mockResolvedValue(null);
    expect(await runFormNotificationsCli(["retry", id], context.runtime)).toBe(1);
    expect(context.runtime.deliver).not.toHaveBeenCalled();
    expect(context.runtime.listPending).not.toHaveBeenCalled();
  });

  it("never prints underlying database or credential errors", async () => {
    const context = fixture();
    vi.mocked(context.runtime.listPending).mockRejectedValue(new Error("postgresql://private-secret@db.example.com/database"));
    expect(await runFormNotificationsCli([], context.runtime)).toBe(1);
    expect(context.stderr.join("")).not.toMatch(/private-secret|db\.example\.com/);
    expect(context.stdout).toEqual([]);
  });
});
