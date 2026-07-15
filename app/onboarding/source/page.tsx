import { ProductShell } from "../../components/product/ProductShell";
import { SourceForm } from "../../components/product/SourceForm";
import { loadOnboardingPage } from "../../server/onboarding-page";

export default async function SourcePage() {
  const { state } = await loadOnboardingPage("/onboarding/source");
  const draft = state.draft!;

  return (
    <ProductShell
      eyebrow="Step 2 of 4"
      title="Give us one reliable source."
      intro="Mewtuals uses only what this URL can safely tell us. You will review every generated field next."
    >
      <SourceForm identityKind={draft.identityKind} />
    </ProductShell>
  );
}
