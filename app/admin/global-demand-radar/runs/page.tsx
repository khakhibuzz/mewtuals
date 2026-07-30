import { redirect } from "next/navigation";

import { globalRadarThemes } from "../../../domain/global-radar";
import { GlobalRadarRuns } from "../../../components/global-radar/GlobalRadarRuns";
import type { GlobalRadarRunItem } from "../../../components/global-radar/types";
import {
  loadAuthorizedGlobalRadarAdmin,
  parseGlobalRadarPageQuery,
  type GlobalRadarPageSearchParams,
} from "../page-support";
import {
  GlobalRadarPageError,
  GlobalRadarPagePagination,
  GlobalRadarPageShell,
} from "../signal-list-page";

const path = "/admin/global-demand-radar/runs";

export default async function RadarRunsPage({
  searchParams,
}: {
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  const { actor, admin } = await loadAuthorizedGlobalRadarAdmin();
  const parsed = parseGlobalRadarPageQuery("runs", await searchParams);
  if (!parsed) redirect(path);
  const result = await admin.listRuns(actor, { page: parsed.page });
  if (result.outcome === "forbidden") redirect("/dashboard");
  if (result.outcome !== "listed") return <GlobalRadarPageError current="runs" retry={path} />;
  return (
    <GlobalRadarPageShell current="runs">
      <GlobalRadarRuns approvedThemes={globalRadarThemes} initialRuns={result.runs as GlobalRadarRunItem[]} />
      <GlobalRadarPagePagination label="Radar Runs" page={result.page} pageSize={result.pageSize} path={path} total={result.total} />
    </GlobalRadarPageShell>
  );
}
