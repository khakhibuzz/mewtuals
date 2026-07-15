"use client";

import { useState } from "react";

import { continueTo, postForm } from "./form-client";

const requestFailureMessage =
  "We could not complete that request. Try again.";
const expiredSessionMessage = "Your session expired. Sign in to continue.";

export function useProductSubmission(
  initialErrors: Record<string, string> = {},
) {
  const [fieldErrors, setFieldErrors] = useState(initialErrors);
  const [generalError, setGeneralError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  };

  const clearFieldErrors = () => setFieldErrors({});

  async function submit(path: string, body: Record<string, unknown>) {
    setSubmitting(true);
    setGeneralError(undefined);
    setSessionExpired(false);

    try {
      const { response, result } = await postForm(path, body);
      if (response.status === 401) {
        setGeneralError(expiredSessionMessage);
        setSessionExpired(true);
        return;
      }
      if (result.errors) {
        setFieldErrors(result.errors);
        return;
      }

      const destination = result.nextPath ?? result.redirectTo;
      if (destination) {
        continueTo(destination);
        return;
      }
      if (!response.ok || result.error) {
        setGeneralError(result.error ?? requestFailureMessage);
        return;
      }

      setGeneralError(requestFailureMessage);
    } catch {
      setGeneralError(requestFailureMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    clearFieldError,
    clearFieldErrors,
    fieldErrors,
    generalError,
    sessionExpired,
    submit,
    submitting,
  };
}
