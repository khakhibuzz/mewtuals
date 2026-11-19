import { z } from "zod";

import type {
  FormNotificationSendResult,
  FormNotificationSender,
  NewFormSubmission,
} from "./form-notification-contracts";

export const FORM_NOTIFICATION_OWNER = "keshav@mewtuals.com";
export const FORM_NOTIFICATION_TIMEOUT_MS = 5_000;

export function isNotificationSender(value: string): boolean {
  if (!value.trim() || /[\r\n]/.test(value)) return false;
  const address = value.match(/<([^<>]+)>$/)?.[1] ?? value;
  return z.email().safeParse(address).success;
}

function validSnapshot(submission: NewFormSubmission): boolean {
  const { message } = submission;
  return (
    z.uuid().safeParse(submission.id).success &&
    isNotificationSender(message.from) &&
    message.to === FORM_NOTIFICATION_OWNER &&
    (!message.replyTo || z.email().safeParse(message.replyTo).success) &&
    Boolean(message.subject && message.text && message.html) &&
    !/[\r\n]/.test(message.subject)
  );
}

export function createResendFormNotificationSender(options: {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}): FormNotificationSender {
  const request = options.fetch ?? globalThis.fetch;
  const apiKey = options.apiKey?.trim();

  return {
    async send(submission): Promise<FormNotificationSendResult> {
      if (!apiKey || !validSnapshot(submission)) return { ok: false };
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<FormNotificationSendResult>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve({ ok: false });
        }, FORM_NOTIFICATION_TIMEOUT_MS);
      });

      const deliver = async (): Promise<FormNotificationSendResult> => {
        const { message } = submission;
        const response = await request("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `form-submission/${submission.id}`,
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return { ok: false };
        const result = z.object({ id: z.uuid() }).safeParse(await response.json());
        return result.success
          ? { ok: true, providerMessageId: result.data.id }
          : { ok: false };
      };

      try {
        return await Promise.race([deliver(), deadline]);
      } catch {
        return { ok: false };
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    },
  };
}
