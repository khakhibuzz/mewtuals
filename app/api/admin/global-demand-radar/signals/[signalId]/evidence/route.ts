import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarAdminEvidencePostHandler } from "../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../server/session";

export const POST = createGlobalRadarAdminEvidencePostHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
