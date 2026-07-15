"use client";

import { FormEvent, useState } from "react";

import {
  availabilityValues,
  openToInterests,
  type Availability,
  type OpenToInterest,
} from "../../domain/signal";
import type { DashboardSignal } from "../../server/dashboard-service";
import { FormSubmissionAlert } from "./FormSubmissionAlert";
import { postForm } from "./form-client";
import styles from "./product.module.css";

const availabilityLabels: Record<Availability, string> = {
  open_now: "Open now",
  open_selectively: "Open selectively",
  not_available: "Not available right now",
};

const interestLabels: Record<OpenToInterest, string> = {
  media_interviews: "Media interviews",
  podcasts: "Podcasts",
  creator_collaborations: "Creator collaborations",
  brand_collaborations: "Brand collaborations",
  product_reviews: "Product reviews",
  founder_stories: "Founder stories",
  distribution_partnerships: "Distribution partnerships",
  co_marketing: "Co-marketing",
};

const requestFailureMessage =
  "We could not complete that request. Try again.";
const expiredSessionMessage = "Your session expired. Sign in to continue.";

export function SignalForm({
  signal,
  onSaved,
}: {
  signal: DashboardSignal | null;
  onSaved?: () => void;
}) {
  const [availability, setAvailability] = useState<Availability>(
    signal?.availability ?? "open_now",
  );
  const [openTo, setOpenTo] = useState<OpenToInterest[]>(
    signal?.openTo ?? [],
  );
  const [notes, setNotes] = useState(signal?.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function toggleInterest(interest: OpenToInterest) {
    setFieldErrors((current) => ({ ...current, openTo: "" }));
    setOpenTo((current) =>
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setGeneralError(undefined);
    setSessionExpired(false);
    try {
      const { response, result } = await postForm("/api/signal", {
        availability,
        openTo,
        notes,
      });
      if (response.status === 401) {
        setGeneralError(expiredSessionMessage);
        setSessionExpired(true);
        return;
      }
      if (result.errors) {
        setFieldErrors(result.errors);
        return;
      }
      if (!response.ok || result.error) {
        setGeneralError(result.error ?? requestFailureMessage);
        return;
      }
      if (onSaved) onSaved();
      else window.location.reload();
    } catch {
      setGeneralError(requestFailureMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const interestsErrorId = fieldErrors.openTo ? "open-to-error" : undefined;

  return (
    <form className={styles.signalForm} onSubmit={submit}>
      <fieldset className={styles.signalFieldset}>
        <legend className={styles.legend}>Current availability</legend>
        <div className={styles.inlineChoices}>
          {availabilityValues.map((value) => (
            <label className={styles.compactChoice} key={value}>
              <input
                type="radio"
                name="availability"
                value={value}
                checked={availability === value}
                onChange={() => setAvailability(value)}
              />
              <span>{availabilityLabels[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset
        className={styles.signalFieldset}
        aria-describedby={interestsErrorId}
      >
        <legend className={styles.legend}>Partnership interests</legend>
        <div className={styles.interestGrid}>
          {openToInterests.map((interest) => (
            <label className={styles.compactChoice} key={interest}>
              <input
                type="checkbox"
                name="openTo"
                value={interest}
                checked={openTo.includes(interest)}
                onChange={() => toggleInterest(interest)}
              />
              <span>{interestLabels[interest]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.openTo ? (
          <p className={styles.error} id="open-to-error">
            {fieldErrors.openTo}
          </p>
        ) : null}
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>A useful note (optional)</span>
        <textarea
          className={styles.textarea}
          name="notes"
          value={notes}
          maxLength={500}
          aria-invalid={Boolean(fieldErrors.notes)}
          aria-describedby={fieldErrors.notes ? "signal-notes-error" : undefined}
          onChange={(event) => {
            setNotes(event.target.value);
            setFieldErrors((current) => ({ ...current, notes: "" }));
          }}
        />
      </label>
      {fieldErrors.notes ? (
        <p className={styles.error} id="signal-notes-error">
          {fieldErrors.notes}
        </p>
      ) : null}

      <FormSubmissionAlert
        message={generalError}
        sessionExpired={sessionExpired}
      />
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save my signal"}
      </button>
    </form>
  );
}
