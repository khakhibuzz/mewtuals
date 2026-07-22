import { getDiscoveryService } from "../../../../../../server/discovery";
import { createWorkerFailHandler } from "../../../../../../server/discovery-route";

export const POST = createWorkerFailHandler({
  authenticateWorker: (authorization) =>
    getDiscoveryService().authenticateWorker(authorization),
  fail: (runId, body) => getDiscoveryService().failRun(runId, body),
});
