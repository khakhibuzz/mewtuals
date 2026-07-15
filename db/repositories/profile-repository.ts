import { eq } from "drizzle-orm";

import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import { profiles } from "../schema";
import type { NewProfile } from "../types";

export type ProfileChanges = Partial<
  Omit<NewProfile, "id" | "userId" | "createdAt">
>;

export function createProfileRepository(
  database: MewtualsDatabase = getDb(),
) {
  return {
    async findById(profileId: string) {
      const [profile] = await database
        .select()
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1);
      return profile ?? null;
    },

    async findByUserId(userId: string) {
      const [profile] = await database
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
      return profile ?? null;
    },

    async create(input: NewProfile) {
      const [profile] = await database
        .insert(profiles)
        .values(input)
        .returning();
      if (!profile) throw new Error("Failed to create the profile.");
      return profile;
    },

    async updateByUserId(userId: string, changes: ProfileChanges) {
      const [profile] = await database
        .update(profiles)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))
        .returning();
      return profile ?? null;
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
