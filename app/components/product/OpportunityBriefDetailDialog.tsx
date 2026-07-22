"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import styles from "./product.module.css";

export type OpportunityBriefStatus =
  | "submitted"
  | "researching"
  | "brief_ready"
  | "contacted"
  | "invited_to_join"
  | "converted"
  | "rejected";

export type OpportunityBriefDashboardRequest = {
  id: string;
  participantType: "company" | "creator";
  profileUrl: string;
  email: string | null;
  phoneNumber: string | null;
  openToText: string | null;
  source: string | null;
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  linkedCandidateId: string | null;
  status: OpportunityBriefStatus;
  adminNotes: string | null;
  acknowledgementStatus: "not_requested" | "pending" | "sent" | "failed";
  acknowledgementSentAt: string | null;
  acknowledgementError: string | null;
  submissionCount: number;
  lastSubmittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type OpportunityBriefMutation =
  | { status: OpportunityBriefStatus }
  | { notes: string }
  | { linkedCandidateId: string }
  | { unlink: true };

export type OpportunityBriefFeedback = {
  kind: "status" | "alert";
  message: string;
} | null;

const transitions: Record<OpportunityBriefStatus, readonly OpportunityBriefStatus[]> = {
  submitted: ["submitted", "researching", "rejected"],
  researching: ["researching", "brief_ready", "rejected"],
  brief_ready: ["brief_ready", "researching", "contacted", "rejected"],
  contacted: ["contacted", "invited_to_join", "converted", "rejected"],
  invited_to_join: ["invited_to_join", "contacted", "converted", "rejected"],
  converted: ["converted"],
  rejected: ["rejected", "researching"],
};

const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function label(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded";
  const timestamp = new Date(value);
  return `${String(timestamp.getUTCDate()).padStart(2, "0")} ${
    monthLabels[timestamp.getUTCMonth()]
  } ${timestamp.getUTCFullYear()}, ${String(timestamp.getUTCHours()).padStart(
    2,
    "0",
  )}:${String(timestamp.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function closeDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export function OpportunityBriefDetailDialog({
  request,
  mutationBusy,
  pendingAction,
  feedback,
  onMutate,
  onClose,
}: {
  request: OpportunityBriefDashboardRequest;
  mutationBusy: boolean;
  pendingAction: "status" | "notes" | "link" | "unlink" | null;
  feedback: OpportunityBriefFeedback;
  onMutate: (mutation: OpportunityBriefMutation) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.adminNotes ?? "");
  const [candidateId, setCandidateId] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDialog(dialog);
      onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = priorOverflow;
      closeDialog(dialog);
    };
  }, [onClose]);

  async function submitStatus(event: FormEvent) {
    event.preventDefault();
    await onMutate({ status });
  }

  async function submitNotes(event: FormEvent) {
    event.preventDefault();
    await onMutate({ notes });
  }

  async function submitCandidate(event: FormEvent) {
    event.preventDefault();
    if (await onMutate({ linkedCandidateId: candidateId })) setCandidateId("");
  }

  const title = `${label(request.participantType)} Opportunity Brief`;
  const actionsDisabled = mutationBusy || pendingAction !== null;
  const utmEntries = Object.entries(request.utm).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );

  return (
    <div className={styles.opportunityDialogBackdrop}>
      <dialog
        className={styles.opportunityDialog}
        aria-labelledby="opportunity-brief-dialog-title"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog(dialogRef.current);
          onClose();
        }}
      >
        <div className={styles.opportunityDialogHeader}>
          <div>
            <p className={styles.statusMarker}>Request details</p>
            <h2 id="opportunity-brief-dialog-title">{title}</h2>
          </div>
          <button
            className={styles.discoveryDetailButton}
            type="button"
            aria-label={`Close ${title}`}
            ref={closeButtonRef}
            onClick={() => {
              closeDialog(dialogRef.current);
              onClose();
            }}
          >
            Close
          </button>
        </div>

        <dl className={styles.opportunityDetailGrid}>
          <div><dt>Profile</dt><dd><a href={request.profileUrl} rel="noreferrer" target="_blank">{request.profileUrl}</a></dd></div>
          <div><dt>Participant</dt><dd>{label(request.participantType)}</dd></div>
          <div><dt>Email</dt><dd>{request.email ?? "Not supplied"}</dd></div>
          <div><dt>WhatsApp</dt><dd>{request.phoneNumber ?? "Not supplied"}</dd></div>
          <div><dt>Open to</dt><dd>{request.openToText ?? "Not supplied"}</dd></div>
          <div><dt>Source</dt><dd>{request.source ?? "Not recorded"}</dd></div>
          <div><dt>Status</dt><dd>{label(request.status)}</dd></div>
          <div><dt>Linked candidate</dt><dd>{request.linkedCandidateId ?? "Unlinked"}</dd></div>
          <div><dt>Acknowledgement</dt><dd>{label(request.acknowledgementStatus)}</dd></div>
          <div><dt>Acknowledgement sent</dt><dd>{formatTimestamp(request.acknowledgementSentAt)}</dd></div>
        </dl>

        {request.acknowledgementError ? (
          <p className={styles.error}>Acknowledgement error: {request.acknowledgementError}</p>
        ) : null}

        <section className={styles.opportunityDetailSection} aria-labelledby="opportunity-utm-title">
          <h3 id="opportunity-utm-title">Attribution</h3>
          {utmEntries.length ? (
            <dl className={styles.opportunityDetailGrid}>
              {utmEntries.map(([key, value]) => (
                <div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          ) : <p className={styles.status}>No UTM values were recorded.</p>}
        </section>

        <section className={styles.opportunityDetailSection} aria-labelledby="opportunity-history-title">
          <h3 id="opportunity-history-title">Submission history</h3>
          <p>
            {request.submissionCount} {request.submissionCount === 1 ? "submission" : "submissions"} · first received {formatTimestamp(request.createdAt)} · last received {formatTimestamp(request.lastSubmittedAt)}
          </p>
        </section>

        {feedback ? (
          <p className={feedback.kind === "alert" ? styles.error : styles.status} role={feedback.kind}>
            {feedback.message}
          </p>
        ) : null}

        {mutationBusy && pendingAction === null ? (
          <p className={styles.status} role="status">
            Another update is completing. Mutation controls will be available when it finishes.
          </p>
        ) : null}

        <div className={styles.opportunityActions}>
          <form onSubmit={submitStatus}>
            <label className={styles.field}>
              <span className={styles.label}>Status</span>
              <select disabled={actionsDisabled} value={status} onChange={(event) => setStatus(event.target.value as OpportunityBriefStatus)}>
                {transitions[request.status].map((value) => (
                  <option key={value} value={value}>{label(value)}</option>
                ))}
              </select>
            </label>
            <button className={styles.button} type="submit" disabled={actionsDisabled} aria-label={pendingAction === "status" ? "Saving status" : "Save status"}>
              {pendingAction === "status" ? "Saving…" : "Save status"}
            </button>
          </form>

          <form onSubmit={submitNotes}>
            <label className={styles.field}>
              <span className={styles.label}>Administrator notes</span>
              <textarea className={styles.textarea} disabled={actionsDisabled} value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <button className={styles.button} type="submit" disabled={actionsDisabled} aria-label={pendingAction === "notes" ? "Saving notes" : "Save notes"}>
              {pendingAction === "notes" ? "Saving…" : "Save notes"}
            </button>
          </form>

          <form onSubmit={submitCandidate}>
            <label className={styles.field}>
              <span className={styles.label}>Candidate UUID</span>
              <input
                value={candidateId}
                disabled={actionsDisabled}
                onChange={(event) => setCandidateId(event.target.value)}
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                placeholder="00000000-0000-4000-8000-000000000000"
              />
            </label>
            <div className={styles.opportunityActionRow}>
              <button className={styles.button} type="submit" disabled={actionsDisabled} aria-label={pendingAction === "link" ? "Linking candidate" : "Link candidate"}>
                {pendingAction === "link" ? "Linking…" : "Link candidate"}
              </button>
              <Link href="/admin/discovery">Open Discovery candidates</Link>
            </div>
          </form>

          {request.linkedCandidateId ? (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={actionsDisabled}
              aria-label={pendingAction === "unlink" ? "Unlinking candidate" : "Unlink candidate"}
              onClick={() => void onMutate({ unlink: true })}
            >
              {pendingAction === "unlink" ? "Unlinking…" : "Unlink candidate"}
            </button>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
