import { MagicLinkForm } from "../components/product/MagicLinkForm";
import { ProductShell } from "../components/product/ProductShell";

export default function LoginPage() {
  return (
    <ProductShell
      eyebrow="Member sign in"
      title="Welcome back."
      intro="We will email a private, single-use link to continue to your Mewtuals profile."
      headerAction={{ href: "/join", label: "Join Mewtuals" }}
    >
      <MagicLinkForm mode="login" />
    </ProductShell>
  );
}
