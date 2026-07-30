import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarAdminPromotionPostHandler } from "../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../server/session";

export const POST = createGlobalRadarAdminPromotionPostHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
