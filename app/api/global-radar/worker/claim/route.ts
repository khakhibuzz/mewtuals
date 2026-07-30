import { getGlobalRadarApplication } from "../../../../server/global-radar";
import { createGlobalRadarWorkerClaimHandler } from "../../../../server/global-radar/route";

export const POST = createGlobalRadarWorkerClaimHandler({
  getService: () => getGlobalRadarApplication().run,
});
