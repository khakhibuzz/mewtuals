import { IdentityForm } from "../../components/product/IdentityForm";
import { ProductShell } from "../../components/product/ProductShell";
import { loadOnboardingPage } from "../../server/onboarding-page";

export default async function IdentityPage() {
  await loadOnboardingPage("/onboarding/identity");

  return (
    <ProductShell
      eyebrow="Step 1 of 4"
      title="How should Mewtuals understand you?"
      intro="Choose one identity now. The next step asks for a public source we can use as evidence."
    >
      <IdentityForm />
    </ProductShell>
  );
}
