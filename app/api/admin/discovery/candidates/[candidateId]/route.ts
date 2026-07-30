import { getDiscoveryService } from "../../../../../server/discovery";
import {
  createAdminDiscoveryCandidateHandler,
  createAdminDiscoveryCandidateResearchHandler,
} from "../../../../../server/discovery-route";
import { getCurrentSession } from "../../../../../server/session";

export const PATCH = createAdminDiscoveryCandidateHandler({
  getSession: getCurrentSession,
  update: (actor, candidateId, body) =>
    getDiscoveryService().updateCandidateStatus(actor, candidateId, body),
});

export const GET = createAdminDiscoveryCandidateResearchHandler({
  getSession: getCurrentSession,
  getResearch: (actor, candidateId) =>
    getDiscoveryService().getCandidateResearch(actor, candidateId),
});
