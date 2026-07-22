import { getDiscoveryService } from "../../../../../server/discovery";
import { createAdminDiscoveryCandidateHandler } from "../../../../../server/discovery-route";
import { getCurrentSession } from "../../../../../server/session";

export const PATCH = createAdminDiscoveryCandidateHandler({
  getSession: getCurrentSession,
  update: (actor, candidateId, body) =>
    getDiscoveryService().updateCandidateStatus(actor, candidateId, body),
});
