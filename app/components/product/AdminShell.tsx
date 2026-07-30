import type { ReactNode } from "react";

import { ProductShell } from "./ProductShell";

export const ADMIN_DESTINATIONS = [
  {
    id: "verification-queue",
    href: "/admin/verifications",
    label: "Verification Queue",
  },
  {
    id: "opportunity-briefs",
    href: "/admin/opportunity-briefs",
    label: "Opportunity Briefs",
  },
  {
    id: "india-discovery",
    href: "/admin/discovery",
    label: "India Discovery",
  },
  {
    id: "global-demand-radar",
    href: "/admin/global-demand-radar/direct-demand",
    label: "Global Demand Radar",
  },
] as const;

export type AdminDestination = (typeof ADMIN_DESTINATIONS)[number]["id"];

type AdminShellProps = {
  current: AdminDestination;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
};

export function AdminShell({
  current,
  eyebrow,
  title,
  intro,
  children,
}: AdminShellProps) {
  return (
    <ProductShell
      eyebrow={eyebrow}
      title={title}
      intro={intro}
      headerLinks={ADMIN_DESTINATIONS.map((destination) => ({
        href: destination.href,
        label: destination.label,
        current: destination.id === current,
      }))}
      wide
    >
      {children}
    </ProductShell>
  );
}
