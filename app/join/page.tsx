import { MagicLinkForm } from "../components/product/MagicLinkForm";
import { ProductShell } from "../components/product/ProductShell";

export default function JoinPage() {
  return (
    <ProductShell
      eyebrow="Join Mewtuals"
      title="Find the right partnership moment."
      intro="A private, curated network for media and distribution partnerships. Start with your email; we will understand the rest together."
      headerAction={{ href: "/login", label: "Log in" }}
    >
      <MagicLinkForm mode="join" />
    </ProductShell>
  );
}
