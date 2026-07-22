import { getDiscoveryService } from "../../../../server/discovery";
import { createWorkerClaimHandler } from "../../../../server/discovery-route";

export const POST = createWorkerClaimHandler({
  authenticateWorker: (authorization) =>
    getDiscoveryService().authenticateWorker(authorization),
  claim: (trigger) => getDiscoveryService().claimRun(trigger),
});
