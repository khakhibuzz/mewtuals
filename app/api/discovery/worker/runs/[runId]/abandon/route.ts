import { getDiscoveryService } from "../../../../../../server/discovery";
import { createWorkerAbandonHandler } from "../../../../../../server/discovery-route";

export const POST = createWorkerAbandonHandler({
  authenticateWorker: (authorization) =>
    getDiscoveryService().authenticateWorker(authorization),
  abandon: (runId, body) => getDiscoveryService().abandonRun(runId, body),
});
