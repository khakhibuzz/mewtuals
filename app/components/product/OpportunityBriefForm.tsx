"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { opportunityBriefInputSchema } from "../../domain/opportunity-brief";
import { createFormSubmissionRequest } from "../../lib/form-submission-request";
import { useHydrated } from "../../lib/use-hydrated";
import styles from "./product.module.css";

export type OpportunityBriefTracking = {
  source?: string;
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
};

type Submission = {
  participantType: "company" | "creator";
  profileUrl: string;
  email: string | null;
  phoneNumber: string | null;
  openToText: string | null;
  source: string | null;
  utm: OpportunityBriefTracking["utm"];
};

type PublicResult =
  | { ok: true; submission: Submission }
  | {
      ok: false;
      error?: string;
      errors?: Record<string, string>;
    };

type Values = {
  participantType: "company" | "creator";
  profileUrl: string;
  email: string;
  phoneNumber: string;
  openToText: string;
  website: string;
};

const initialValues: Values = {
  participantType: "company",
  profileUrl: "",
  email: "",
  phoneNumber: "",
  openToText: "",
  website: "",
};

function fieldErrors(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

export function OpportunityBriefForm({
  tracking,
}: {
  tracking: OpportunityBriefTracking;
}) {
  const hydrated = useHydrated();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>();
  const [errorFocusVersion, setErrorFocusVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<Submission>();
  const submissionRequest = useRef(
    createFormSubmissionRequest("/api/opportunity-briefs"),
  );
  const errorSummary = useRef<HTMLDivElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (errorFocusVersion > 0) errorSummary.current?.focus();
  }, [errorFocusVersion]);

  useEffect(() => {
    if (submission) successHeading.current?.focus();
  }, [submission]);

  function update<Key extends keyof Values>(field: Key, value: Values[Key]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneralError(undefined);

    const body = {
      ...values,
      source: tracking.source,
      utm: tracking.utm,
    };
    const parsed = opportunityBriefInputSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setGeneralError("Review the fields below.");
      setErrorFocusVersion((current) => current + 1);
      return;
    }

    setSubmitting(true);
    try {
      const response = await submissionRequest.current.send(body);
      const result = (await response.json().catch(() => ({}))) as PublicResult;
      if (!response.ok || !result.ok) {
        setErrors(result.ok ? {} : (result.errors ?? {}));
        setGeneralError(
          result.ok
            ? "We could not save your request. Please try again."
            : (result.error ??
              "We could not save your request. Please try again."),
        );
        setErrorFocusVersion((current) => current + 1);
        return;
      }
      setSubmission(result.submission);
    } catch {
      setGeneralError("We could not save your request. Please try again.");
      setErrorFocusVersion((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (submission) {
    return (
      <section
        className={styles.opportunitySuccess}
        aria-labelledby="opportunity-success-heading"
      >
        <h2
          className={styles.opportunitySuccessTitle}
          id="opportunity-success-heading"
          ref={successHeading}
          tabIndex={-1}
        >
          You’re on our research list.
        </h2>
        <p>
          We’ll study your profile and look for three partnerships worth
          exploring. Strong matches may also receive an invitation to join the
          verified Mewtuals network.
        </p>
        <dl className={styles.opportunityConfirmation}>
          <div>
            <dt>Profile</dt>
            <dd>
              <a href={submission.profileUrl}>{submission.profileUrl}</a>
            </dd>
          </div>
          {submission.email ? (
            <div>
              <dt>Email</dt>
              <dd>{submission.email}</dd>
            </div>
          ) : null}
          {submission.phoneNumber ? (
            <div>
              <dt>WhatsApp</dt>
              <dd>{submission.phoneNumber}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    );
  }

  const describedBy = (field: keyof Values) =>
    errors[field] ? `${field}-error` : undefined;

  return (
    <form className={styles.form} method="post" onSubmit={submit} noValidate>
      <fieldset className={styles.choices}>
        <legend className={styles.legend}>I’m joining as</legend>
        <label className={styles.choice}>
          <input
            disabled={!hydrated}
            type="radio"
            name="participantType"
            value="company"
            checked={values.participantType === "company"}
            onChange={() => update("participantType", "company")}
          />
          Company / Startup / Brand
        </label>
        <label className={styles.choice}>
          <input
            disabled={!hydrated}
            type="radio"
            name="participantType"
            value="creator"
            checked={values.participantType === "creator"}
            onChange={() => update("participantType", "creator")}
          />
          Creator / Podcaster / Media
        </label>
      </fieldset>

      <OpportunityField
        id="profileUrl"
        label="Public profile URL"
        error={errors.profileUrl}
      >
        <input
          disabled={!hydrated}
          className={styles.input}
          id="profileUrl"
          name="profileUrl"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.profileUrl}
          onChange={(event) => update("profileUrl", event.target.value)}
          aria-invalid={Boolean(errors.profileUrl)}
          aria-describedby={describedBy("profileUrl")}
          required
        />
      </OpportunityField>

      <OpportunityField
        id="email"
        label="Email address (optional)"
        error={errors.email}
      >
        <input
          disabled={!hydrated}
          className={styles.input}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => update("email", event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email")}
        />
      </OpportunityField>

      <OpportunityField
        id="phoneNumber"
        label="WhatsApp number (optional)"
        error={errors.phoneNumber}
      >
        <input
          disabled={!hydrated}
          className={styles.input}
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={values.phoneNumber}
          onChange={(event) => update("phoneNumber", event.target.value)}
          aria-invalid={Boolean(errors.phoneNumber)}
          aria-describedby={describedBy("phoneNumber")}
        />
      </OpportunityField>

      <OpportunityField
        id="openToText"
        label="What are you open to? (optional)"
        error={errors.openToText}
      >
        <textarea
          disabled={!hydrated}
          className={styles.textarea}
          id="openToText"
          name="openToText"
          rows={4}
          value={values.openToText}
          onChange={(event) => update("openToText", event.target.value)}
          aria-invalid={Boolean(errors.openToText)}
          aria-describedby={describedBy("openToText")}
        />
      </OpportunityField>

      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          disabled={!hydrated}
          id="website"
          name="website"
          type="text"
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
        />
      </div>

      {generalError ? (
        <div
          className={styles.opportunityErrorSummary}
          ref={errorSummary}
          role="alert"
          tabIndex={-1}
        >
          <p>{generalError}</p>
          {Object.values(errors).some(Boolean) ? (
            <ul>
              {Object.entries(errors).map(([field, message]) =>
                message ? <li key={field}>{message}</li> : null,
              )}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button className={styles.button} type="submit" disabled={!hydrated || submitting}>
        {submitting ? "Submitting…" : "Get my opportunity brief"}
      </button>
      <p className={styles.opportunityTrustLine}>
        No login. No deck. We start with what is already public.
      </p>
    </form>
  );
}

function OpportunityField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
