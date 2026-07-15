import { readServerEnvironment } from "../../../../server/env";
import { getCurrentSession } from "../../../../server/session";
import { getVerificationService } from "../../../../server/verification";
import { createDevelopmentApprovalHandler } from "../../../../server/verification-route";

export async function POST(request: Request) {
  const environment = readServerEnvironment();
  const handler = createDevelopmentApprovalHandler({
    environment: environment.environment,
    developmentAuthEnabled: environment.developmentAuthEnabled,
    getSession: getCurrentSession,
    approve: (actor) =>
      getVerificationService().approveOwnPendingForDevelopment(actor),
  });
  return handler(request);
}
