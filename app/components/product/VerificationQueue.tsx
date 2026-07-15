"use client";

import { FormEvent, useRef, useState } from "react";

import styles from "./product.module.css";

export type VerificationQueueProfile = {
  id: string;
  name: string;
  memberEmail: string;
  organisationName: string | null;
  identityLabel: string;
  domain: string | null;
  primaryUrl: string;
  submittedAt: string | null;
};

export function VerificationQueue({
  profiles,
}: {
  profiles: readonly VerificationQueueProfile[];
}) {
  const [activeProfileId, setActiveProfileId] = useState<string>();
  const [error, setError] = useState<string>();
  const submissionInFlight = useRef(false);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const decision = submitter?.value;
    if (decision !== "verified" && decision !== "waitlisted") return;
    if (submissionInFlight.current) return;

    const formData = new FormData(form);
    const profileId = String(formData.get("profileId") ?? "");
    submissionInFlight.current = true;
    setActiveProfileId(profileId);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/verifications/${profileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes: String(formData.get("notes") ?? ""),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "The review could not be saved.");
        return;
      }
      window.location.reload();
    } catch {
      setError("The review could not be saved.");
    } finally {
      submissionInFlight.current = false;
      setActiveProfileId(undefined);
    }
  }

  if (profiles.length === 0) {
    return <p className={styles.status}>No profiles are awaiting review.</p>;
  }

  return (
    <div className={styles.queue}>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {profiles.map((profile) => {
        const formId = `verification-${profile.id}`;
        return (
          <article className={styles.queueCard} key={profile.id}>
            <div className={styles.queueIdentity}>
              <p>{profile.identityLabel}</p>
              <h2>{profile.name}</h2>
              <span>{profile.organisationName ?? profile.memberEmail}</span>
            </div>
            <dl className={styles.queueEvidence}>
              <div>
                <dt>Domain</dt>
                <dd>{profile.domain ?? "Not supplied"}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>
                  {profile.submittedAt ? (
                    <time dateTime={profile.submittedAt}>
                      {formatUtcTimestamp(profile.submittedAt)}
                    </time>
                  ) : (
                    "Unknown"
                  )}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  <a href={profile.primaryUrl} rel="noreferrer" target="_blank">
                    Open submitted source
                  </a>
                </dd>
              </div>
            </dl>
            <form id={formId} className={styles.reviewForm} onSubmit={submitReview}>
              <input type="hidden" name="profileId" value={profile.id} />
              <label className={styles.field}>
                <span className={styles.label}>Review notes (optional)</span>
                <textarea className={styles.textarea} name="notes" maxLength={1000} />
              </label>
              <div className={styles.reviewActions}>
                <button
                  className={styles.button}
                  type="submit"
                  name="decision"
                  value="verified"
                  aria-label={`Approve ${profile.name}`}
                  disabled={activeProfileId !== undefined}
                >
                  Approve
                </button>
                <button
                  className={styles.secondaryButton}
                  type="submit"
                  name="decision"
                  value="waitlisted"
                  aria-label={`Waitlist ${profile.name}`}
                  disabled={activeProfileId !== undefined}
                >
                  Waitlist
                </button>
              </div>
            </form>
          </article>
        );
      })}
    </div>
  );
}

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatUtcTimestamp(value: string): string {
  const timestamp = new Date(value);
  const day = String(timestamp.getUTCDate()).padStart(2, "0");
  const month = monthLabels[timestamp.getUTCMonth()];
  const year = timestamp.getUTCFullYear();
  const hours = String(timestamp.getUTCHours()).padStart(2, "0");
  const minutes = String(timestamp.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}
