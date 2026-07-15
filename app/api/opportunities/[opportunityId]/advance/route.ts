import { getDashboardService } from "../../../../server/dashboard";
import { createAdvanceHandler } from "../../../../server/dashboard-route";
import { getCurrentSession } from "../../../../server/session";

export const POST = createAdvanceHandler({
  getSession: getCurrentSession,
  advance: (userId, opportunityId, note) =>
    getDashboardService().advance(userId, opportunityId, note),
});
