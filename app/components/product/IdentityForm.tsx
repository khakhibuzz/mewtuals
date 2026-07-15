"use client";

import { FormEvent, useState } from "react";

import type { IdentityKind } from "../../domain/identity";
import styles from "./product.module.css";
import { continueTo, postForm } from "./form-client";

const subtypeOptions = {
  organisation: [
    ["company", "Company"],
    ["brand", "Brand"],
    ["startup", "Startup"],
    ["distribution_partner", "Distribution partner"],
  ],
  creator: [
    ["creator", "Creator"],
    ["podcaster", "Podcaster"],
    ["publication", "Publication"],
    ["media_operator", "Media operator"],
  ],
} as const;

type IdentityFormProps = {
  initialValues?: { kind?: string; subtype?: string };
  initialErrors?: Record<string, string>;
};

export function IdentityForm({
  initialValues,
  initialErrors = {},
}: IdentityFormProps = {}) {
  const initialKind = initialValues?.kind === "creator" ? "creator" : "organisation";
  const [kind, setKind] = useState<IdentityKind>(initialKind);
  const [subtype, setSubtype] = useState(
    initialValues?.subtype ?? subtypeOptions[initialKind][0][0],
  );
  const [errors, setErrors] = useState(initialErrors);
  const [submitting, setSubmitting] = useState(false);

  function chooseKind(nextKind: IdentityKind) {
    setKind(nextKind);
    setSubtype(subtypeOptions[nextKind][0][0]);
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const { result } = await postForm("/api/onboarding/identity", { kind, subtype });
    setSubmitting(false);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    const destination = result.nextPath ?? result.redirectTo;
    if (destination) continueTo(destination);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.choices}>
        <legend className={styles.legend}>I am joining as</legend>
        {(["organisation", "creator"] as const).map((value) => (
          <label className={styles.choice} key={value}>
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => chooseKind(value)}
            />
            {value === "organisation" ? "Organisation" : "Creator"}
          </label>
        ))}
      </fieldset>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="subtype">
          Which best describes you?
        </label>
        <select
          className={styles.select}
          id="subtype"
          value={subtype}
          onChange={(event) => setSubtype(event.target.value)}
          aria-invalid={Boolean(errors.subtype)}
          aria-describedby={errors.subtype ? "subtype-error" : undefined}
        >
          {subtypeOptions[kind].map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        {errors.subtype ? (
          <p className={styles.error} id="subtype-error">
            {errors.subtype}
          </p>
        ) : null}
      </div>
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
