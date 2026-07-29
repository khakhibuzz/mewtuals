import { getEcosystemIntelligenceService } from "../../../server/ecosystem-intelligence";
import { createEcosystemIntelligenceGetHandler } from "../../../server/ecosystem-intelligence-route";
import { getCurrentSession } from "../../../server/session";

export const GET = createEcosystemIntelligenceGetHandler({
  getSession: getCurrentSession,
  getSnapshot: (actor, filters) =>
    getEcosystemIntelligenceService().getSnapshot(actor, filters),
});
