import { eq } from "drizzle-orm";

import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import { onboardingDrafts, profiles, users } from "../schema";
import type { NewProfile } from "../types";

export type OnboardingState = {
  draft: typeof onboardingDrafts.$inferSelect | null;
  profile: typeof profiles.$inferSelect | null;
};

export type OnboardingMutation<T> =
  | { applied: true; value: T }
  | { applied: false; state: OnboardingState };

export type SavedIdentity = Pick<
  typeof onboardingDrafts.$inferInsert,
  "identityKind" | "organisationSubtype" | "creatorSubtype"
>;

export type SavedSource = Pick<
  typeof onboardingDrafts.$inferInsert,
  | "websiteUrl"
  | "linkedInUrl"
  | "socialUrl"
  | "businessEmail"
  | "generatedName"
  | "generatedOrganisationName"
  | "generatedDomain"
  | "primaryUrl"
>;

export interface OnboardingRepository {
  findState(userId: string): Promise<OnboardingState>;
  saveIdentity(
    userId: string,
    identity: SavedIdentity,
  ): Promise<OnboardingMutation<typeof onboardingDrafts.$inferSelect>>;
  saveSource(
    userId: string,
    input: {
      expectedIdentityKind: SavedIdentity["identityKind"];
      source: SavedSource;
    },
  ): Promise<OnboardingMutation<typeof onboardingDrafts.$inferSelect>>;
  confirmProfile(
    userId: string,
    profile: Omit<NewProfile, "userId">,
  ): Promise<OnboardingMutation<typeof profiles.$inferSelect>>;
  submitForVerification(
    userId: string,
    submittedAt: Date,
  ): Promise<OnboardingMutation<typeof profiles.$inferSelect>>;
}

type OnboardingTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

async function readLockedState(
  transaction: OnboardingTransaction,
  userId: string,
): Promise<OnboardingState> {
  const [user] = await transaction
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!user) throw new Error("Onboarding user does not exist.");

  const [draft] = await transaction
    .select()
    .from(onboardingDrafts)
    .where(eq(onboardingDrafts.userId, userId))
    .limit(1);
  const [profile] = await transaction
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return { draft: draft ?? null, profile: profile ?? null };
}

function hasCompleteSource(draft: typeof onboardingDrafts.$inferSelect) {
  return Boolean(
    draft.primaryUrl && draft.generatedName && draft.generatedDomain,
  );
}

function profileMatchesDraft(
  input: Omit<NewProfile, "userId">,
  draft: typeof onboardingDrafts.$inferSelect,
) {
  return (
    input.identityKind === draft.identityKind &&
    input.organisationSubtype === draft.organisationSubtype &&
    input.creatorSubtype === draft.creatorSubtype &&
    input.primaryUrl === draft.primaryUrl &&
    input.websiteUrl === draft.websiteUrl &&
    input.linkedInUrl === draft.linkedInUrl &&
    input.socialUrl === draft.socialUrl
  );
}

export function createOnboardingRepository(
  database: MewtualsDatabase = getDb(),
): OnboardingRepository {
  return {
    async findState(userId) {
      const [[draft], [profile]] = await Promise.all([
        database
          .select()
          .from(onboardingDrafts)
          .where(eq(onboardingDrafts.userId, userId))
          .limit(1),
        database
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1),
      ]);

      return { draft: draft ?? null, profile: profile ?? null };
    },

    async saveIdentity(userId, identity) {
      return database.transaction(async (transaction) => {
        const state = await readLockedState(transaction, userId);
        if (state.draft || state.profile) return { applied: false, state };

        const [draft] = await transaction
          .insert(onboardingDrafts)
          .values({ userId, ...identity })
          .returning();
        if (!draft) throw new Error("Failed to save onboarding identity.");
        return { applied: true, value: draft };
      });
    },

    async saveSource(userId, { expectedIdentityKind, source }) {
      return database.transaction(async (transaction) => {
        const state = await readLockedState(transaction, userId);
        const draft = state.draft;
        if (
          state.profile ||
          !draft ||
          draft.identityKind !== expectedIdentityKind ||
          hasCompleteSource(draft)
        ) {
          return { applied: false, state };
        }

        const [saved] = await transaction
          .update(onboardingDrafts)
          .set({ ...source, updatedAt: new Date() })
          .where(eq(onboardingDrafts.userId, userId))
          .returning();
        if (!saved) throw new Error("Onboarding identity is required.");
        return { applied: true, value: saved };
      });
    },

    async confirmProfile(userId, input) {
      return database.transaction(async (transaction) => {
        const state = await readLockedState(transaction, userId);
        const draft = state.draft;
        if (
          state.profile ||
          !draft ||
          !hasCompleteSource(draft) ||
          !profileMatchesDraft(input, draft)
        ) {
          return { applied: false, state };
        }

        const [profile] = await transaction
          .insert(profiles)
          .values({ ...input, userId })
          .returning();
        if (!profile) throw new Error("Failed to confirm the profile.");
        return { applied: true, value: profile };
      });
    },

    async submitForVerification(userId, submittedAt) {
      return database.transaction(async (transaction) => {
        const state = await readLockedState(transaction, userId);
        if (!state.profile || state.profile.status !== "draft") {
          return { applied: false, state };
        }

        const [profile] = await transaction
          .update(profiles)
          .set({ status: "pending", submittedAt, updatedAt: submittedAt })
          .where(eq(profiles.userId, userId))
          .returning();
        if (!profile) throw new Error("Failed to submit the profile.");
        return { applied: true, value: profile };
      });
    },
  };
}
