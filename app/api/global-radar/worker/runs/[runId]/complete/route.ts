import { getGlobalRadarApplication } from "../../../../../../server/global-radar";
import { createGlobalRadarWorkerCompleteHandler } from "../../../../../../server/global-radar/route";

export const POST = createGlobalRadarWorkerCompleteHandler({
  getService: () => getGlobalRadarApplication().run,
});
