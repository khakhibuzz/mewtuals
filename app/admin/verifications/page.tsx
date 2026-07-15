import { redirect } from "next/navigation";

import { ProductShell } from "../../components/product/ProductShell";
import {
  VerificationQueue,
  type VerificationQueueProfile,
} from "../../components/product/VerificationQueue";
import type { VerificationProfile } from "../../server/verification-service";
import { getCurrentSession } from "../../server/session";
import { getVerificationService } from "../../server/verification";

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

function toQueueProfile(profile: VerificationProfile): VerificationQueueProfile {
  const subtype = profile.organisationSubtype ?? profile.creatorSubtype;
  return {
    id: profile.id,
    name: profile.name,
    memberEmail: profile.memberEmail,
    organisationName: profile.organisationName,
    identityLabel: `${
      profile.identityKind === "organisation" ? "Organisation" : "Creator"
    } · ${subtype ? subtypeLabels[subtype] : "Unspecified"}`,
    domain: profile.domain,
    primaryUrl: profile.primaryUrl,
    submittedAt: profile.submittedAt?.toISOString() ?? null,
  };
}

export default async function VerificationAdminPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const service = getVerificationService();
  const result = await service.listPending({
    userId: session.user.id,
    email: session.user.email,
  });
  if (!result.ok) redirect("/dashboard");

  return (
    <ProductShell
      eyebrow="Verification operations"
      title="Profiles awaiting review."
      intro="Decisions are final in v1 and create a durable review record with your administrator email."
    >
      <VerificationQueue profiles={result.profiles.map(toQueueProfile)} />
    </ProductShell>
  );
}
