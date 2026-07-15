import { getDashboardService } from "../../server/dashboard";
import { createSignalHandler } from "../../server/dashboard-route";
import { getCurrentSession } from "../../server/session";

export const POST = createSignalHandler({
  getSession: getCurrentSession,
  saveSignal: (userId, body) =>
    getDashboardService().saveSignal(userId, body),
});
