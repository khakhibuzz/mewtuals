"use client";

import { FormEvent, useState } from "react";

import styles from "./product.module.css";
import { postForm } from "./form-client";

export function MagicLinkForm({ mode }: { mode: "join" | "login" }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [verifyUrl, setVerifyUrl] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const buttonLabel = mode === "join" ? "Join Mewtuals" : "Send sign-in link";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setMessage(undefined);
    setVerifyUrl(undefined);

    try {
      const { response, result } = await postForm("/api/auth/magic-link", { email });
      if (!response.ok) {
        setError(result.error ?? "We could not send the link. Try again.");
        return;
      }
      setMessage(result.message ?? "Check your email for a sign-in link.");
      setVerifyUrl(result.developmentVerifyUrl);
    } catch {
      setError("We could not send the link. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Email address
        </label>
        <input
          className={styles.input}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "email-error" : undefined}
          required
        />
        {error ? (
          <p className={styles.error} id="email-error">
            {error}
          </p>
        ) : null}
      </div>
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Sending…" : buttonLabel}
      </button>
      {message ? (
        <p className={styles.status} role="status">
          {message}
          {verifyUrl ? (
            <>
              {" "}
              <a href={verifyUrl}>Open local sign-in link</a>.
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
