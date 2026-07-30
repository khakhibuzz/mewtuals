import { GlobalRadarSignalListPage } from "../signal-list-page";
import type { GlobalRadarPageSearchParams } from "../page-support";

export default function MomentumPage({
  searchParams,
}: {
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  return GlobalRadarSignalListPage({ signalClass: "ecosystem_momentum", searchParams });
}
