import { createApplicationPostHandler } from "./application-route";
import { createApplicationService } from "./application-service";
import { readServerEnvironment } from "./env";
import { getFormNotificationDependencies } from "./form-notification-composition";

export async function handleApplicationPost(request: Request) {
  const environment = readServerEnvironment();
  const service = createApplicationService(getFormNotificationDependencies(undefined, environment, request.url));
  return createApplicationPostHandler({
    environment: environment.environment,
    sessionSecret: environment.sessionSecret,
    submit: service.submit,
  })(request);
}
