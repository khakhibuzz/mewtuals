import { GlobalRadarSignalListPage } from "../signal-list-page";
import type { GlobalRadarPageSearchParams } from "../page-support";

export default function DemandPrecursorsPage({
  searchParams,
}: {
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  return GlobalRadarSignalListPage({ signalClass: "demand_precursor", searchParams });
}
