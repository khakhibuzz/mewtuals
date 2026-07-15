import { redirect } from "next/navigation";

import type { OnboardingPath } from "./onboarding-service";
import { nextOnboardingPath } from "./onboarding-service";
import { resolveProtectedPage } from "./onboarding-route";
import { getOnboardingService } from "./onboarding";
import { getCurrentSession } from "./session";

export async function loadOnboardingPage(requestedPath: OnboardingPath) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const service = getOnboardingService();
  const state = await service.state(session.user.id);
  const resolution = resolveProtectedPage(
    session,
    requestedPath,
    nextOnboardingPath(state),
  );
  if ("redirectTo" in resolution) redirect(resolution.redirectTo);

  return { session, state };
}
