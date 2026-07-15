import { createVerificationRepository } from "../../db/repositories/verification-repository";
import { readServerEnvironment } from "./env";
import { createVerificationService } from "./verification-service";

export function getVerificationService() {
  const environment = readServerEnvironment();
  return createVerificationService({
    repository: createVerificationRepository(),
    adminEmails: environment.adminEmails,
    environment: environment.environment,
    developmentAuthEnabled: environment.developmentAuthEnabled,
  });
}
