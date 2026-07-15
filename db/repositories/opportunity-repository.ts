import { and, asc, eq, isNotNull, notInArray, or } from "drizzle-orm";

import type {
  AssignmentPlan,
  DashboardCatalogueOpportunity,
  DashboardOpportunity,
  DashboardRepository,
  DashboardSignal,
  RequestedAssignment,
} from "../../app/server/dashboard-service";
import { opportunityCandidateSchema } from "../../app/domain/matching";
import { signalSchema } from "../../app/domain/signal";
import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import {
  introductionRequests,
  opportunities,
  profileOpportunities,
  profiles,
  signals,
} from "../schema";

type OpportunityTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

type OpportunityDatabase = MewtualsDatabase | OpportunityTransaction;

const profileSelection = {
  id: profiles.id,
  identityKind: profiles.identityKind,
  organisationSubtype: profiles.organisationSubtype,
  creatorSubtype: profiles.creatorSubtype,
  status: profiles.status,
};

const assignmentSelection = {
  assignmentId: profileOpportunities.id,
  rank: profileOpportunities.rank,
  fitSummary: profileOpportunities.fitSummary,
  opportunityId: opportunities.id,
  key: opportunities.key,
  title: opportunities.title,
  summary: opportunities.summary,
  direction: opportunities.direction,
  counterpartyType: opportunities.counterpartyType,
  reciprocalValue: opportunities.reciprocalValue,
  eligibleIdentityKinds: opportunities.eligibleIdentityKinds,
  eligibleOrganisationSubtypes: opportunities.eligibleOrganisationSubtypes,
  eligibleCreatorSubtypes: opportunities.eligibleCreatorSubtypes,
  openToTags: opportunities.openToTags,
  active: opportunities.active,
  introductionId: introductionRequests.id,
  introductionState: introductionRequests.state,
};

async function findMemberProfile(
  database: OpportunityDatabase,
  userId: string,
  lock = false,
) {
  const query = database
    .select(profileSelection)
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const [profile] = lock
    ? await query.for("update").limit(1)
    : await query.limit(1);
  return profile ?? null;
}

type CatalogueRow = Pick<
  typeof opportunities.$inferSelect,
  | "id"
  | "key"
  | "title"
  | "summary"
  | "direction"
  | "counterpartyType"
  | "reciprocalValue"
  | "eligibleIdentityKinds"
  | "eligibleOrganisationSubtypes"
  | "eligibleCreatorSubtypes"
  | "openToTags"
  | "active"
>;

function catalogueOpportunity(row: CatalogueRow): DashboardCatalogueOpportunity {
  const parsed = opportunityCandidateSchema.parse(row);
  return {
    id: row.id,
    ...parsed,
  };
}

async function readSignal(
  database: OpportunityDatabase,
  profileId: string,
): Promise<DashboardSignal | null> {
  const [storedSignal] = await database
    .select({
      availability: signals.availability,
      openTo: signals.openTo,
      notes: signals.notes,
    })
    .from(signals)
    .where(eq(signals.profileId, profileId))
    .limit(1);
  if (!storedSignal) return null;
  const signal = signalSchema.parse({
    ...storedSignal,
    notes: storedSignal.notes ?? undefined,
  });
  return { ...signal, notes: signal.notes ?? null };
}

async function readAssignments(
  database: OpportunityDatabase,
  profileId: string,
): Promise<DashboardOpportunity[]> {
  const rows = await database
    .select(assignmentSelection)
    .from(profileOpportunities)
    .innerJoin(
      opportunities,
      eq(profileOpportunities.opportunityId, opportunities.id),
    )
    .leftJoin(
      introductionRequests,
      eq(introductionRequests.profileOpportunityId, profileOpportunities.id),
    )
    .where(
      and(
        eq(profileOpportunities.profileId, profileId),
        or(
          eq(opportunities.active, true),
          isNotNull(introductionRequests.id),
        ),
      ),
    )
    .orderBy(asc(profileOpportunities.rank), asc(opportunities.key))
    .limit(3);

  return rows.map((row) => ({
    id: row.opportunityId,
    title: row.title,
    summary: row.summary,
    direction: row.direction,
    counterpartyType: row.counterpartyType,
    reciprocalValue: row.reciprocalValue,
    fitSummary: row.fitSummary,
    rank: row.rank,
    introduction:
      row.introductionId && row.introductionState
        ? { id: row.introductionId, state: row.introductionState }
        : null,
  }));
}

