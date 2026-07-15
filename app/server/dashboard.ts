import { createOpportunityRepository } from "../../db/repositories/opportunity-repository";
import { createDashboardService } from "./dashboard-service";

export function getDashboardService() {
  return createDashboardService({
    repository: createOpportunityRepository(),
  });
}
