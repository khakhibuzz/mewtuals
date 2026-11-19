"use client";

import { FormEvent, type Ref, useEffect, useRef, useState } from "react";
import type {
  ApplicationErrors,
  ApplicationInput,
  ApplicationSubmitter,
} from "../lib/application";
import { applicationInputSchema } from "../domain/application";
import { createFormSubmissionRequest } from "../lib/form-submission-request";
import { useHydrated } from "../lib/use-hydrated";

type ApplicationResponse = {
  ok?: boolean;
  error?: string;
  errors?: ApplicationErrors;
};

const SUBMISSION_ERROR = "We could not send your application. Please try again.";

type ApplySectionProps = {
  submitApplication?: ApplicationSubmitter;
};

const EMPTY_APPLICATION: ApplicationInput = {
  companyUrl: "",
  workEmail: "",
  phone: "",
};

export function ApplySection({
  submitApplication,
}: ApplySectionProps) {
  const hydrated = useHydrated();
  const [values, setValues] = useState<ApplicationInput>(EMPTY_APPLICATION);
  const [website, setWebsite] = useState("");
  const [errorMessage, setErrorMessage] = useState(SUBMISSION_ERROR);
  const [errorFocusVersion, setErrorFocusVersion] = useState(0);
  const submissionRequest = useRef(
    createFormSubmissionRequest("/api/applications"),
  );
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

  useEffect(() => {
    if (status === "success") successHeadingRef.current?.focus();
  }, [status]);

  useEffect(() => {
    if (errorFocusVersion > 0) errorSummaryRef.current?.focus();
  }, [errorFocusVersion]);

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
    const result = applicationInputSchema.safeParse({ ...values, website });

    if (!result.success) {
      const fieldErrors: ApplicationErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === "companyUrl" || field === "workEmail" || field === "phone") {
          fieldErrors[field] ??= issue.message;
        }
      }
      if (website) {
        setErrorMessage("Please review your application.");
        setStatus("error");
        setErrorFocusVersion((current) => current + 1);
        return;
      }
      setErrors(fieldErrors);
      setStatus("idle");
      setErrorFocusVersion((current) => current + 1);
      return;
    }

    setErrors({});
    setStatus("submitting");
    try {
      if (submitApplication) {
        await submitApplication({
          companyUrl: result.data.companyUrl,
          workEmail: result.data.workEmail,
          phone: result.data.phone,
        });
      } else {
        const response = await submissionRequest.current.send(result.data);
        const outcome = (await response.json().catch(() => ({}))) as ApplicationResponse;
        if (!response.ok || outcome.ok !== true) {
          setErrors(outcome.errors ?? {});
          setErrorMessage(typeof outcome.error === "string" ? outcome.error : SUBMISSION_ERROR);
          setStatus("error");
          setErrorFocusVersion((current) => current + 1);
          return;
        }
      }
      setStatus("success");
    } catch {
      setErrorMessage(SUBMISSION_ERROR);
      setStatus("error");
      setErrorFocusVersion((current) => current + 1);
    }
  }

  function resetApplication() {
    focusAfterResetRef.current = true;
    setValues(EMPTY_APPLICATION);
    setWebsite("");
    submissionRequest.current.reset();
    setErrors({});
    setStatus("idle");
  }

  if (status === "success") {
    return (
      <section className="apply-section site-section" id="apply">
        <div className="application-success">
          <p className="section-label">Application</p>
          <h2 ref={successHeadingRef} tabIndex={-1}>
            Application received
          </h2>
          <p>Your application has been sent to Keshav. We’ll be in touch.</p>
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

      <form className="application-form" method="post" noValidate onSubmit={handleSubmit}>
        {(Object.keys(errors).length > 0 || status === "error") && (
          <div className="form-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}>
            {status === "error" ? (
              errorMessage
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
          disabled={!hydrated}
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
          disabled={!hydrated}
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
          disabled={!hydrated}
          autoComplete="tel"
          error={errors.phone}
          id="phone-number"
          label="Phone number"
          onChange={(value) => updateField("phone", value)}
          placeholder="+91 98765 43210"
          type="tel"
          value={values.phone}
        />

        <input
          aria-hidden="true"
          autoComplete="off"
          disabled={!hydrated}
          hidden
          name="website"
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          value={website}
        />
        <button className="primary-button" disabled={!hydrated || status === "submitting"} type="submit">
          {status === "submitting" ? "Sending…" : "Apply for representation"}
        </button>
        <p className="form-note">Three details. A human review. No automated sequence.</p>
      </form>
    </section>
  );
}

type ApplicationFieldProps = {
  disabled: boolean;
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
  disabled,
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
        disabled={disabled}
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
