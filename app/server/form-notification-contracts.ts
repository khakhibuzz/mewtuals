import type { OpportunityBriefStatus } from "../domain/opportunity-brief";

export type FormKind = "apply" | "join";

export type FormSubmissionPayload = Readonly<
  Record<
    string,
    string | null | undefined | Readonly<Record<string, string | undefined>>
  >
>;

export type FormNotificationMessage = Readonly<{
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}>;

export type NewFormSubmission = Readonly<{
  id: string;
  form: FormKind;
  payloadHash: string;
  payload: FormSubmissionPayload;
  message: FormNotificationMessage;
  createdAt: Date;
}>;

export type StoredFormSubmission = NewFormSubmission & Readonly<{
  requesterHash: string;
  requestId: string | null;
  status: OpportunityBriefStatus | null;
  firstAttemptAt: Date | null;
  acceptedAt: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  attemptCount: number;
}>;

export type SaveApplicationResult =
  | { outcome: "accepted"; submission: StoredFormSubmission }
  | { outcome: "rate_limited" | "idempotency_conflict" };

export interface FormSubmissionRepository {
  saveApplication(
    input: NewFormSubmission,
    requesterHash: string,
  ): Promise<SaveApplicationResult>;
  startAttempt(id: string, at: Date): Promise<StoredFormSubmission>;
  recordAccepted(id: string, providerMessageId: string, at: Date): Promise<void>;
  recordFailure(id: string, error: string): Promise<void>;
  listPending(limit: number): Promise<StoredFormSubmission[]>;
}

export type FormNotificationSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false };

export interface FormNotificationSender {
  send(submission: NewFormSubmission): Promise<FormNotificationSendResult>;
}

export type FormNotificationOutcome =
  | { ok: true }
  | { ok: false; error: string; reconciliationNeeded: boolean };

export interface FormNotificationManager {
  prepare(
    form: FormKind,
    id: string,
    payload: FormSubmissionPayload,
    at: Date,
  ): NewFormSubmission;
  deliver(submission: StoredFormSubmission): Promise<FormNotificationOutcome>;
}
