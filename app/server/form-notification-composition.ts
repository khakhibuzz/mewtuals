import type { MewtualsDatabase } from "../../db/client";
import { createFormSubmissionRepository } from "../../db/repositories/form-submission-repository";
import { canExposeDevelopmentVerifyUrl, type ServerEnvironment } from "./env";
import { createFormNotificationManager, createResendFormNotificationSender } from "./form-notifications";
import type { FormNotificationSender } from "./form-notification-contracts";

export function getFormNotificationDependencies(
  database: MewtualsDatabase | undefined,
  environment: ServerEnvironment,
  requestUrl?: string,
) {
  const repository = createFormSubmissionRepository(database);
  // Mirror the explicit local sign-in simulation; a deployed origin cannot use it.
  const simulateLocally = !environment.resendApiKey &&
    canExposeDevelopmentVerifyUrl(environment, requestUrl ?? "");
  const sender: FormNotificationSender = simulateLocally
    ? { async send(submission) { return { ok: true, providerMessageId: submission.id }; } }
    : createResendFormNotificationSender({ apiKey: environment.resendApiKey });
  return {
    repository,
    notifications: createFormNotificationManager({
      repository,
      sender,
      from: environment.emailFrom ?? (simulateLocally ? "Mewtuals development <notifications@example.test>" : ""),
    }),
  };
}
