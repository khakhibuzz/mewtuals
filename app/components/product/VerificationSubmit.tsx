"use client";

import { FormEvent } from "react";

import { FormSubmissionAlert } from "./FormSubmissionAlert";
import styles from "./product.module.css";
import { useProductSubmission } from "./useProductSubmission";

export function VerificationSubmit({ profileName }: { profileName: string }) {
  const {
    generalError,
    sessionExpired,
    submit: submitForm,
    submitting,
  } = useProductSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitForm("/api/verification/submit", {});
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.status}>
        Submit <strong>{profileName}</strong> for a private Mewtuals review. Your
        public profile remains hidden while we review it.
      </p>
      <FormSubmissionAlert
        message={generalError}
        sessionExpired={sessionExpired}
      />
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit for verification"}
      </button>
    </form>
  );
}
