import { closeDb, getDb } from "../db/client.ts";
import { opportunitySeedData } from "../db/seed-data.ts";
import { opportunities } from "../db/schema.ts";
import { loadLocalEnvironment } from "./load-local-env.mjs";

loadLocalEnvironment();

try {
  const db = getDb();

  for (const opportunity of opportunitySeedData) {
    await db
      .insert(opportunities)
      .values(opportunity)
      .onConflictDoUpdate({
        target: opportunities.key,
        set: {
          title: opportunity.title,
          summary: opportunity.summary,
          direction: opportunity.direction,
          counterpartyType: opportunity.counterpartyType,
          reciprocalValue: opportunity.reciprocalValue,
          eligibleIdentityKinds: opportunity.eligibleIdentityKinds,
          eligibleOrganisationSubtypes: opportunity.eligibleOrganisationSubtypes,
          eligibleCreatorSubtypes: opportunity.eligibleCreatorSubtypes,
          openToTags: opportunity.openToTags,
          active: opportunity.active,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Seeded ${opportunitySeedData.length} internal opportunities.`);
} catch (error) {
  console.error("PostgreSQL seed failed:", error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
