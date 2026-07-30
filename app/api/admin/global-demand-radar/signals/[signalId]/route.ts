import { getGlobalRadarApplication } from "../../../../../server/global-radar";
import {
  createGlobalRadarAdminSignalGetHandler,
  createGlobalRadarAdminSignalPatchHandler,
} from "../../../../../server/global-radar/route";
import { getCurrentSession } from "../../../../../server/session";

const dependencies = {
  getSession: getCurrentSession,
  getService: () => getGlobalRadarApplication().admin,
};

export const GET = createGlobalRadarAdminSignalGetHandler(dependencies);
export const PATCH = createGlobalRadarAdminSignalPatchHandler(dependencies);
