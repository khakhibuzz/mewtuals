import { getOpportunityBriefService } from "../../../server/opportunity-brief";
import { createOpportunityBriefAdminGetHandler } from "../../../server/opportunity-brief-admin-route";
import { getCurrentSession } from "../../../server/session";

export const GET = createOpportunityBriefAdminGetHandler({
  getSession: getCurrentSession,
  list: (actor, filters) =>
    getOpportunityBriefService().getAdminSnapshot(actor, filters),
});
