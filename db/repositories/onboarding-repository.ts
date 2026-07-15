import { and, eq } from "drizzle-orm";

import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import { onboardingDrafts, profiles } from "../schema";
import type { NewProfile } from "../types";

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
  findState(userId: string): Promise<{
    draft: typeof onboardingDrafts.$inferSelect | null;
    profile: typeof profiles.$inferSelect | null;
  }>;
  saveIdentity(
    userId: string,
    identity: SavedIdentity,
  ): Promise<typeof onboardingDrafts.$inferSelect>;
  saveSource(
    userId: string,
    source: SavedSource,
  ): Promise<typeof onboardingDrafts.$inferSelect>;
  confirmProfile(
    userId: string,
    profile: Omit<NewProfile, "userId">,
  ): Promise<typeof profiles.$inferSelect>;
  submitForVerification(
    userId: string,
    submittedAt: Date,
  ): Promise<typeof profiles.$inferSelect | null>;
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
      const resetSource = {
        websiteUrl: null,
        linkedInUrl: null,
        socialUrl: null,
        businessEmail: null,
        generatedName: null,
        generatedOrganisationName: null,
        generatedDomain: null,
        primaryUrl: null,
        updatedAt: new Date(),
      };
      const [draft] = await database
        .insert(onboardingDrafts)
        .values({ userId, ...identity })
        .onConflictDoUpdate({
          target: onboardingDrafts.userId,
          set: { ...identity, ...resetSource },
        })
        .returning();

      if (!draft) throw new Error("Failed to save onboarding identity.");
      return draft;
    },

    async saveSource(userId, source) {
      const [draft] = await database
        .update(onboardingDrafts)
        .set({ ...source, updatedAt: new Date() })
        .where(eq(onboardingDrafts.userId, userId))
        .returning();

      if (!draft) throw new Error("Onboarding identity is required.");
      return draft;
    },

    async confirmProfile(userId, input) {
      return database.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(profiles)
          .values({ ...input, userId })
          .onConflictDoNothing({ target: profiles.userId })
          .returning();

        if (created) return created;

        const [existing] = await transaction
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);
        if (!existing) throw new Error("Failed to confirm the profile.");
        return existing;
      });
    },

    async submitForVerification(userId, submittedAt) {
      const [profile] = await database
        .update(profiles)
        .set({ status: "pending", submittedAt, updatedAt: submittedAt })
        .where(and(eq(profiles.userId, userId), eq(profiles.status, "draft")))
        .returning();
      return profile ?? null;
    },
  };
}