async function dashboardState(
  database: OpportunityDatabase,
  profileId: string,
) {
  const [signal, assignments] = await Promise.all([
    readSignal(database, profileId),
    readAssignments(database, profileId),
  ]);
  return { access: "verified" as const, signal, assignments };
}

async function readRequestedAssignments(
  database: OpportunityDatabase,
  profileId: string,
): Promise<RequestedAssignment[]> {
  const rows = await database
    .select(assignmentSelection)
    .from(profileOpportunities)
    .innerJoin(
      opportunities,
      eq(profileOpportunities.opportunityId, opportunities.id),
    )
    .innerJoin(
      introductionRequests,
      eq(introductionRequests.profileOpportunityId, profileOpportunities.id),
    )
    .where(eq(profileOpportunities.profileId, profileId))
    .orderBy(asc(profileOpportunities.rank), asc(opportunities.key));

  return rows.map((row) => ({
    assignmentId: row.assignmentId,
    rank: row.rank,
    fitSummary: row.fitSummary,
    opportunity: catalogueOpportunity({
      id: row.opportunityId,
      key: row.key,
      title: row.title,
      summary: row.summary,
      direction: row.direction,
      counterpartyType: row.counterpartyType,
      reciprocalValue: row.reciprocalValue,
      eligibleIdentityKinds: row.eligibleIdentityKinds,
      eligibleOrganisationSubtypes: row.eligibleOrganisationSubtypes,
      eligibleCreatorSubtypes: row.eligibleCreatorSubtypes,
      openToTags: row.openToTags,
      active: row.active,
    }),
    introduction: {
      id: row.introductionId!,
      state: row.introductionState!,
    },
  }));
}

function assertRequestedRelationshipsRemain(
  requestedAssignments: RequestedAssignment[],
  plan: AssignmentPlan[],
) {
  const selected = new Set(plan.map(({ opportunityId }) => opportunityId));
  const omitted = requestedAssignments.find(
    ({ opportunity }) => !selected.has(opportunity.id),
  );
  if (omitted) {
    throw new Error("A requested relationship cannot be removed from the dashboard.");
  }
  if (plan.length > 3) {
    throw new Error("A dashboard cannot contain more than three curated picks.");
  }
}

async function persistAssignmentPlan(
  transaction: OpportunityTransaction,
  profileId: string,
  plan: AssignmentPlan[],
) {
  const selectedIds = plan.map(({ opportunityId }) => opportunityId);
  if (selectedIds.length === 0) {
    await transaction
      .delete(profileOpportunities)
      .where(eq(profileOpportunities.profileId, profileId));
  } else {
    await transaction
      .delete(profileOpportunities)
      .where(
        and(
          eq(profileOpportunities.profileId, profileId),
          notInArray(profileOpportunities.opportunityId, selectedIds),
        ),
      );
  }

  for (const assignment of plan) {
    await transaction
      .insert(profileOpportunities)
      .values({
        profileId,
        opportunityId: assignment.opportunityId,
        fitSummary: assignment.fitSummary,
        rank: assignment.rank,
      })
      .onConflictDoUpdate({
        target: [
          profileOpportunities.profileId,
          profileOpportunities.opportunityId,
        ],
        set: {
          fitSummary: assignment.fitSummary,
          rank: assignment.rank,
        },
      });
  }
}

