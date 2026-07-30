import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarAdminMergePostHandler } from "../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../server/session";

export const POST = createGlobalRadarAdminMergePostHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
