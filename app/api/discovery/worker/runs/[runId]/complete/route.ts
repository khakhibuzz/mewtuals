import { getDiscoveryService } from "../../../../../../server/discovery";
import { createWorkerCompleteHandler } from "../../../../../../server/discovery-route";

export const POST = createWorkerCompleteHandler({
  authenticateWorker: (authorization) =>
    getDiscoveryService().authenticateWorker(authorization),
  complete: (runId, body) => getDiscoveryService().completeRun(runId, body),
});
