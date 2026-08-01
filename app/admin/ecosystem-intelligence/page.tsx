import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "../../components/product/AdminShell";
import { EcosystemIntelligenceWorkspace } from "../../components/product/ecosystem-intelligence/EcosystemIntelligenceWorkspace";
import type { EcosystemSnapshotDto } from "../../components/product/ecosystem-intelligence/types";
import {
  filtersFromSearchParams,
  serializeEcosystemFilters,
} from "../../domain/ecosystem-intelligence";
import { loadAdminPageContext } from "../../server/admin-page-context";
import { getEcosystemIntelligenceService } from "../../server/ecosystem-intelligence";
import { serializeEcosystemSnapshot } from "../../server/ecosystem-intelligence-route";

type EcosystemIntelligenceAdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pageSearchParams(
  input: Record<string, string | string[] | undefined> | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

function canonicalPath(query: string): string {
  return `/admin/ecosystem-intelligence${query ? `?${query}` : ""}`;
}

function EcosystemIntelligenceShell({ children }: { children: ReactNode }) {
  return (
    <AdminShell
      current="ecosystem-intelligence"
      eyebrow="Physical AI research"
      title="Ecosystem intelligence."
      intro="Understand where India’s robotics and Physical AI participants sit, what evidence supports the picture, and which research gaps remain."
    >
      {children}
    </AdminShell>
  );
}

export default async function EcosystemIntelligenceAdminPage({
  searchParams,
}: EcosystemIntelligenceAdminPageProps) {
  const { database, session } = await loadAdminPageContext();
  if (!session) redirect("/login");

  const incoming = pageSearchParams(await searchParams);
  const service = getEcosystemIntelligenceService(database);
  const actor = { userId: session.user.id, email: session.user.email };
  if (!service.isAdministrator(actor)) redirect("/dashboard");
  let canonicalQuery: string;
  try {
    canonicalQuery = serializeEcosystemFilters(filtersFromSearchParams(incoming));
  } catch {
    redirect("/admin/ecosystem-intelligence");
  }
  if (incoming.toString() !== canonicalQuery) redirect(canonicalPath(canonicalQuery));

  const result = await service.getSnapshot(actor, incoming);
  if (!result.ok) {
    if (result.status === 400) redirect("/admin/ecosystem-intelligence");
    if (result.status === 403) redirect("/dashboard");
    return (
      <EcosystemIntelligenceShell>
        <section role="alert">
          <h2>We could not load Ecosystem Intelligence.</h2>
          <p>The research workspace is temporarily unavailable.</p>
          <Link href={canonicalPath(canonicalQuery)}>Retry</Link>
        </section>
      </EcosystemIntelligenceShell>
    );
  }

  const snapshot: EcosystemSnapshotDto = serializeEcosystemSnapshot(result.snapshot);

  return (
    <EcosystemIntelligenceShell>
      <EcosystemIntelligenceWorkspace
        initialSnapshot={snapshot}
        canonicalQuery={canonicalQuery}
      />
    </EcosystemIntelligenceShell>
  );
}
