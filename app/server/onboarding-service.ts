import { z } from "zod";

import {
  identitySchema,
  type CreatorSubtype,
  type IdentityKind,
  type OrganisationSubtype,
  type ParticipantIdentity,
} from "../domain/identity";
import {
  creatorSourceSchema,
  generateProfileDraft,
  normalizePublicUrl,
  organisationSourceSchema,
  profileNameSchema,
} from "../domain/profile";
import {
  profileStatusSchema,
  transitionProfileStatus,
  type ProfileStatus,
} from "../domain/workflow";

export const onboardingPaths = [
  "/onboarding/identity",
  "/onboarding/source",
  "/onboarding/profile",
  "/onboarding/verification",
  "/dashboard",
] as const;

export type OnboardingPath = (typeof onboardingPaths)[number];

export type OnboardingDraftRecord = {
  userId: string;
  identityKind: IdentityKind;
  organisationSubtype: OrganisationSubtype | null;
  creatorSubtype: CreatorSubtype | null;
  websiteUrl: string | null;
  linkedInUrl: string | null;
  socialUrl: string | null;
  businessEmail: string | null;
  generatedName: string | null;
  generatedOrganisationName: string | null;
  generatedDomain: string | null;
  primaryUrl: string | null;
};

export type OnboardingProfileRecord = {
  id: string;
  userId: string;
  name: string;
  organisationName: string | null;
  identityKind: IdentityKind;
  organisationSubtype: OrganisationSubtype | null;
  creatorSubtype: CreatorSubtype | null;
  domain: string | null;
  primaryUrl: string;
  websiteUrl: string | null;
  linkedInUrl: string | null;
  socialUrl: string | null;
  status: ProfileStatus;
  submittedAt: Date | null;
};

export type SavedIdentity = Pick<
  OnboardingDraftRecord,
  "identityKind" | "organisationSubtype" | "creatorSubtype"
>;

export type SavedSource = Pick<
  OnboardingDraftRecord,
  | "websiteUrl"
  | "linkedInUrl"
  | "socialUrl"
  | "businessEmail"
  | "generatedName"
  | "generatedOrganisationName"
  | "generatedDomain"
  | "primaryUrl"
>;

export type ConfirmedProfile = Omit<
  OnboardingProfileRecord,
  "id" | "userId" | "submittedAt"
> & { submittedAt?: Date | null };

export interface OnboardingRepository {
  findState(userId: string): Promise<{
    draft: OnboardingDraftRecord | null;
    profile: OnboardingProfileRecord | null;
  }>;
  saveIdentity(
    userId: string,
    identity: SavedIdentity,
  ): Promise<OnboardingDraftRecord>;
  saveSource(userId: string, source: SavedSource): Promise<OnboardingDraftRecord>;
  confirmProfile(
    userId: string,
    profile: ConfirmedProfile,
  ): Promise<OnboardingProfileRecord>;
  submitForVerification(
    userId: string,
    submittedAt: Date,
  ): Promise<OnboardingProfileRecord | null>;
}

type FormValues = Record<string, unknown>;
type FieldErrors = Record<string, string>;

type Success<T> = {
  ok: true;
  value: T;
  nextPath: OnboardingPath;
};

type ValidationFailure = {
  ok: false;
  values: FormValues;
  errors: FieldErrors;
};

type GateFailure = {
  ok: false;
  redirectTo: OnboardingPath;
};

export type OnboardingActionResult<T> =
  | Success<T>
  | ValidationFailure
  | GateFailure;

const optionalNameSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  profileNameSchema.optional(),
);

