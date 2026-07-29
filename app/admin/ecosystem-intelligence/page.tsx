import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ADMIN_HEADER_LINKS } from "../../components/product/admin-navigation";
import { ProductShell } from "../../components/product/ProductShell";
import { serializeEcosystemFilters } from "../../domain/ecosystem-intelligence";
import { getEcosystemIntelligenceService } from "../../server/ecosystem-intelligence";
import { serializeEcosystemSnapshot } from "../../server/ecosystem-intelligence-route";
import { getCurrentSession } from "../../server/session";

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
    <ProductShell
      eyebrow="Physical AI research"
      title="Ecosystem intelligence."
      intro="Understand where India’s robotics and Physical AI participants sit, what evidence supports the picture, and which research gaps remain."
      headerLinks={ADMIN_HEADER_LINKS}
      wide
    >
      {children}
    </ProductShell>
  );
}

export default async function EcosystemIntelligenceAdminPage({
  searchParams,
}: EcosystemIntelligenceAdminPageProps) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const incoming = pageSearchParams(await searchParams);
  const result = await getEcosystemIntelligenceService().getSnapshot(
    { userId: session.user.id, email: session.user.email },
    incoming,
  );
  if (!result.ok) {
    if (result.status === 400) redirect("/admin/ecosystem-intelligence");
    if (result.status === 403) redirect("/dashboard");
    return (
      <EcosystemIntelligenceShell>
        <section role="alert">
          <h2>We could not load Ecosystem Intelligence.</h2>
          <p>The research workspace is temporarily unavailable.</p>
          <Link href="/admin/ecosystem-intelligence">Retry</Link>
        </section>
      </EcosystemIntelligenceShell>
    );
  }

  const canonicalQuery = serializeEcosystemFilters(result.filters);
  if (incoming.toString() !== canonicalQuery) redirect(canonicalPath(canonicalQuery));
  const snapshot = serializeEcosystemSnapshot(result.snapshot);

  return (
    <EcosystemIntelligenceShell>
      <section
        data-testid="ecosystem-initial-snapshot"
        data-canonical-query={canonicalQuery}
        aria-labelledby="ecosystem-initial-title"
      >
        <h2 id="ecosystem-initial-title">Current Physical AI view</h2>
        <p>{snapshot.population.total} Physical AI participants in this view.</p>
        <p>Interactive analysis is loading from this server-rendered snapshot.</p>
      </section>
    </EcosystemIntelligenceShell>
  );
}
