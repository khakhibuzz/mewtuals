"use client";

import { FormEvent, useState } from "react";

import styles from "./product.module.css";
import { continueTo, postForm } from "./form-client";

type ProfileDraftView = {
  name: string;
  organisationName: string;
  domain: string;
  identityLabel: string;
  primaryUrl: string;
};

type ProfileConfirmFormProps = {
  draft: ProfileDraftView;
  initialErrors?: Record<string, string>;
};

export function ProfileConfirmForm({
  draft,
  initialErrors = {},
}: ProfileConfirmFormProps) {
  const [name, setName] = useState(draft.name);
  const [organisationName, setOrganisationName] = useState(draft.organisationName);
  const [domain, setDomain] = useState(draft.domain);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState(initialErrors);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const { result } = await postForm("/api/onboarding/profile", {
      name,
      organisationName,
      domain,
      confirmed,
    });
    setSubmitting(false);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    const destination = result.nextPath ?? result.redirectTo;
    if (destination) continueTo(destination);
  }

  const textField = (
    field: "name" | "organisationName" | "domain",
    label: string,
    value: string,
    setValue: (value: string) => void,
  ) => (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={field}>
        {label}
      </label>
      <input
        className={styles.input}
        id={field}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `${field}-error` : undefined}
        required={field !== "organisationName"}
      />
      {errors[field] ? (
        <p className={styles.error} id={`${field}-error`}>
          {errors[field]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <dl className={styles.summary}>
        <dt>Identity</dt>
        <dd>{draft.identityLabel}</dd>
        <dt>Evidence source</dt>
        <dd>{draft.primaryUrl}</dd>
      </dl>
      {textField("name", "Display name", name, setName)}
      {textField(
        "organisationName",
        "Organisation or creator name",
        organisationName,
        setOrganisationName,
      )}
      {textField("domain", "Canonical domain", domain, setDomain)}
      <label className={styles.confirmation}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          aria-describedby={errors.confirmed ? "confirmed-error" : undefined}
          required
        />
        I confirm this profile is accurate and based on my submitted sources.
      </label>
      {errors.confirmed ? (
        <p className={styles.error} id="confirmed-error">
          {errors.confirmed}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Confirming…" : "Confirm profile"}
      </button>
    </form>
  );
}
