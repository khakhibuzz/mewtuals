import { ProductShell } from "../../components/product/ProductShell";
import { ProfileConfirmForm } from "../../components/product/ProfileConfirmForm";
import { loadOnboardingPage } from "../../server/onboarding-page";

const labels: Record<string, string> = {
  company: "Company",
  brand: "Brand",
  startup: "Startup",
  distribution_partner: "Distribution partner",
  creator: "Creator",
  podcaster: "Podcaster",
  publication: "Publication",
  media_operator: "Media operator",
};

export default async function ProfilePage() {
  const { state } = await loadOnboardingPage("/onboarding/profile");
  const draft = state.draft!;
  const subtype = draft.organisationSubtype ?? draft.creatorSubtype!;

  return (
    <ProductShell
      eyebrow="Step 3 of 4"
      title="Here is what we understand."
      intro="This draft comes only from your selected identity and submitted source. Edit it before you confirm."
    >
      <ProfileConfirmForm
        draft={{
          name: draft.generatedName!,
          organisationName:
            draft.generatedOrganisationName ?? draft.generatedName!,
          domain: draft.generatedDomain!,
          identityLabel: `${
            draft.identityKind === "organisation" ? "Organisation" : "Creator"
          } · ${labels[subtype]}`,
          primaryUrl: draft.primaryUrl!,
        }}
      />
    </ProductShell>
  );
}
