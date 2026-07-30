import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GlobalRadarSignalList } from "../../components/global-radar/GlobalRadarSignalList";
import { GlobalRadarTabs } from "../../components/global-radar/GlobalRadarTabs";
import type {
  GlobalRadarClassSummary,
  GlobalRadarSignalClass,
  GlobalRadarTab,
} from "../../components/global-radar/types";
import { AdminShell } from "../../components/product/AdminShell";
import {
  GLOBAL_RADAR_CLASS_PAGES,
  loadAuthorizedGlobalRadarAdmin,
  parseGlobalRadarListQuery,
  type GlobalRadarPageSearchParams,
} from "./page-support";

export function GlobalRadarPageShell({
  current,
  children,
}: {
  current: GlobalRadarTab;
  children: ReactNode;
}) {
  return (
    <AdminShell
      current="global-demand-radar"
      eyebrow="Global intelligence"
      title="Global Demand Radar."
      intro="Review public evidence of global demand, precursors, and ecosystem momentum before any controlled promotion to India Discovery."
    >
      <GlobalRadarTabs current={current} />
      {children}
    </AdminShell>
  );
}

export function GlobalRadarPageError({ current, retry }: { current: GlobalRadarTab; retry: string }) {
  return (
    <GlobalRadarPageShell current={current}>
      <section role="alert">
        <h2>Global Radar data is temporarily unavailable.</h2>
        <p>No private failure details have been exposed.</p>
        <Link href={retry}>Retry</Link>
      </section>
    </GlobalRadarPageShell>
  );
}

export async function GlobalRadarSignalListPage({
  signalClass,
  searchParams,
}: {
  signalClass: GlobalRadarSignalClass;
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  const { actor, admin } = await loadAuthorizedGlobalRadarAdmin();
  const parsed = parseGlobalRadarListQuery(signalClass, await searchParams);
  const page = GLOBAL_RADAR_CLASS_PAGES[signalClass];
  if (!parsed) redirect(page.path);
  const result = await admin.getClassSummary(actor, {
    signalClass,
    filters: parsed.serviceFilters,
  });
  if (result.outcome === "forbidden") redirect("/dashboard");
  if (result.outcome !== "listed") {
    return <GlobalRadarPageError current={page.tab} retry={page.path} />;
  }
  return (
    <GlobalRadarPageShell current={page.tab}>
      <GlobalRadarSignalList
        action={page.path}
        canonicalListPath={parsed.canonicalPath}
        filters={parsed.filters}
        signalClass={signalClass}
        snapshot={result as GlobalRadarClassSummary}
      />
    </GlobalRadarPageShell>
  );
}

export function GlobalRadarPagePagination({
  label,
  page,
  pageSize,
  total,
  path,
}: {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  path: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (next: number) => next === 1 ? path : `${path}?page=${next}`;
  return (
    <nav aria-label={`${label} pagination`}>
      {page > 1 ? <Link href={href(page - 1)}>Previous page</Link> : <span />}
      <span>Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)}>Next page</Link> : <span />}
    </nav>
  );
}