export function createOpportunityRepository(
  database: MewtualsDatabase = getDb(),
): DashboardRepository & {
  listActive(): Promise<(typeof opportunities.$inferSelect)[]>;
  findById(opportunityId: string): Promise<typeof opportunities.$inferSelect | null>;
  listAssignedToProfile(profileId: string): ReturnType<typeof readAssignments>;
} {
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
      return readAssignments(database, profileId);
    },

    async readDashboard(userId) {
      const profile = await findMemberProfile(database, userId);
      if (!profile || profile.status !== "verified") {
        return { access: "denied" };
      }
      return dashboardState(database, profile.id);
    },

    async updateSignal(userId, signal, selectAssignments) {
      return database.transaction(async (transaction) => {
        const profile = await findMemberProfile(transaction, userId, true);
        if (!profile || profile.status !== "verified") {
          return { access: "denied" as const };
        }

        await transaction
          .insert(signals)
          .values({
            profileId: profile.id,
            availability: signal.availability,
            openTo: signal.openTo,
            notes: signal.notes ?? null,
          })
          .onConflictDoUpdate({
            target: signals.profileId,
            set: {
              availability: signal.availability,
              openTo: signal.openTo,
              notes: signal.notes ?? null,
              updatedAt: new Date(),
            },
          });

        const [catalogueRows, requestedAssignments] = await Promise.all([
          transaction
            .select()
            .from(opportunities)
            .where(eq(opportunities.active, true)),
          readRequestedAssignments(transaction, profile.id),
        ]);
        const plan = selectAssignments({
          profile,
          catalogue: catalogueRows.map(catalogueOpportunity),
          requestedAssignments,
        });
        assertRequestedRelationshipsRemain(requestedAssignments, plan);
        await persistAssignmentPlan(transaction, profile.id, plan);
        return dashboardState(transaction, profile.id);
      });
    },

    async requestIntroduction(input) {
      return database.transaction(async (transaction) => {
        const profile = await findMemberProfile(
          transaction,
          input.userId,
          true,
        );
        if (!profile || profile.status !== "verified") {
          return { access: "denied" as const };
        }

        const [assignment] = await transaction
          .select({
            id: profileOpportunities.id,
            opportunityActive: opportunities.active,
            introductionId: introductionRequests.id,
            introductionState: introductionRequests.state,
          })
          .from(profileOpportunities)
          .innerJoin(
            opportunities,
            eq(profileOpportunities.opportunityId, opportunities.id),
          )
          .leftJoin(
            introductionRequests,
            eq(
              introductionRequests.profileOpportunityId,
              profileOpportunities.id,
            ),
          )
          .where(
            and(
              eq(profileOpportunities.profileId, profile.id),
              eq(profileOpportunities.opportunityId, input.opportunityId),
            ),
          )
          .for("no key update", { of: opportunities })
          .limit(1);
        if (!assignment) return { access: "unassigned" as const };
        if (assignment.introductionId && assignment.introductionState) {
          return {
            access: "verified" as const,
            introduction: {
              id: assignment.introductionId,
              state: assignment.introductionState,
            },
          };
        }
        if (!assignment.opportunityActive) {
          return { access: "unavailable" as const };
        }

        const [created] = await transaction
          .insert(introductionRequests)
          .values({
            profileOpportunityId: assignment.id,
            note: input.note,
          })
          .onConflictDoNothing({
            target: introductionRequests.profileOpportunityId,
          })
          .returning({
            id: introductionRequests.id,
            state: introductionRequests.state,
          });
        const introduction =
          created ??
          (
            await transaction
              .select({
                id: introductionRequests.id,
                state: introductionRequests.state,
              })
              .from(introductionRequests)
              .where(
                eq(
                  introductionRequests.profileOpportunityId,
                  assignment.id,
                ),
              )
              .limit(1)
          )[0];
        if (!introduction) {
          throw new Error("Introduction request could not be read.");
        }
        return { access: "verified" as const, introduction };
      });
    },
  };
}

export type OpportunityRepository = ReturnType<
  typeof createOpportunityRepository
>;
