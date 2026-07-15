"use client";

import { FormEvent, useState } from "react";

import type { IdentityKind } from "../../domain/identity";
import { FormSubmissionAlert } from "./FormSubmissionAlert";
import styles from "./product.module.css";
import { useProductSubmission } from "./useProductSubmission";

type SourceFormProps = {
  identityKind: IdentityKind;
  initialValues?: Record<string, string | undefined>;
  initialErrors?: Record<string, string>;
};

export function SourceForm({
  identityKind,
  initialValues = {},
  initialErrors = {},
}: SourceFormProps) {
  const [values, setValues] = useState(initialValues);
  const {
    clearFieldError,
    fieldErrors: errors,
    generalError,
    sessionExpired,
    submit: submitForm,
    submitting,
  } = useProductSubmission(initialErrors);

  const update = (field: string, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitForm("/api/onboarding/source", {
      kind: identityKind,
      ...values,
    });
  }

  const field = (
    name: string,
    label: string,
    type: "url" | "email",
    required: boolean,
  ) => (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={name}>
        {label}
      </label>
      <input
        className={styles.input}
        id={name}
        name={name}
        type={type}
        value={values[name] ?? ""}
        onChange={(event) => update(name, event.target.value)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        required={required}
      />
      {errors[name] ? (
        <p className={styles.error} id={`${name}-error`}>
          {errors[name]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {identityKind === "organisation" ? (
        <>
          {field("websiteUrl", "Website", "url", true)}
          {field("linkedInUrl", "LinkedIn (optional)", "url", false)}
        </>
      ) : (
        <>
          {field("primaryUrl", "Primary profile URL", "url", true)}
          {field("businessEmail", "Business email (optional)", "email", false)}
        </>
      )}
      <FormSubmissionAlert
        message={generalError}
        sessionExpired={sessionExpired}
      />
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Understanding…" : "Build my profile"}
      </button>
    </form>
  );
}
