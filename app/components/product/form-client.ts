export type FormResponse = {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  nextPath?: string;
  redirectTo?: string;
  message?: string;
  developmentVerifyUrl?: string;
};

export async function postForm(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as FormResponse;
  return { response, result };
}

export function continueTo(path: string) {
  window.location.assign(path);
}
