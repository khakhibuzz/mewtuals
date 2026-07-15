import { getCurrentSession } from "../../../../server/session";
import { getVerificationService } from "../../../../server/verification";
import { createAdminVerificationHandler } from "../../../../server/verification-route";

export const POST = createAdminVerificationHandler({
  getSession: getCurrentSession,
  review: (actor, profileId, body) =>
    getVerificationService().review(actor, profileId, body),
});
