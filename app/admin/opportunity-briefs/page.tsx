import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "../../components/product/AdminShell";
import { OpportunityBriefDashboard } from "../../components/product/OpportunityBriefDashboard";
import { loadAdminPageContext } from "../../server/admin-page-context";
import { getOpportunityBriefService } from "../../server/opportunity-brief";
import {
  parseOpportunityBriefAdminFilters,
  serializeOpportunityBriefAdminSnapshot,
} from "../../server/opportunity-brief-admin-route";

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

function OpportunityBriefAdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminShell
      current="opportunity-briefs"
      eyebrow="Opportunity Brief operations"
      title="Opportunity Brief requests."
      intro="Review public requests, record research progress, and connect exact Discovery candidates."
    >
      {children}
    </AdminShell>
  );
}

export default async function OpportunityBriefAdminPage({
  searchParams,
}: OpportunityBriefAdminPageProps) {
  const { database, session } = await loadAdminPageContext();
  if (!session) redirect("/login");

  const service = getOpportunityBriefService(database);
  const actor = { userId: session.user.id, email: session.user.email };
  if (!service.isAdministrator(actor)) redirect("/dashboard");

  const filters = parseOpportunityBriefAdminFilters(
    searchParamsFromPage(await searchParams),
  );
  if (!filters) redirect("/admin/opportunity-briefs");
  const result = await service.getAdminSnapshot(actor, filters.serviceFilters);
  if (!result.ok) {
    if (result.status === 400) redirect("/admin/opportunity-briefs");
    if (result.status === 403) redirect("/dashboard");
    return (
      <OpportunityBriefAdminShell>
        <section role="alert">
          <h2>We could not load Opportunity Brief requests.</h2>
          <p>The administrator queue is temporarily unavailable.</p>
          <Link href="/admin/opportunity-briefs">Retry</Link>
        </section>
      </OpportunityBriefAdminShell>
    );
  }

  return (
    <OpportunityBriefAdminShell>
      <OpportunityBriefDashboard
        snapshot={serializeOpportunityBriefSnapshot(result.snapshot)}
        filters={filters.dashboardFilters}
      />
    </OpportunityBriefAdminShell>
  );
}
