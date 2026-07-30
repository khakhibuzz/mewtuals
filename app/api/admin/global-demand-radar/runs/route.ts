import { getGlobalRadarApplication } from "../../../../server/global-radar";
import {
  createGlobalRadarAdminRunsGetHandler,
  createGlobalRadarAdminRunsPostHandler,
} from "../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../server/session";

const dependencies = {
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
};

export const GET = createGlobalRadarAdminRunsGetHandler(dependencies);
export const POST = createGlobalRadarAdminRunsPostHandler(dependencies);
