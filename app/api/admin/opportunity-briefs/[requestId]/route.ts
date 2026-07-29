import { getOpportunityBriefService } from "../../../../server/opportunity-brief";
import { createOpportunityBriefAdminPatchHandler } from "../../../../server/opportunity-brief-admin-route";
import { getCurrentSession } from "../../../../server/session";

export const PATCH = createOpportunityBriefAdminPatchHandler({
  getSession: getCurrentSession,
  updateStatus: (actor, requestId, body) =>
    getOpportunityBriefService().updateStatus(actor, requestId, body),
  updateNotes: (actor, requestId, body) =>
    getOpportunityBriefService().updateNotes(actor, requestId, body),
  linkCandidate: (actor, requestId, body) =>
    getOpportunityBriefService().linkCandidate(actor, requestId, body),
  unlinkCandidate: (actor, requestId, body) =>
    getOpportunityBriefService().unlinkCandidate(actor, requestId, body),
});
