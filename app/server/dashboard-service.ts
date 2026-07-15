import { z } from "zod";

import {
  curateOpportunities,
  type OpportunityCandidate,
  type PartnershipDirection,
} from "../domain/matching";
import {
  signalSchema,
  type PartnershipSignal,
  type PartnershipSignalInput,
} from "../domain/signal";
import type {
  CreatorSubtype,
  IdentityKind,
  OrganisationSubtype,
  ParticipantIdentity,
} from "../domain/identity";

export type DashboardProfile = {
  id: string;
  identityKind: IdentityKind;
  organisationSubtype: OrganisationSubtype | null;
  creatorSubtype: CreatorSubtype | null;
  status: "draft" | "pending" | "verified" | "waitlisted";
};

export type DashboardCatalogueOpportunity = OpportunityCandidate & {
  id: string;
};

export type DashboardIntroduction = {
  id: string;
  state: "requested" | "reviewing" | "contacting" | "connected" | "closed";
};

export type RequestedAssignment = {
  assignmentId: string;
  rank: number;
  fitSummary: string;
  opportunity: DashboardCatalogueOpportunity;
  introduction: DashboardIntroduction;
};

export type AssignmentPlan = {
  opportunityId: string;
  fitSummary: string;
  rank: number;
  preserve: boolean;
};

export type DashboardOpportunity = {
  id: string;
  title: string;
  summary: string;
  direction: PartnershipDirection;
  counterpartyType: string;
  reciprocalValue: string;
  fitSummary: string;
  rank: number;
  introduction: DashboardIntroduction | null;
};

export type DashboardSignal = {
  availability: PartnershipSignal["availability"];
  openTo: PartnershipSignal["openTo"];
  notes: string | null;
};

export type DashboardState = {
  signal: DashboardSignal | null;
  assignments: DashboardOpportunity[];
};

type DashboardAccess =
  | ({ access: "verified" } & DashboardState)
  | { access: "denied" };

type SignalSelectionInput = {
  profile: DashboardProfile;
  catalogue: DashboardCatalogueOpportunity[];
  requestedAssignments: RequestedAssignment[];
};

type IntroductionAccess =
  | { access: "verified"; introduction: DashboardIntroduction }
  | { access: "denied" }
  | { access: "unassigned" }
  | { access: "unavailable" };

export interface DashboardRepository {
  readDashboard(userId: string): Promise<DashboardAccess>;
  updateSignal(
    userId: string,
    signal: PartnershipSignal,
    selectAssignments: (input: SignalSelectionInput) => AssignmentPlan[],
  ): Promise<DashboardAccess>;
  requestIntroduction(input: {
    userId: string;
    opportunityId: string;
    note: string | null;
  }): Promise<IntroductionAccess>;
}

type DashboardServiceDependencies = {
  repository: DashboardRepository;
};

const opportunityIdSchema = z.uuid({
  error: "Choose a valid Mewtuals Pick.",
});
const introductionNoteSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .max(500, "Keep your note under 500 characters.")
    .optional(),
);

const verifiedOnly = {
  ok: false as const,
  status: 403 as const,
  error: "A verified Mewtuals profile is required.",
};

function validationErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

function profileIdentity(profile: DashboardProfile): ParticipantIdentity {
  if (
    profile.identityKind === "organisation" &&
    profile.organisationSubtype
  ) {
    return { kind: "organisation", subtype: profile.organisationSubtype };
  }
  if (profile.identityKind === "creator" && profile.creatorSubtype) {
    return { kind: "creator", subtype: profile.creatorSubtype };
  }
  throw new Error("Verified profile has an invalid identity subtype.");
}

export function selectDashboardAssignments(
  signal: PartnershipSignalInput,
  input: SignalSelectionInput,
): AssignmentPlan[] {
  const requested = [...input.requestedAssignments]
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.opportunity.key.localeCompare(right.opportunity.key),
    )
    .slice(0, 3);
  const preservedKeys = new Set(
    requested.map(({ opportunity }) => opportunity.key),
  );
  const candidatesByKey = new Map(
    input.catalogue.map((opportunity) => [opportunity.key, opportunity]),
  );
  const currentFits = curateOpportunities(
    profileIdentity(input.profile),
    signal,
    input.catalogue,
  ).filter(({ key }) => !preservedKeys.has(key));

  const plans: Omit<AssignmentPlan, "rank">[] = requested.map(
    ({ opportunity, fitSummary }) => ({
      opportunityId: opportunity.id,
      fitSummary,
      preserve: true,
    }),
  );

  for (const fit of currentFits) {
    if (plans.length >= 3) break;
    const candidate = candidatesByKey.get(fit.key);
    if (!candidate) continue;
    plans.push({
      opportunityId: candidate.id,
      fitSummary: fit.fitSummary,
      preserve: false,
    });
  }

  return plans.map((plan, index) => ({ ...plan, rank: index + 1 }));
}

export function createDashboardService(
  dependencies: DashboardServiceDependencies,
) {
  return {
    async state(userId: string) {
      const state = await dependencies.repository.readDashboard(userId);
      if (state.access !== "verified") return verifiedOnly;
      return { ok: true as const, state };
    },

    async saveSignal(userId: string, input: unknown) {
      const parsed = signalSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Review what you are open to.",
          errors: validationErrors(parsed.error),
        };
      }

      const state = await dependencies.repository.updateSignal(
        userId,
        parsed.data,
        (selectionInput) =>
          selectDashboardAssignments(parsed.data, selectionInput),
      );
      if (state.access !== "verified") return verifiedOnly;
      return { ok: true as const, state };
    },

    async advance(userId: string, opportunityId: string, note?: unknown) {
      const parsedOpportunityId = opportunityIdSchema.safeParse(opportunityId);
      if (!parsedOpportunityId.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Choose a valid Mewtuals Pick.",
          errors: { opportunityId: "Choose a valid Mewtuals Pick." },
        };
      }
      const parsedNote = introductionNoteSchema.safeParse(note);
      if (!parsedNote.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Review your request.",
          errors: { note: parsedNote.error.issues[0]?.message ?? "Invalid note." },
        };
      }

      const result = await dependencies.repository.requestIntroduction({
        userId,
        opportunityId: parsedOpportunityId.data,
        note: parsedNote.data ?? null,
      });
      if (result.access === "denied") return verifiedOnly;
      if (
        result.access === "unassigned" ||
        result.access === "unavailable"
      ) {
        return {
          ok: false as const,
          status: 404 as const,
          error: "This Mewtuals Pick is not available to your profile.",
        };
      }
      return {
        ok: true as const,
        introduction: result.introduction,
        message: "Mewtuals is reviewing the relationship" as const,
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
