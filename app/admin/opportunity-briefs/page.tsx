import { redirect } from "next/navigation";

import { OpportunityBriefDashboard } from "../../components/product/OpportunityBriefDashboard";
import { ProductShell } from "../../components/product/ProductShell";
import { getOpportunityBriefService } from "../../server/opportunity-brief";
import {
  parseOpportunityBriefAdminFilters,
  serializeOpportunityBriefAdminSnapshot,
} from "../../server/opportunity-brief-admin-route";
import { getCurrentSession } from "../../server/session";

type OpportunityBriefAdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function searchParamsFromPage(
  searchParams: Record<string, string | string[] | undefined> | undefined,
) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else if (value !== undefined) {
      result.append(key, String(value));
    }
  }
  return result;
}

export const serializeOpportunityBriefSnapshot =
  serializeOpportunityBriefAdminSnapshot;

export default async function OpportunityBriefAdminPage({
  searchParams,
}: OpportunityBriefAdminPageProps) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const service = getOpportunityBriefService();
  const actor = { userId: session.user.id, email: session.user.email };
  if (!service.isAdministrator(actor)) redirect("/dashboard");

  const filters = parseOpportunityBriefAdminFilters(
    searchParamsFromPage(await searchParams),
  );
  if (!filters) redirect("/admin/opportunity-briefs");
  const result = await service.getAdminSnapshot(actor, filters.serviceFilters);
  if (!result.ok) {
    redirect(result.status === 400 ? "/admin/opportunity-briefs" : "/dashboard");
  }

  return (
    <ProductShell
      eyebrow="Opportunity Brief operations"
      title="Opportunity Brief requests."
      intro="Review public requests, record research progress, and connect exact Discovery candidates."
      headerLinks={[
        { href: "/admin/opportunity-briefs", label: "Opportunity Briefs" },
        { href: "/admin/discovery", label: "Discovery" },
        { href: "/admin/verifications", label: "Verification queue" },
      ]}
      wide
    >
      <OpportunityBriefDashboard
        snapshot={serializeOpportunityBriefSnapshot(result.snapshot)}
        filters={filters.dashboardFilters}
      />
    </ProductShell>
  );
}
