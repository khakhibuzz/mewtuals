import { redirect } from "next/navigation";

import { OpportunityBriefDashboard } from "../../components/product/OpportunityBriefDashboard";
import { ProductShell } from "../../components/product/ProductShell";
import { getOpportunityBriefService } from "../../server/opportunity-brief";
import { serializeOpportunityBriefAdminSnapshot } from "../../server/opportunity-brief-admin-route";
import { getCurrentSession } from "../../server/session";

type OpportunityBriefAdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const filterKeys = [
  "participantType",
  "status",
  "source",
  "from",
  "to",
  "linked",
  "page",
  "pageSize",
] as const;

function pageFilters(
  searchParams: Record<string, string | string[] | undefined> | undefined,
) {
  const dashboardFilters: Record<string, string> = {};
  const serviceFilters: Record<string, string> = {};
  for (const key of filterKeys) {
    const value = searchParams?.[key];
    if (Array.isArray(value)) return null;
    const normalized = value?.trim();
    if (!normalized) continue;
    dashboardFilters[key] = normalized;
    if (key === "linked") {
      if (normalized !== "linked" && normalized !== "unlinked") return null;
      serviceFilters.linked = normalized === "linked";
    } else {
      serviceFilters[key === "from" ? "submittedFrom" : key === "to" ? "submittedTo" : key] =
        normalized;
    }
  }
  return { dashboardFilters, serviceFilters };
}

export const serializeOpportunityBriefSnapshot =
  serializeOpportunityBriefAdminSnapshot;

export default async function OpportunityBriefAdminPage({
  searchParams,
}: OpportunityBriefAdminPageProps) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const filters = pageFilters(await searchParams);
  if (!filters) redirect("/admin/opportunity-briefs");
  const result = await getOpportunityBriefService().getAdminSnapshot(
    { userId: session.user.id, email: session.user.email },
    filters.serviceFilters,
  );
  if (!result.ok) redirect("/dashboard");

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
