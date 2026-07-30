import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarWorkerFailHandler } from "../../../../../../server/global-radar/route";

export const POST = createGlobalRadarWorkerFailHandler({
  getService: () => getGlobalRadarApplication().run,
});
