import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarAdminNotePostHandler } from "../../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../../server/session";

export const POST = createGlobalRadarAdminNotePostHandler({
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
});
