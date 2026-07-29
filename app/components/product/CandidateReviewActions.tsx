"use client";

import { useRef, useState } from "react";

import styles from "./product.module.css";

export type CandidateReviewStatus =
  | "discovered"
  | "shortlisted"
  | "rejected"
  | "queued_for_profile";

export type CandidateReviewUpdatedCandidate = {
  id: string;
  type: "company" | "creator";
  name: string;
  canonicalUrl: string;
  websiteUrl: string | null;
  primarySocialUrl: string | null;
  linkedinUrl: string | null;
  discoveredDescription: string;
  category: string;
  subcategory: string | null;
  geography: string;
  firstSourceName: string;
  firstSourceUrl: string;
  discoveredAt: string;
  lastSeenAt: string;
  updatedAt: string;
  discoveryScore: number;
  status: CandidateReviewStatus;
};

export type CandidateReviewUpdate = {
  candidateId: string;
  pending: boolean;
  candidate?: CandidateReviewUpdatedCandidate;
};

type Feedback = {
  kind: "status" | "alert";
  message: string;
};

const actions = [
  { status: "shortlisted" as const, text: "Shortlist" },
  { status: "rejected" as const, text: "Reject" },
  { status: "queued_for_profile" as const, text: "Queue for profile" },
];

function statusLabel(value: CandidateReviewStatus): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionLabel(status: CandidateReviewStatus, candidateName: string): string {
  if (status === "shortlisted") return `Shortlist ${candidateName}`;
  if (status === "rejected") return `Reject ${candidateName}`;
  return `Queue ${candidateName} for profile`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function candidateFromResponse(
  value: unknown,
): CandidateReviewUpdatedCandidate | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const status = value.status;
  if (
    (type !== "company" && type !== "creator") ||
    typeof status !== "string" ||
    !["discovered", "shortlisted", "rejected", "queued_for_profile"].includes(
      status,
    ) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.canonicalUrl !== "string" ||
    !nullableString(value.websiteUrl) ||
    !nullableString(value.primarySocialUrl) ||
    !nullableString(value.linkedinUrl) ||
    typeof value.discoveredDescription !== "string" ||
    typeof value.category !== "string" ||
    !nullableString(value.subcategory) ||
    typeof value.geography !== "string" ||
    typeof value.firstSourceName !== "string" ||
    typeof value.firstSourceUrl !== "string" ||
    typeof value.discoveredAt !== "string" ||
    typeof value.lastSeenAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.discoveryScore !== "number" ||
    !Number.isInteger(value.discoveryScore) ||
    value.discoveryScore < 0 ||
    value.discoveryScore > 100
  ) {
    return null;
  }
  return {
    id: value.id,
    type,
    name: value.name,
    canonicalUrl: value.canonicalUrl,
    websiteUrl: value.websiteUrl,
    primarySocialUrl: value.primarySocialUrl,
    linkedinUrl: value.linkedinUrl,
    discoveredDescription: value.discoveredDescription,
    category: value.category,
    subcategory: value.subcategory,
    geography: value.geography,
    firstSourceName: value.firstSourceName,
    firstSourceUrl: value.firstSourceUrl,
    discoveredAt: value.discoveredAt,
    lastSeenAt: value.lastSeenAt,
    updatedAt: value.updatedAt,
    discoveryScore: value.discoveryScore,
    status: status as CandidateReviewStatus,
  };
}

function responseError(error: unknown): string {
  return typeof error === "string" && error.trim()
    ? error
    : "The candidate status could not be saved.";
}

export function CandidateReviewActions({
  candidateId,
  candidateName,
  status,
  updatedAt,
  disabled = false,
  onUpdated,
}: {
  candidateId: string;
  candidateName: string;
  status: CandidateReviewStatus;
  updatedAt: string;
  disabled?: boolean;
  onUpdated: (update: CandidateReviewUpdate) => void;
}) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function updateStatus(nextStatus: CandidateReviewStatus) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFeedback(undefined);
    onUpdated({ candidateId, pending: true });
    try {
      const response = await fetch(
        `/api/admin/discovery/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, expectedUpdatedAt: updatedAt }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        candidate?: unknown;
      };
      const latest = candidateFromResponse(result.candidate);
      if (response.status === 409 && latest?.id === candidateId) {
        onUpdated({ candidateId, pending: true, candidate: latest });
        setFeedback({
          kind: "alert",
          message: `${candidateName} changed elsewhere. Latest status is ${statusLabel(latest.status).toLowerCase()}. Review and try again.`,
        });
        return;
      }
      if (!response.ok) {
        setFeedback({ kind: "alert", message: responseError(result.error) });
        return;
      }
      if (!latest || latest.id !== candidateId) {
        setFeedback({
          kind: "alert",
          message: "The candidate status response could not be verified.",
        });
        return;
      }
      onUpdated({ candidateId, pending: true, candidate: latest });
      setFeedback({
        kind: "status",
        message: `${latest.name} is now ${statusLabel(latest.status).toLowerCase()}.`,
      });
    } catch {
      setFeedback({
        kind: "alert",
        message: "The candidate status could not be saved.",
      });
    } finally {
      inFlight.current = false;
      setPending(false);
      onUpdated({ candidateId, pending: false });
    }
  }

  return (
    <>
      {feedback ? (
        <p
          className={feedback.kind === "alert" ? styles.error : styles.status}
          role={feedback.kind}
        >
          {feedback.message}
        </p>
      ) : null}
      <div className={styles.discoveryStatusActions}>
        {actions.map((action) => (
          <button
            className={
              action.status === "shortlisted"
                ? styles.button
                : styles.secondaryButton
            }
            type="button"
            key={action.status}
            aria-label={actionLabel(action.status, candidateName)}
            disabled={disabled || pending || status === action.status}
            onClick={() => updateStatus(action.status)}
          >
            {action.text}
          </button>
        ))}
      </div>
    </>
  );
}
