"use client";

import { FormEvent, useState } from "react";

import styles from "./product.module.css";
import { continueTo, postForm } from "./form-client";

export function VerificationSubmit({ profileName }: { profileName: string }) {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const { response, result } = await postForm("/api/verification/submit", {});
    setSubmitting(false);
    const destination = result.nextPath ?? result.redirectTo;
    if (destination) {
      continueTo(destination);
      return;
    }
    if (!response.ok) setError(result.error ?? "Could not submit for verification.");
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.status}>
        Submit <strong>{profileName}</strong> for a private Mewtuals review. Your
        public profile remains hidden while we review it.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit for verification"}
      </button>
    </form>
  );
}
