import { getFormNotificationDependencies } from "./form-notification-composition";
import { createOpportunityBriefRepository } from "../../db/repositories/opportunity-brief-repository";
import type { MewtualsDatabase } from "../../db";
import { createOpportunityBriefAcknowledgementSender } from "./email";
import { readServerEnvironment } from "./env";
import { createOpportunityBriefPostHandler } from "./opportunity-brief-route";
import { createOpportunityBriefService } from "./opportunity-brief-service";
import type { ServerEnvironment } from "./env";

export function getOpportunityBriefService(
  database?: MewtualsDatabase,
  environment: ServerEnvironment = readServerEnvironment(),
  requestUrl?: string,
) {
  const acknowledgementSender =
    environment.resendApiKey && environment.emailFrom
      ? createOpportunityBriefAcknowledgementSender({
          environment: environment.environment,
          apiKey: environment.resendApiKey,
          from: environment.emailFrom,
        })
      : undefined;

  return createOpportunityBriefService({
    repository: createOpportunityBriefRepository(database),
    acknowledgementSender,
    ownerNotifications: getFormNotificationDependencies(database, environment, requestUrl).notifications,
    adminEmails: environment.adminEmails,
    now: () => new Date(),
  });
}

export async function handleOpportunityBriefPost(request: Request) {
  const environment = readServerEnvironment();
  const service = getOpportunityBriefService(undefined, environment, request.url);
  const handler = createOpportunityBriefPostHandler({
    environment: environment.environment,
    sessionSecret: environment.sessionSecret,
    submit: service.submit,
  });
  return handler(request);
}
