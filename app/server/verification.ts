import { createVerificationRepository } from "../../db/repositories/verification-repository";
import type { MewtualsDatabase } from "../../db";
import { readServerEnvironment } from "./env";
import { createVerificationService } from "./verification-service";

export function getVerificationService(database?: MewtualsDatabase) {
  const environment = readServerEnvironment();
  return createVerificationService({
    repository: createVerificationRepository(database),
    adminEmails: environment.adminEmails,
    environment: environment.environment,
    developmentAuthEnabled: environment.developmentAuthEnabled,
  });
}
