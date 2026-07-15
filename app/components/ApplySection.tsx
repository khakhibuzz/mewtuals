"use client";

import { FormEvent, type Ref, useEffect, useRef, useState } from "react";
import {
  ApplicationErrors,
  ApplicationInput,
  ApplicationSubmitter,
  prototypeSubmitter,
  validateApplication,
} from "../lib/application";

type ApplySectionProps = {
  submitApplication?: ApplicationSubmitter;
};

const EMPTY_APPLICATION: ApplicationInput = {
  companyUrl: "",
  workEmail: "",
  phone: "",
};

export function ApplySection({
  submitApplication = prototypeSubmitter,
}: ApplySectionProps) {
  const [values, setValues] = useState<ApplicationInput>(EMPTY_APPLICATION);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const companyUrlRef = useRef<HTMLInputElement>(null);
  const focusAfterResetRef = useRef(false);

  useEffect(() => {
    if (status !== "idle" || !focusAfterResetRef.current) return;

    focusAfterResetRef.current = false;
    companyUrlRef.current?.focus();
  }, [status]);

  function updateField(field: keyof ApplicationInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateApplication(values);

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("idle");
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return;
    }

    setErrors({});
    setStatus("submitting");
    try {
      await submitApplication(result.value);
      setStatus("success");
      queueMicrotask(() => successHeadingRef.current?.focus());
    } catch {
      setStatus("error");
      queueMicrotask(() => errorSummaryRef.current?.focus());
    }
  }

  function resetApplication() {
    focusAfterResetRef.current = true;
    setValues(EMPTY_APPLICATION);
    setErrors({});
    setStatus("idle");
  }

  if (status === "success") {
    return (
      <section className="apply-section site-section" id="apply">
        <div className="application-success">
          <p className="section-label">Application ready</p>
          <h2 ref={successHeadingRef} tabIndex={-1}>
            The introduction is the easy part. Understanding comes first.
          </h2>
          <p>Prototype mode — your information was not sent.</p>
          <div className="application-success-actions">
            <a className="primary-button" href="/join">
              Continue to Mewtuals
            </a>
            <button className="text-button" onClick={resetApplication} type="button">
              Try another application
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="apply-section site-section" id="apply">
      <div className="apply-intro">
        <p className="section-label">Apply</p>
        <h2>Put Mewtuals on your company’s side.</h2>
        <p>No deck required. We start with the company itself.</p>
      </div>

      <form className="application-form" noValidate onSubmit={handleSubmit}>
        {(Object.keys(errors).length > 0 || status === "error") && (
          <div className="form-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}>
            {status === "error" ? (
              "The prototype could not prepare this application. Try again."
            ) : (
              <>
                <p>Complete the three required details.</p>
                <ul>
                  {Object.entries(errors).map(([field, message]) => (
                    <li key={field}>{message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <ApplicationField
          autoComplete="url"
          error={errors.companyUrl}
          id="company-url"
          inputRef={companyUrlRef}
          label="Company URL"
          onChange={(value) => updateField("companyUrl", value)}
          placeholder="yourcompany.com"
          type="url"
          value={values.companyUrl}
        />
        <ApplicationField
          autoComplete="email"
          error={errors.workEmail}
          id="work-email"
          label="Work email"
          onChange={(value) => updateField("workEmail", value)}
          placeholder="you@yourcompany.com"
          type="email"
          value={values.workEmail}
        />
        <ApplicationField
          autoComplete="tel"
          error={errors.phone}
          id="phone-number"
          label="Phone number"
          onChange={(value) => updateField("phone", value)}
          placeholder="+91 98765 43210"
          type="tel"
          value={values.phone}
        />

        <button className="primary-button" disabled={status === "submitting"} type="submit">
          {status === "submitting" ? "Preparing…" : "Apply for representation"}
        </button>
        <p className="form-note">Three details. A human review. No automated sequence.</p>
      </form>
    </section>
  );
}

type ApplicationFieldProps = {
  autoComplete: string;
  error?: string;
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: "email" | "tel" | "url";
  value: string;
};

function ApplicationField({
  autoComplete,
  error,
  id,
  inputRef,
  label,
  onChange,
  placeholder,
  type,
  value,
}: ApplicationFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="application-field">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        autoComplete={autoComplete}
        id={id}
        ref={inputRef}
        name={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
