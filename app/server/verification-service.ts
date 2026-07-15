import { z } from "zod";

import type {
  CreatorSubtype,
  IdentityKind,
  OrganisationSubtype,
} from "../domain/identity";
import {
  transitionProfileStatus,
  type ProfileStatus,
} from "../domain/workflow";

export type VerificationActor = {
  userId: string;
  email: string;
};

export type VerificationDecision = "verified" | "waitlisted";

export type VerificationProfile = {
  id: string;
  userId: string;
  memberEmail: string;
  name: string;
  organisationName: string | null;
  identityKind: IdentityKind;
  organisationSubtype: OrganisationSubtype | null;
  creatorSubtype: CreatorSubtype | null;
  domain: string | null;
  primaryUrl: string;
  status: ProfileStatus;
  submittedAt: Date | null;
  verifiedAt: Date | null;
};

export type VerificationReview = {
  id: string;
  profileId: string;
  reviewerEmail: string;
  decision: VerificationDecision;
  notes: string | null;
  reviewedAt: Date;
};

export type VerificationTransitionInput = {
  profileId: string;
  ownerUserId?: string;
  reviewerEmail: string;
  decision: VerificationDecision;
  notes: string | null;
  reviewedAt: Date;
};

export type VerificationTransition =
  | {
      applied: true;
      profile: VerificationProfile;
      review: VerificationReview;
    }
  | { applied: false; profile: VerificationProfile | null };

export interface VerificationRepository {
  listPending(): Promise<VerificationProfile[]>;
  findMemberProfile(userId: string): Promise<VerificationProfile | null>;
  transitionPending(
    input: VerificationTransitionInput,
  ): Promise<VerificationTransition>;
}

type VerificationEnvironment = "development" | "test" | "production";

type VerificationServiceDependencies = {
  repository: VerificationRepository;
  adminEmails: readonly string[];
  environment: VerificationEnvironment;
  developmentAuthEnabled: boolean;
  now?: () => Date;
};

type VerificationFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
  errors?: Record<string, string>;
};

type VerificationSuccess = {
  ok: true;
  profile: VerificationProfile;
  review: VerificationReview;
};

const actorSchema = z.object({
  userId: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
});

const optionalNotesSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(1_000, "Keep review notes under 1,000 characters.").optional(),
);

const reviewSchema = z.object({
  decision: z.enum(["verified", "waitlisted"]),
  notes: optionalNotesSchema,
});

const profileIdSchema = z.uuid({ error: "Enter a valid profile id." });

function validationErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

export function createVerificationService(
  dependencies: VerificationServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const adminEmails = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );

  function normalizedActor(actor: VerificationActor) {
    return actorSchema.parse(actor);
  }

  function isAdministrator(actor: VerificationActor) {
    const parsed = actorSchema.safeParse(actor);
    return parsed.success && adminEmails.has(parsed.data.email);
  }

  async function applyDecision(input: VerificationTransitionInput): Promise<
    VerificationSuccess | VerificationFailure
  > {
    transitionProfileStatus("pending", input.decision);
    const result = await dependencies.repository.transitionPending(input);
    if (!result.applied) {
      return {
        ok: false,
        status: 409,
        error: "This profile has already been reviewed.",
      };
    }
    return { ok: true, profile: result.profile, review: result.review };
  }

  return {
    isAdministrator,

    async listPending(actor: VerificationActor) {
      if (!isAdministrator(actor)) {
        return {
          ok: false as const,
          status: 403 as const,
          error: "Administrator access is required.",
        };
      }
      return {
        ok: true as const,
        profiles: await dependencies.repository.listPending(),
      };
    },

    async review(
      actorInput: VerificationActor,
      profileId: string,
      input: unknown,
    ): Promise<VerificationSuccess | VerificationFailure> {
      if (!isAdministrator(actorInput)) {
        return {
          ok: false,
          status: 403,
          error: "Administrator access is required.",
        };
      }
      const actor = normalizedActor(actorInput);
      const parsedProfileId = profileIdSchema.safeParse(profileId);
      const parsed = reviewSchema.safeParse(input);
      if (!parsedProfileId.success || !parsed.success) {
        const errors = parsed.success ? {} : validationErrors(parsed.error);
        if (!parsedProfileId.success) {
          errors.profileId = "Enter a valid profile id.";
        }
        return {
          ok: false,
          status: 400,
          error: "Review the verification decision.",
          errors,
        };
      }

      return applyDecision({
        profileId: parsedProfileId.data,
        reviewerEmail: actor.email,
        decision: parsed.data.decision,
        notes: parsed.data.notes ?? null,
        reviewedAt: now(),
      });
    },

    async approveOwnPendingForDevelopment(
      actorInput: VerificationActor,
    ): Promise<VerificationSuccess | VerificationFailure> {
      if (
        dependencies.environment === "production" ||
        !dependencies.developmentAuthEnabled
      ) {
        return { ok: false, status: 404, error: "Not found." };
      }

      const actor = normalizedActor(actorInput);
      const profile = await dependencies.repository.findMemberProfile(
        actor.userId,
      );
      if (!profile || profile.status !== "pending") {
        return {
          ok: false,
          status: 409,
          error: "This profile is not awaiting verification.",
        };
      }

      return applyDecision({
        profileId: profile.id,
        ownerUserId: actor.userId,
        reviewerEmail: actor.email,
        decision: "verified",
        notes: "Local development approval",
        reviewedAt: now(),
      });
    },

    async memberState(userId: string) {
      return {
        profile: await dependencies.repository.findMemberProfile(userId),
      };
    },
  };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
