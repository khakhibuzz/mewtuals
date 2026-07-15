import { and, asc, eq } from "drizzle-orm";

import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import { opportunities, profileOpportunities } from "../schema";

export function createOpportunityRepository(
  database: MewtualsDatabase = getDb(),
) {
  return {
    listActive() {
      return database
        .select()
        .from(opportunities)
        .where(eq(opportunities.active, true));
    },

    async findById(opportunityId: string) {
      const [opportunity] = await database
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.active, true),
          ),
        )
        .limit(1);
      return opportunity ?? null;
    },

    listAssignedToProfile(profileId: string) {
      return database
        .select({
          assignment: profileOpportunities,
          opportunity: opportunities,
        })
        .from(profileOpportunities)
        .innerJoin(
          opportunities,
          eq(profileOpportunities.opportunityId, opportunities.id),
        )
        .where(
          and(
            eq(profileOpportunities.profileId, profileId),
            eq(opportunities.active, true),
          ),
        )
        .orderBy(asc(profileOpportunities.rank));
    },
  };
}

export type OpportunityRepository = ReturnType<
  typeof createOpportunityRepository
>;
