import { createOnboardingRepository } from "../../db/repositories/onboarding-repository";
import { createOnboardingService } from "./onboarding-service";

export function getOnboardingService() {
  return createOnboardingService(createOnboardingRepository());
}
