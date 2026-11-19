export function createFormSubmissionRequest(endpoint: string) {
  let attempt: { body: string; key: string } | undefined;

  return {
    send(value: unknown): Promise<Response> {
      const body = JSON.stringify(value);
      if (!attempt || attempt.body !== body) {
        attempt = { body, key: crypto.randomUUID() };
      }
      return fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body,
      });
    },

    reset(): void {
      attempt = undefined;
    },
  };
}
