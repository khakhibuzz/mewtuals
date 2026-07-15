import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PendingDashboard } from "../components/product/PendingDashboard";
import { ProductShell } from "../components/product/ProductShell";
import { VerifiedDashboard } from "../components/product/VerifiedDashboard";
import { getDashboardService } from "../server/dashboard";
import { nextOnboardingPath } from "../server/onboarding-service";
import { getOnboardingService } from "../server/onboarding";
import { resolveProtectedPage } from "../server/onboarding-route";
import { readServerEnvironment } from "../server/env";
import { isLoopbackHost } from "../server/request-security";
import { getCurrentSession } from "../server/session";
import { getVerificationService } from "../server/verification";

const subtypeLabels: Record<string, string> = {
  company: "Company",
  brand: "Brand",
  startup: "Startup",
  distribution_partner: "Distribution partner",
  creator: "Creator",
  podcaster: "Podcaster",
  publication: "Publication",
  media_operator: "Media operator",
};

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const onboardingState = await getOnboardingService().state(session.user.id);
  const resolution = resolveProtectedPage(
    session,
    "/dashboard",
    nextOnboardingPath(onboardingState),
  );
  if ("redirectTo" in resolution) redirect(resolution.redirectTo);

  const { profile } = await getVerificationService().memberState(
    session.user.id,
  );
  if (!profile) redirect("/onboarding/identity");

  const subtype = profile.organisationSubtype ?? profile.creatorSubtype;
  const identityLabel = `${
    profile.identityKind === "organisation" ? "Organisation" : "Creator"
  } · ${subtype ? subtypeLabels[subtype] : "Unspecified"}`;

  if (profile.status === "pending" || profile.status === "waitlisted") {
    const environment = readServerEnvironment();
    const requestHeaders = await headers();
    const developmentApprovalEnabled =
      environment.environment !== "production" &&
      environment.developmentAuthEnabled &&
      isLoopbackHost(requestHeaders.get("host"));
    return (
      <ProductShell
        eyebrow="Member dashboard"
        title={profile.status === "pending" ? "Your profile is in review." : "A considered pause."}
        intro="Mewtuals keeps the network curated before any real partnership opportunity is shown."
      >
        <PendingDashboard
          member={{
            name: profile.name,
            organisationName: profile.organisationName,
            identityLabel,
            domain: profile.domain,
          }}
          status={profile.status}
          developmentApprovalEnabled={developmentApprovalEnabled}
        />
      </ProductShell>
    );
  }

  const dashboard = await getDashboardService().state(session.user.id);
  if (!dashboard.ok) {
    throw new Error("Verified dashboard state could not be loaded.");
  }

  return (
    <ProductShell
      eyebrow="Verified member"
      title="Your profile is verified."
      intro="Share what is timely. Mewtuals will keep the result small, private, and considered."
    >
      <VerifiedDashboard
        signal={dashboard.state.signal}
        opportunities={dashboard.state.assignments}
      />
    </ProductShell>
  );
}
