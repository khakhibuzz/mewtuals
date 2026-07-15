import { getOnboardingService } from "../../../server/onboarding";
import { createProtectedOnboardingHandler } from "../../../server/onboarding-route";
import { getCurrentSession } from "../../../server/session";

export const POST = createProtectedOnboardingHandler({
  getSession: getCurrentSession,
  action: (userId, body) => getOnboardingService().saveSource(userId, body),
});
