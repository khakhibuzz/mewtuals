import { createOpportunityBriefRepository } from "../../db/repositories/opportunity-brief-repository";
import { createOpportunityBriefAcknowledgementSender } from "./email";
import { readServerEnvironment } from "./env";
import { createOpportunityBriefPostHandler } from "./opportunity-brief-route";
import { createOpportunityBriefService } from "./opportunity-brief-service";
import type { ServerEnvironment } from "./env";

export function getOpportunityBriefService(
  environment: ServerEnvironment = readServerEnvironment(),
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
    repository: createOpportunityBriefRepository(),
    acknowledgementSender,
    adminEmails: environment.adminEmails,
    now: () => new Date(),
  });
}

export async function handleOpportunityBriefPost(request: Request) {
  const environment = readServerEnvironment();
  const service = getOpportunityBriefService(environment);
  const handler = createOpportunityBriefPostHandler({
    environment: environment.environment,
    sessionSecret: environment.sessionSecret,
    submit: (body, requesterHash) => service.submit(body, requesterHash),
  });
  return handler(request);
}
