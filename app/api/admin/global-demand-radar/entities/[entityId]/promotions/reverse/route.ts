import { getGlobalRadarApplication } from "../../../../../../../server/global-radar";
import { createGlobalRadarAdminPromotionReversePostHandler } from "../../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../../server/session";

export const POST = createGlobalRadarAdminPromotionReversePostHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
