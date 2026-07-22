import {
  createAdminDiscoveryRunsGetHandler,
  createAdminDiscoveryRunsPostHandler,
} from "../../../../server/discovery-route";
import { getDiscoveryService } from "../../../../server/discovery";
import { getCurrentSession } from "../../../../server/session";

export const GET = createAdminDiscoveryRunsGetHandler({
  getSession: getCurrentSession,
  list: (actor, filters) =>
    getDiscoveryService().getAdminSummary(actor, filters),
});

export const POST = createAdminDiscoveryRunsPostHandler({
  getSession: getCurrentSession,
  queue: (actor) => getDiscoveryService().queueManualRun(actor),
});
