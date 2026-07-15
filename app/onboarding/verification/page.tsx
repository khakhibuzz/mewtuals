import { ProductShell } from "../../components/product/ProductShell";
import { VerificationSubmit } from "../../components/product/VerificationSubmit";
import { loadOnboardingPage } from "../../server/onboarding-page";

export default async function VerificationPage() {
  const { state } = await loadOnboardingPage("/onboarding/verification");

  return (
    <ProductShell
      eyebrow="Step 4 of 4"
      title="Ready for a private review."
      intro="We verify that the submitted sources and identity are coherent before curated opportunities unlock."
    >
      <VerificationSubmit profileName={state.profile!.name} />
    </ProductShell>
  );
}
