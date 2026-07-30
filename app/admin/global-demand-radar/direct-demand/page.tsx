import { GlobalRadarSignalListPage } from "../signal-list-page";
import type { GlobalRadarPageSearchParams } from "../page-support";

export default function DirectDemandPage({
  searchParams,
}: {
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  return GlobalRadarSignalListPage({ signalClass: "direct_demand", searchParams });
}
