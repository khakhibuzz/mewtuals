import { and, asc, eq } from "drizzle-orm";

import type { VerificationRepository } from "../../app/server/verification-service";
import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import { profiles, users, verificationReviews } from "../schema";

const profileSelection = {
  id: profiles.id,
  userId: profiles.userId,
  memberEmail: users.email,
  name: profiles.name,
  organisationName: profiles.organisationName,
  identityKind: profiles.identityKind,
  organisationSubtype: profiles.organisationSubtype,
  creatorSubtype: profiles.creatorSubtype,
  domain: profiles.domain,
  primaryUrl: profiles.primaryUrl,
  status: profiles.status,
  submittedAt: profiles.submittedAt,
  verifiedAt: profiles.verifiedAt,
};

type VerificationTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

async function findProfile(
  database: MewtualsDatabase | VerificationTransaction,
  profileId: string,
) {
  const [profile] = await database
    .select(profileSelection)
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.id, profileId))
    .limit(1);
  return profile ?? null;
}

export function createVerificationRepository(
  database: MewtualsDatabase = getDb(),
): VerificationRepository {
  return {
    async listPending() {
      return database
        .select(profileSelection)
        .from(profiles)
        .innerJoin(users, eq(users.id, profiles.userId))
        .where(eq(profiles.status, "pending"))
        .orderBy(asc(profiles.submittedAt), asc(profiles.createdAt));
    },

    async findMemberProfile(userId) {
      const [profile] = await database
        .select(profileSelection)
        .from(profiles)
        .innerJoin(users, eq(users.id, profiles.userId))
        .where(eq(profiles.userId, userId))
        .limit(1);
      return profile ?? null;
    },

    async transitionPending(input) {
      return database.transaction(async (transaction) => {
        const [locked] = await transaction
          .select({ id: profiles.id, userId: profiles.userId })
          .from(profiles)
          .where(eq(profiles.id, input.profileId))
          .for("update")
          .limit(1);

        const current = locked
          ? await findProfile(transaction, input.profileId)
          : null;
        if (
          !current ||
          current.status !== "pending" ||
          (input.ownerUserId !== undefined &&
            current.userId !== input.ownerUserId)
        ) {
          return { applied: false as const, profile: current };
        }

        const [updated] = await transaction
          .update(profiles)
          .set({
            status: input.decision,
            verifiedAt:
              input.decision === "verified" ? input.reviewedAt : null,
            updatedAt: input.reviewedAt,
          })
          .where(
            and(
              eq(profiles.id, input.profileId),
              eq(profiles.status, "pending"),
            ),
          )
          .returning({ id: profiles.id });
        if (!updated) return { applied: false as const, profile: current };

        const [review] = await transaction
          .insert(verificationReviews)
          .values({
            profileId: input.profileId,
            reviewerEmail: input.reviewerEmail,
            decision: input.decision,
            notes: input.notes,
            reviewedAt: input.reviewedAt,
            createdAt: input.reviewedAt,
          })
          .returning({
            id: verificationReviews.id,
            profileId: verificationReviews.profileId,
            reviewerEmail: verificationReviews.reviewerEmail,
            decision: verificationReviews.decision,
            notes: verificationReviews.notes,
            reviewedAt: verificationReviews.reviewedAt,
          });
        if (!review) throw new Error("Failed to record the verification review.");

        const profile = await findProfile(transaction, input.profileId);
        if (!profile) throw new Error("Verified profile could not be read.");
        return { applied: true as const, profile, review };
      });
    },
  };
}
