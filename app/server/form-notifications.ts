import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  FormKind,
  FormNotificationManager,
  FormNotificationMessage,
  FormNotificationOutcome,
  FormNotificationSender,
  FormSubmissionPayload,
  FormSubmissionRepository,
  NewFormSubmission,
  StoredFormSubmission,
} from "./form-notification-contracts";
import {
  FORM_NOTIFICATION_OWNER,
  FORM_NOTIFICATION_TIMEOUT_MS,
  isNotificationSender,
} from "./form-notification-transport";

export {
  createResendFormNotificationSender,
  FORM_NOTIFICATION_OWNER,
  FORM_NOTIFICATION_TIMEOUT_MS,
} from "./form-notification-transport";

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const notificationError =
  "Your details are saved, but we could not confirm the notification. Please try again.";
const reconciliationError =
  "Your details are saved, but email delivery needs review. Please contact keshav@mewtuals.com.";
const trackingKeys = ["source", "medium", "campaign", "term", "content"] as const;
const trackingSchema = z.strictObject({
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  term: z.string().optional(),
  content: z.string().optional(),
});
const sharedFields = {
  source: z.string().nullish(),
  utm: trackingSchema.optional(),
};
const payloadSchemas = {
  apply: z.strictObject({
    companyUrl: z.string(),
    workEmail: z.email(),
    phone: z.string(),
    ...sharedFields,
  }),
  join: z.strictObject({
    participantType: z.enum(["company", "creator"]),
    profileUrl: z.string(),
    email: z.email().nullish(),
    phoneNumber: z.string().nullish(),
    openToText: z.string().nullish(),
    ...sharedFields,
  }),
};
const formLabels = {
  apply: {
    subject: "Mewtuals: New representation application",
    fields: [["companyUrl", "Company URL"], ["workEmail", "Work email"], ["phone", "Phone number"]],
  },
  join: {
    subject: "Mewtuals: New Opportunity Brief submission",
    fields: [
      ["participantType", "Participant type"], ["profileUrl", "Profile URL"],
      ["email", "Email"], ["phoneNumber", "WhatsApp number"], ["openToText", "Open to"],
    ],
  },
} as const;

function snapshotPayload(form: FormKind, input: FormSubmissionPayload): FormSubmissionPayload {
  const payload = payloadSchemas[form].parse(input);
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [
      key,
      value && typeof value === "object"
        ? Object.freeze(Object.fromEntries(
            Object.entries(value)
              .filter(([, nested]) => nested !== undefined)
              .sort(([left], [right]) => left.localeCompare(right)),
          ))
        : value,
    ]);
  return Object.freeze(Object.fromEntries(entries));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(value: FormSubmissionPayload[string]): string {
  return typeof value === "string" && value.length > 0 ? value : "Not supplied";
}

function notificationMessage(
  from: string,
  form: FormKind,
  id: string,
  payload: FormSubmissionPayload,
  at: Date,
): FormNotificationMessage {
  const definition = formLabels[form];
  const utm = typeof payload.utm === "object" && payload.utm !== null ? payload.utm : {};
  const fields = [
    ["Form", `/${form}`],
    ["Submission ID", id],
    ["Submitted at (UTC)", at.toISOString()],
    ...definition.fields.map(([key, label]) => [label, displayValue(payload[key])]),
    ["Source", displayValue(payload.source)],
    ...trackingKeys.map((key) => [`UTM ${key}`, displayValue(utm[key])]),
  ];
  const replyTo = form === "apply" ? payload.workEmail : payload.email;
  return Object.freeze({
    from,
    to: FORM_NOTIFICATION_OWNER,
    ...(typeof replyTo === "string" ? { replyTo } : {}),
    subject: definition.subject,
    text: [definition.subject, "", ...fields.map(([label, value]) => `${label}: ${value}`)].join("\n"),
    html: `<h1>${escapeHtml(definition.subject)}</h1><dl>${fields.map(([label, value]) =>
      `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value).replaceAll("\n", "<br />")}</dd>`,
    ).join("")}</dl>`,
  });
}

function needsReconciliation(submission: StoredFormSubmission, now: Date): boolean {
  if (!submission.firstAttemptAt) return false;
  const age = now.getTime() - submission.firstAttemptAt.getTime();
  return !Number.isFinite(age) || age >= IDEMPOTENCY_WINDOW_MS - FORM_NOTIFICATION_TIMEOUT_MS;
}

function failure(reconciliationNeeded = false): FormNotificationOutcome {
  return {
    ok: false,
    error: reconciliationNeeded ? reconciliationError : notificationError,
    reconciliationNeeded,
  };
}

type NotificationOptions = {
  repository: FormSubmissionRepository;
  sender: FormNotificationSender;
  from: string;
  now?: () => Date;
};

export function createFormNotificationManager(options: NotificationOptions): FormNotificationManager {
  const now = options.now ?? (() => new Date());

  async function recordFailure(id: string, error: string) {
    try {
      await options.repository.recordFailure(id, error);
    } catch {
      // The saved submission remains pending when its outcome cannot be recorded.
    }
  }

  return {
    prepare(form, id, input, at): NewFormSubmission {
      if (!isNotificationSender(options.from)) {
        throw new Error("Form notification sender is not configured.");
      }
      z.uuid().parse(id);
      const payload = snapshotPayload(form, input);
      return Object.freeze({
        id,
        form,
        payloadHash: createHash("sha256").update(JSON.stringify({ form, payload })).digest("hex"),
        payload,
        message: notificationMessage(options.from.trim(), form, id, payload, at),
        createdAt: new Date(at.getTime()),
      });
    },

    async deliver(submission): Promise<FormNotificationOutcome> {
      if (submission.acceptedAt) return { ok: true };
      if (needsReconciliation(submission, now())) return failure(true);

      let attempt: StoredFormSubmission;
      try {
        attempt = await options.repository.startAttempt(submission.id, now());
      } catch {
        return failure();
      }
      if (attempt.acceptedAt) return { ok: true };
      if (needsReconciliation(attempt, now())) return failure(true);

      try {
        const result = await options.sender.send(attempt);
        if (!result.ok) {
          await recordFailure(submission.id, "Email notification could not be confirmed.");
          return failure();
        }
        await options.repository.recordAccepted(submission.id, result.providerMessageId, now());
        return { ok: true };
      } catch {
        await recordFailure(submission.id, "Email notification outcome could not be recorded.");
        return failure();
      }
    },
  };
}
