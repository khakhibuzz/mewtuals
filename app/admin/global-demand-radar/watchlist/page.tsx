import { redirect } from "next/navigation";

import { globalRadarThemes } from "../../../domain/global-radar";
import { GlobalRadarWatchlist } from "../../../components/global-radar/GlobalRadarWatchlist";
import type { GlobalRadarWatchlistItem } from "../../../components/global-radar/types";
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

const path = "/admin/global-demand-radar/watchlist";

export default async function RadarWatchlistPage({
  searchParams,
}: {
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  const { actor, admin } = await loadAuthorizedGlobalRadarAdmin();
  const parsed = parseGlobalRadarPageQuery("watchlist", await searchParams);
  if (!parsed) redirect(path);
  const result = await admin.listWatchlist(actor, { page: parsed.page });
  if (result.outcome === "forbidden") redirect("/dashboard");
  if (result.outcome !== "listed") return <GlobalRadarPageError current="watchlist" retry={path} />;
  return (
    <GlobalRadarPageShell current="watchlist">
      <GlobalRadarWatchlist
        approvedThemes={globalRadarThemes}
        initialItems={result.entries as GlobalRadarWatchlistItem[]}
      />
      <GlobalRadarPagePagination label="Watchlist" page={result.page} pageSize={result.pageSize} path={path} total={result.total} />
    </GlobalRadarPageShell>
  );
}
