import { z } from "zod";
import { applicationInputSchema } from "../domain/application";
import type { FormNotificationManager, FormSubmissionRepository, SaveApplicationResult } from "./form-notification-contracts";

export type ApplicationSubmissionResult = { ok: true } | {
  ok: false;
  status: 400 | 409 | 429 | 500 | 503;
  error: string;
  errors?: Record<string, string>;
};

export function createApplicationService(dependencies: {
  repository: FormSubmissionRepository;
  notifications: FormNotificationManager;
  now?: () => Date;
}) {
  return {
    async submit(rawInput: unknown, requesterHash: string, submissionId: string): Promise<ApplicationSubmissionResult> {
      const parsed = applicationInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
        return { ok: false, status: 400, error: "Review your application details.", errors };
      }
      if (!z.uuid().safeParse(submissionId).success || !requesterHash || requesterHash.length > 256) {
        return { ok: false, status: 400, error: "Invalid submission identifier. Refresh this page and try again." };
      }
      const { companyUrl, workEmail, phone } = parsed.data;
      let saved: SaveApplicationResult;
      try {
        const notice = dependencies.notifications.prepare("apply", submissionId, { companyUrl, workEmail, phone }, dependencies.now?.() ?? new Date());
        saved = await dependencies.repository.saveApplication(notice, requesterHash);
      } catch {
        return { ok: false, status: 500, error: "We could not save your application. Please try again." };
      }
      if (saved.outcome === "rate_limited") return { ok: false, status: 429, error: "Too many submission attempts. Try again later." };
      if (saved.outcome !== "accepted") return { ok: false, status: 409, error: "This submission changed. Refresh the page and try again." };
      try {
        const delivery = await dependencies.notifications.deliver(saved.submission);
        return delivery.ok ? { ok: true } : { ok: false, status: 503, error: delivery.error };
      } catch {
        return { ok: false, status: 503, error: "Your details are saved, but we couldn’t email Keshav yet. Please try again." };
      }
    },
  };
}
