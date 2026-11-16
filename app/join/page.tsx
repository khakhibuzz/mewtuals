import { MagicLinkForm } from "../components/product/MagicLinkForm";
import { ProductShell } from "../components/product/ProductShell";

export default function JoinPage() {
  return (
    <ProductShell
      eyebrow="Join or log in"
      title="Find the right partnership moment."
      intro="Enter your email and we will send a private, single-use link. Members continue to their dashboard; new members start their profile."
      headerAction={false}
    >
      <MagicLinkForm />
    </ProductShell>
  );
}
