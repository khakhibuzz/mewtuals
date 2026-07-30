import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { GlobalRadarSignalDetail } from "../../../../components/global-radar/GlobalRadarSignalDetail";
import {
  isGlobalRadarSignalDetail,
  type GlobalRadarTab,
} from "../../../../components/global-radar/types";
import {
  globalRadarFallbackPath,
  loadAuthorizedGlobalRadarAdmin,
  safeGlobalRadarReturnTo,
  type GlobalRadarPageSearchParams,
} from "../../page-support";
import { GlobalRadarPageError, GlobalRadarPageShell } from "../../signal-list-page";

const uuidSchema = z.string().uuid();

const tabByClass = {
  direct_demand: "direct-demand",
  demand_precursor: "demand-precursors",
  ecosystem_momentum: "momentum",
} as const satisfies Record<string, GlobalRadarTab>;

export default async function GlobalRadarSignalPage({
  params,
  searchParams,
}: {
  params: Promise<{ signalId: string }>;
  searchParams?: Promise<GlobalRadarPageSearchParams>;
}) {
  const { actor, admin } = await loadAuthorizedGlobalRadarAdmin();
  const { signalId: rawSignalId } = await params;
  const signalId = uuidSchema.safeParse(rawSignalId);
  if (!signalId.success) notFound();
  const query = (await searchParams) ?? {};
  const result = await admin.getSignalDetail(actor, signalId.data);
  if (result.outcome === "forbidden") redirect("/dashboard");
  if (result.outcome === "not_found" || result.outcome === "invalid") notFound();
  if (result.outcome !== "found" || !isGlobalRadarSignalDetail(result.detail)) {
    return <GlobalRadarPageError current="direct-demand" retry="/admin/global-demand-radar/direct-demand" />;
  }
  const fallback = globalRadarFallbackPath(result.detail.signalClass);
  const returnValue = Object.keys(query).length === 1 && "returnTo" in query
    ? query.returnTo
    : undefined;
  const returnTo = safeGlobalRadarReturnTo(returnValue, fallback);
  const current = tabByClass[result.detail.signalClass];
  return (
    <GlobalRadarPageShell current={current}>
      <GlobalRadarSignalDetail initialDetail={result.detail} returnTo={returnTo} />
    </GlobalRadarPageShell>
  );
}
