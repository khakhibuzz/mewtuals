import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarAdminEntityQualificationPatchHandler } from "../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../server/session";

export const PATCH = createGlobalRadarAdminEntityQualificationPatchHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
