import { getEcosystemIntelligenceService } from "../../../../../server/ecosystem-intelligence";
import { createEcosystemIntelligenceCandidateGetHandler } from "../../../../../server/ecosystem-intelligence-route";
import { getCurrentSession } from "../../../../../server/session";

export const GET = createEcosystemIntelligenceCandidateGetHandler({
  getSession: getCurrentSession,
  getCandidateDetail: (actor, candidateId, researchOffset) =>
    getEcosystemIntelligenceService().getCandidateDetail(
      actor,
      candidateId,
      researchOffset,
    ),
});