const canonicalDomainSchema = z.string().trim().transform((value, context) => {
  const normalized = value.replace(/\.+$/, "").toLowerCase();
  if (!normalized || /[\s/@?#]/.test(normalized)) {
    context.addIssue({ code: "custom", message: "Enter a public domain." });
    return z.NEVER;
  }

  try {
    const url = new URL(normalizePublicUrl(`https://${normalized}`));
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    context.addIssue({ code: "custom", message: "Enter a public domain." });
    return z.NEVER;
  }
});

const profileConfirmationSchema = z.object({
  name: profileNameSchema,
  organisationName: optionalNameSchema,
  domain: canonicalDomainSchema,
  confirmed: z.literal(true, { error: "Confirm that this profile is accurate." }),
});

const valuesFrom = (input: unknown): FormValues =>
  typeof input === "object" && input !== null && !Array.isArray(input)
    ? { ...(input as FormValues) }
    : {};

const errorsFrom = (error: z.ZodError): FieldErrors => {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
};

const identityFromDraft = (draft: OnboardingDraftRecord): ParticipantIdentity =>
  draft.identityKind === "organisation"
    ? {
        kind: "organisation",
        subtype: draft.organisationSubtype!,
      }
    : { kind: "creator", subtype: draft.creatorSubtype! };

const hasGeneratedProfile = (draft: OnboardingDraftRecord | null) =>
  Boolean(
    draft?.primaryUrl && draft.generatedName && draft.generatedDomain,
  );

export function nextOnboardingPath(state: {
  draft: OnboardingDraftRecord | null;
  profile: OnboardingProfileRecord | null;
}): OnboardingPath {
  if (state.profile) {
    return state.profile.status === "draft"
      ? "/onboarding/verification"
      : "/dashboard";
  }
  if (!state.draft) return "/onboarding/identity";
  if (!hasGeneratedProfile(state.draft)) return "/onboarding/source";
  return "/onboarding/profile";
}

export function createOnboardingService(
  repository: OnboardingRepository,
  now: () => Date = () => new Date(),
) {
  const readState = (userId: string) => repository.findState(userId);

  return {
    state: readState,

    async nextPath(userId: string) {
      return nextOnboardingPath(await readState(userId));
    },

    async saveIdentity(
      userId: string,
      input: unknown,
    ): Promise<OnboardingActionResult<OnboardingDraftRecord>> {
      const values = valuesFrom(input);
      const parsed = identitySchema.safeParse(values);
      if (!parsed.success) {
        const errors = errorsFrom(parsed.error);
        if (!errors.subtype && values.kind) {
          errors.subtype = "Choose a subtype for this identity.";
        }
        return { ok: false, values, errors };
      }

      const identity: SavedIdentity =
        parsed.data.kind === "organisation"
          ? {
              identityKind: "organisation",
              organisationSubtype: parsed.data.subtype,
              creatorSubtype: null,
            }
          : {
              identityKind: "creator",
              organisationSubtype: null,
              creatorSubtype: parsed.data.subtype,
            };
      const saved = await repository.saveIdentity(userId, identity);
      return { ok: true, value: saved, nextPath: "/onboarding/source" };
    },

    async saveSource(
      userId: string,
      input: unknown,
    ): Promise<OnboardingActionResult<OnboardingDraftRecord>> {
      const state = await readState(userId);
      const requiredPath = nextOnboardingPath(state);
      if (requiredPath !== "/onboarding/source") {
        return { ok: false, redirectTo: requiredPath };
      }

      const values = valuesFrom(input);
      if (values.kind !== state.draft!.identityKind) {
        return {
          ok: false,
          values,
          errors: { kind: "Source type must match the chosen identity." },
        };
      }

      const schema =
        state.draft!.identityKind === "organisation"
          ? organisationSourceSchema
          : creatorSourceSchema;
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        return { ok: false, values, errors: errorsFrom(parsed.error) };
      }

      const generated = generateProfileDraft({
        identity: identityFromDraft(state.draft!),
        source: parsed.data,
      });
      const source: SavedSource = {
        websiteUrl: generated.websiteUrl,
        linkedInUrl: generated.linkedInUrl,
        socialUrl: generated.socialUrl,
        businessEmail:
          parsed.data.kind === "creator"
            ? parsed.data.businessEmail ?? null
            : null,
        generatedName: generated.name,
        generatedOrganisationName: generated.organisationName,
        generatedDomain: generated.domain,
        primaryUrl: generated.primaryUrl,
      };
      const saved = await repository.saveSource(userId, source);
      return { ok: true, value: saved, nextPath: "/onboarding/profile" };
    },

    async confirmProfile(
      userId: string,
      input: unknown,
    ): Promise<OnboardingActionResult<OnboardingProfileRecord>> {
      const state = await readState(userId);
      const requiredPath = nextOnboardingPath(state);
      if (requiredPath !== "/onboarding/profile") {
        return { ok: false, redirectTo: requiredPath };
      }

      const values = valuesFrom(input);
      const parsed = profileConfirmationSchema.safeParse(values);
      const errors = parsed.success ? {} : errorsFrom(parsed.error);
      if (
        state.draft!.identityKind === "organisation" &&
        (!parsed.success || !parsed.data.organisationName)
      ) {
        errors.organisationName ??= "Organisation name is required.";
      }
      if (!parsed.success || Object.keys(errors).length > 0) {
        return { ok: false, values, errors };
      }

      const draft = state.draft!;
      const profile = await repository.confirmProfile(userId, {
        name: parsed.data.name,
        organisationName: parsed.data.organisationName ?? null,
        identityKind: draft.identityKind,
        organisationSubtype: draft.organisationSubtype,
        creatorSubtype: draft.creatorSubtype,
        domain: parsed.data.domain,
        primaryUrl: draft.primaryUrl!,
        websiteUrl: draft.websiteUrl,
        linkedInUrl: draft.linkedInUrl,
        socialUrl: draft.socialUrl,
        status: "draft",
        submittedAt: null,
      });
      return {
        ok: true,
        value: profile,
        nextPath: "/onboarding/verification",
      };
    },

    async submitVerification(
      userId: string,
    ): Promise<OnboardingActionResult<OnboardingProfileRecord>> {
      const state = await readState(userId);
      const requiredPath = nextOnboardingPath(state);
      if (requiredPath !== "/onboarding/verification") {
        return { ok: false, redirectTo: requiredPath };
      }

      profileStatusSchema.parse(state.profile!.status);
      transitionProfileStatus(state.profile!.status, "pending");
      const submittedAt = now();
      const profile = await repository.submitForVerification(userId, submittedAt);
      if (!profile) {
        return {
          ok: false,
          redirectTo: nextOnboardingPath(await readState(userId)),
        };
      }
      return { ok: true, value: profile, nextPath: "/dashboard" };
    },
  };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
