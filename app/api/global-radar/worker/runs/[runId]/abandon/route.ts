import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarWorkerAbandonHandler } from "../../../../../../server/global-radar/route";

export const POST = createGlobalRadarWorkerAbandonHandler({
  getService: () => getGlobalRadarApplication().run,
});
