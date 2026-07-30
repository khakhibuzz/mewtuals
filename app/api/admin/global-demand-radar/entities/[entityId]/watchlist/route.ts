import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarAdminWatchlistPatchHandler } from "../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../server/session";

export const PATCH = createGlobalRadarAdminWatchlistPatchHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
