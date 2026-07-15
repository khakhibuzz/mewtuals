"use client";

import { FormEvent, useState } from "react";

import type { IdentityKind } from "../../domain/identity";
import styles from "./product.module.css";
import { continueTo, postForm } from "./form-client";

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
  const [errors, setErrors] = useState(initialErrors);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: string, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const { result } = await postForm("/api/onboarding/source", {
      kind: identityKind,
      ...values,
    });
    setSubmitting(false);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    const destination = result.nextPath ?? result.redirectTo;
    if (destination) continueTo(destination);
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
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Understanding…" : "Build my profile"}
      </button>
    </form>
  );
}
