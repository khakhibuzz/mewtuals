import { z } from "zod";

import {
  opportunityBriefInputSchema,
  opportunityBriefParticipantTypeSchema,
  opportunityBriefStatusSchema,
  transitionOpportunityBriefStatus,
  type OpportunityBriefInput,
  type OpportunityBriefParticipantType,
  type OpportunityBriefStatus,
} from "../domain/opportunity-brief";
import {
  candidateIdentifierForProfileUrl,
  type CandidateIdentifier,
} from "../domain/discovery";

export type OpportunityBriefAdminActor = {
  userId: string;
  email: string;
};

export type AcknowledgementStatus =
  | "not_requested"
  | "pending"
  | "sent"
  | "failed";

export type AcknowledgementOutcome =
  | { status: "sent"; at?: Date }
  | { status: "failed"; error: string }
  | { status: "pending" };

export interface AcknowledgementSender {
  sendAcknowledgement(delivery: {
    email: string;
    profileUrl: string;
  }): Promise<AcknowledgementOutcome>;
}

export type AcknowledgementDelivery = {
  email: string;
  expectedUpdatedAt: Date;
};

export type AcknowledgementRecordInput = {
  requestId: string;
  attemptedEmail: string;
  expectedUpdatedAt: Date;
  outcome: AcknowledgementOutcome;
};

export type AcknowledgementRecordResult = {
  outcome: "recorded" | "stale";
};

export type SubmitRepositoryInput = {
  participantType: OpportunityBriefParticipantType;
  profileUrl: string;
  email: string | null;
  phoneNumber: string | null;
  openToText: string | null;
  source: string | null;
  utm: OpportunityBriefInput["utm"];
  requesterHash: string;
  submittedAt: Date;
  candidateIdentifier: CandidateIdentifier;
};

export type SubmitRepositoryResult =
  | { outcome: "rate_limited" }
  | {
      outcome: "accepted";
      requestId: string;
      status: OpportunityBriefStatus;
      linkedCandidateId: string | null;
      persistence: "created" | "merged";
      acknowledgement: {
        status: AcknowledgementStatus;
        delivery: AcknowledgementDelivery | null;
      };
    };

export type AdminRequest = {
  id: string;
  participantType: OpportunityBriefParticipantType;
  profileUrl: string;
  email: string | null;
  phoneNumber: string | null;
  openToText: string | null;
  source: string | null;
  utm: OpportunityBriefInput["utm"];
  linkedCandidateId: string | null;
  status: OpportunityBriefStatus;
  adminNotes: string | null;
  acknowledgementStatus: AcknowledgementStatus;
  acknowledgementSentAt: Date | null;
  acknowledgementError: string | null;
  submissionCount: number;
  lastSubmittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminFilters = {
  participantType?: OpportunityBriefParticipantType;
  status?: OpportunityBriefStatus;
  source?: string;
  submittedAtGte?: Date;
  submittedAtLt?: Date;
  linked?: boolean;
  page?: number;
  pageSize?: number;
};

export type AdminSnapshot = {
  summary: {
    total: number;
    newToday: number;
    companies: number;
    creators: number;
    awaitingResearch: number;
    linkedCandidates: number;
    sources: Record<string, number>;
  };
  requests: AdminRequest[];
  page: number;
  pageSize: number;
  totalPages: number;
};

type GuardedAdminMutation = {
  requestId: string;
  expectedUpdatedAt: Date;
  updatedAt: Date;
};

export type AtomicAdminMutation =
  | (GuardedAdminMutation & {
      kind: "status";
      status: OpportunityBriefStatus;
      expectedStatus: OpportunityBriefStatus;
    })
  | (GuardedAdminMutation & {
      kind: "candidate";
      candidateId: string | null;
    })
  | (GuardedAdminMutation & {
      kind: "notes";
      notes: string | null;
    });

export type AdminMutationResult =
  | { outcome: "updated"; request: AdminRequest }
  | { outcome: "conflict"; request: AdminRequest | null };

export interface OpportunityBriefRepository {
  submit(input: SubmitRepositoryInput): Promise<SubmitRepositoryResult>;
  recordAcknowledgement(
    input: AcknowledgementRecordInput,
  ): Promise<AcknowledgementRecordResult>;
  getAdminSnapshot(
    actorTime: Date,
    filters: AdminFilters,
  ): Promise<AdminSnapshot>;
  getAdminRequest(requestId: string): Promise<AdminRequest | null>;
  getCandidateType(
    candidateId: string,
  ): Promise<OpportunityBriefParticipantType | null>;
  applyAdminMutation(input: AtomicAdminMutation): Promise<AdminMutationResult>;
}

type OpportunityBriefServiceDependencies = {
  repository: OpportunityBriefRepository;
  acknowledgementSender?: AcknowledgementSender;
  adminEmails: readonly string[];
  now?: () => Date;
};

type FieldErrors = Record<string, string>;

export type PublicSubmissionFailure = {
  ok: false;
  status: 400 | 429 | 500;
  error: string;
  errors?: FieldErrors;
};

export type AdminServiceFailure =
  | {
      ok: false;
      status: 400 | 403 | 404 | 500;
      error: string;
      errors?: FieldErrors;
    }
  | {
      ok: false;
      status: 409;
      error: string;
    }
  | {
      ok: false;
      status: 409;
      error: string;
      request: AdminRequest | null;
    };

export type PublicSubmissionResult =
  | PublicSubmissionFailure
  | {
      ok: true;
      requestId: string;
      status: OpportunityBriefStatus;
      submission: {
        participantType: OpportunityBriefParticipantType;
        profileUrl: string;
        email: string | null;
        phoneNumber: string | null;
        openToText: string | null;
        source: string | null;
        utm: OpportunityBriefInput["utm"];
      };
    };

const requesterHashSchema = z.string().trim().min(1).max(256);
const requestIdSchema = z.uuid({ message: "Enter a valid request id." });
const expectedUpdatedAtSchema = z
  .string()
  .datetime({ offset: true, message: "Expected update time is invalid." })
  .transform((value) => new Date(value));

const statusMutationSchema = z.strictObject({
  status: opportunityBriefStatusSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

const candidateMutationSchema = z.strictObject({
  candidateId: z.uuid({ message: "Enter a valid candidate id." }),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

const guardedMutationSchema = z.strictObject({
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

const notesMutationSchema = z.strictObject({
  notes: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(5_000).nullable(),
  ),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

const optionalFilterString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(100).optional(),
);

const optionalCalendarDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: "Enter a calendar date in YYYY-MM-DD format.",
    })
    .refine(isValidCalendarDate, {
      message: "Enter a valid calendar date.",
    })
    .optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().int().min(1).max(100).optional(),
);

const adminFiltersSchema = z.strictObject({
  participantType: opportunityBriefParticipantTypeSchema.optional(),
  status: opportunityBriefStatusSchema.optional(),
  source: optionalFilterString,
  submittedFrom: optionalCalendarDate,
  submittedTo: optionalCalendarDate,
  linked: z
    .preprocess((value) => {
      if (value === "linked") return true;
      if (value === "unlinked") return false;
      return value;
    }, z.boolean().optional()),
  page: optionalPositiveInteger,
  pageSize: optionalPositiveInteger,
});

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function indiaCalendarStart(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}

function parsedAdminFilters(
  input: z.infer<typeof adminFiltersSchema>,
): AdminFilters {
  const { submittedFrom, submittedTo, ...filters } = input;
  return {
    ...filters,
    ...(submittedFrom
      ? { submittedAtGte: indiaCalendarStart(submittedFrom) }
      : {}),
    ...(submittedTo
      ? {
          submittedAtLt: new Date(
            indiaCalendarStart(submittedTo).getTime() + 24 * 60 * 60 * 1_000,
          ),
        }
      : {}),
  };
}

function errorsFrom(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

const administratorFailure = (): AdminServiceFailure => ({
  ok: false,
  status: 403,
  error: "Administrator access is required.",
});

const requestNotFoundFailure = (): AdminServiceFailure => ({
  ok: false,
  status: 404,
  error: "Opportunity Brief request was not found.",
});

const unexpectedFailure = (): AdminServiceFailure => ({
  ok: false,
  status: 500,
  error: "We could not complete that request. Please try again.",
});

function isServiceFailure(
  value: AdminRequest | AdminServiceFailure,
): value is AdminServiceFailure {
  return "ok" in value && value.ok === false;
}

export function createOpportunityBriefService(
  dependencies: OpportunityBriefServiceDependencies,
) {
  const currentTime = dependencies.now ?? (() => new Date());
  const adminEmails = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );

  function isAdministrator(actor: OpportunityBriefAdminActor): boolean {
    return adminEmails.has(actor.email.trim().toLowerCase());
  }

  async function recordAcknowledgement(
    input: AcknowledgementRecordInput,
  ): Promise<void> {
    try {
      await dependencies.repository.recordAcknowledgement(input);
    } catch {
      // The request is already durable. A later administrator can see and
      // reconcile its pending acknowledgement state.
    }
  }

  async function acknowledge(
    requestId: string,
    profileUrl: string,
    delivery: AcknowledgementDelivery,
  ): Promise<void> {
    if (!dependencies.acknowledgementSender) return;

    let outcome: AcknowledgementOutcome;
    try {
      outcome = await dependencies.acknowledgementSender.sendAcknowledgement({
        email: delivery.email,
        profileUrl,
      });
    } catch {
      outcome = {
        status: "failed",
        error: "Acknowledgement delivery failed unexpectedly.",
      };
    }

    await recordAcknowledgement({
      requestId,
      attemptedEmail: delivery.email,
      expectedUpdatedAt: delivery.expectedUpdatedAt,
      outcome:
        outcome.status === "sent"
          ? { status: "sent", at: currentTime() }
          : outcome,
    });
  }

  async function findAdminRequest(
    requestId: string,
  ): Promise<AdminRequest | AdminServiceFailure> {
    try {
      return (
        (await dependencies.repository.getAdminRequest(requestId)) ??
        requestNotFoundFailure()
      );
    } catch {
      return unexpectedFailure();
    }
  }

  async function applyMutation(
    input: AtomicAdminMutation,
  ): Promise<{ ok: true; request: AdminRequest } | AdminServiceFailure> {
    try {
      const result = await dependencies.repository.applyAdminMutation(input);
      if (result.outcome === "conflict") {
        return {
          ok: false,
          status: 409,
          error: "This Opportunity Brief request changed before the update.",
          request: result.request,
        };
      }
      return { ok: true, request: result.request };
    } catch {
      return unexpectedFailure();
    }
  }

  function parseRequestId(
    requestId: string,
  ): string | AdminServiceFailure {
    const parsed = requestIdSchema.safeParse(requestId);
    return parsed.success
      ? parsed.data
      : {
          ok: false,
          status: 400,
          error: "Submit a valid Opportunity Brief request.",
          errors: { requestId: "Enter a valid request id." },
        };
  }

  return {
    isAdministrator,

    async submit(
      rawInput: unknown,
      rawRequesterHash: string,
    ): Promise<PublicSubmissionResult> {
      const parsed = opportunityBriefInputSchema.safeParse(rawInput);
      const requesterHash = requesterHashSchema.safeParse(rawRequesterHash);
      if (!parsed.success || !requesterHash.success) {
        const errors = parsed.success ? {} : errorsFrom(parsed.error);
        if (!requesterHash.success) {
          errors.requester = "Submission identity is invalid.";
        }
        return {
          ok: false,
          status: 400,
          error: "Review the Opportunity Brief request.",
          errors,
        };
      }

      const input = parsed.data;
      let persisted: SubmitRepositoryResult;
      try {
        persisted = await dependencies.repository.submit({
          participantType: input.participantType,
          profileUrl: input.profileUrl,
          email: input.email ?? null,
          phoneNumber: input.phoneNumber ?? null,
          openToText: input.openToText ?? null,
          source: input.source ?? null,
          utm: input.utm,
          requesterHash: requesterHash.data,
          submittedAt: currentTime(),
          candidateIdentifier: candidateIdentifierForProfileUrl(
            input.profileUrl,
          ),
        });
      } catch {
        return {
          ok: false,
          status: 500,
          error: "We could not save your request. Please try again.",
        };
      }

      if (persisted.outcome === "rate_limited") {
        return {
          ok: false,
          status: 429,
          error: "Too many submission attempts. Try again later.",
        };
      }

      if (persisted.acknowledgement.delivery) {
        await acknowledge(
          persisted.requestId,
          input.profileUrl,
          persisted.acknowledgement.delivery,
        );
      }

      return {
        ok: true,
        requestId: persisted.requestId,
        status: persisted.status,
        submission: {
          participantType: input.participantType,
          profileUrl: input.profileUrl,
          email: input.email ?? null,
          phoneNumber: input.phoneNumber ?? null,
          openToText: input.openToText ?? null,
          source: input.source ?? null,
          utm: input.utm,
        },
      };
    },

    async getAdminSnapshot(
      actor: OpportunityBriefAdminActor,
      input: unknown = {},
    ) {
      if (!isAdministrator(actor)) return administratorFailure();
      const parsed = adminFiltersSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Review the Opportunity Brief filters.",
          errors: errorsFrom(parsed.error),
        };
      }
      try {
        return {
          ok: true as const,
          snapshot: await dependencies.repository.getAdminSnapshot(
            currentTime(),
            parsedAdminFilters(parsed.data),
          ),
        };
      } catch {
        return unexpectedFailure();
      }
    },

    async getAdminRequest(
      actor: OpportunityBriefAdminActor,
      rawRequestId: string,
    ) {
      if (!isAdministrator(actor)) return administratorFailure();
      const requestId = parseRequestId(rawRequestId);
      if (typeof requestId !== "string") return requestId;
      const request = await findAdminRequest(requestId);
      return isServiceFailure(request)
        ? request
        : { ok: true as const, request };
    },

    async updateStatus(
      actor: OpportunityBriefAdminActor,
      rawRequestId: string,
      input: unknown,
    ) {
      if (!isAdministrator(actor)) return administratorFailure();
      const requestId = parseRequestId(rawRequestId);
      const parsed = statusMutationSchema.safeParse(input);
      if (typeof requestId !== "string" || !parsed.success) {
        const errors = parsed.success ? {} : errorsFrom(parsed.error);
        if (typeof requestId !== "string") {
          errors.requestId = "Enter a valid request id.";
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid Opportunity Brief status change.",
          errors,
        };
      }

      const current = await findAdminRequest(requestId);
      if (isServiceFailure(current)) return current;
      if (current.status === parsed.data.status) {
        if (
          current.updatedAt.getTime() !==
          parsed.data.expectedUpdatedAt.getTime()
        ) {
          return {
            ok: false as const,
            status: 409 as const,
            error: "This Opportunity Brief request changed before the update.",
            request: current,
          };
        }
        return { ok: true as const, request: current };
      }
      try {
        transitionOpportunityBriefStatus(current.status, parsed.data.status);
      } catch {
        return {
          ok: false as const,
          status: 409 as const,
          error: "That Opportunity Brief status transition is not allowed.",
        };
      }

      return applyMutation({
        kind: "status",
        requestId,
        status: parsed.data.status,
        expectedStatus: current.status,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        updatedAt: currentTime(),
      });
    },

    async linkCandidate(
      actor: OpportunityBriefAdminActor,
      rawRequestId: string,
      input: unknown,
    ) {
      if (!isAdministrator(actor)) return administratorFailure();
      const requestId = parseRequestId(rawRequestId);
      const parsed = candidateMutationSchema.safeParse(input);
      if (typeof requestId !== "string" || !parsed.success) {
        const errors = parsed.success ? {} : errorsFrom(parsed.error);
        if (typeof requestId !== "string") {
          errors.requestId = "Enter a valid request id.";
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid Discovery candidate link.",
          errors,
        };
      }

      const current = await findAdminRequest(requestId);
      if (isServiceFailure(current)) return current;
      let candidateType: OpportunityBriefParticipantType | null;
      try {
        candidateType = await dependencies.repository.getCandidateType(
          parsed.data.candidateId,
        );
      } catch {
        return unexpectedFailure();
      }
      if (!candidateType) {
        return {
          ok: false as const,
          status: 404 as const,
          error: "Discovery candidate was not found.",
        };
      }
      if (candidateType !== current.participantType) {
        return {
          ok: false as const,
          status: 409 as const,
          error:
            "Discovery candidate type does not match the request participant type.",
        };
      }

      return applyMutation({
        kind: "candidate",
        requestId,
        candidateId: parsed.data.candidateId,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        updatedAt: currentTime(),
      });
    },

    async unlinkCandidate(
      actor: OpportunityBriefAdminActor,
      rawRequestId: string,
      input: unknown,
    ) {
      if (!isAdministrator(actor)) return administratorFailure();
      const requestId = parseRequestId(rawRequestId);
      const parsed = guardedMutationSchema.safeParse(input);
      if (typeof requestId !== "string" || !parsed.success) {
        const errors = parsed.success ? {} : errorsFrom(parsed.error);
        if (typeof requestId !== "string") {
          errors.requestId = "Enter a valid request id.";
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid candidate unlink.",
          errors,
        };
      }
      const current = await findAdminRequest(requestId);
      if (isServiceFailure(current)) return current;
      return applyMutation({
        kind: "candidate",
        requestId,
        candidateId: null,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        updatedAt: currentTime(),
      });
    },

    async updateNotes(
      actor: OpportunityBriefAdminActor,
      rawRequestId: string,
      input: unknown,
    ) {
      if (!isAdministrator(actor)) return administratorFailure();
      const requestId = parseRequestId(rawRequestId);
      const parsed = notesMutationSchema.safeParse(input);
      if (typeof requestId !== "string" || !parsed.success) {
        const errors = parsed.success ? {} : errorsFrom(parsed.error);
        if (typeof requestId !== "string") {
          errors.requestId = "Enter a valid request id.";
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit valid Opportunity Brief notes.",
          errors,
        };
      }
      const current = await findAdminRequest(requestId);
      if (isServiceFailure(current)) return current;
      return applyMutation({
        kind: "notes",
        requestId,
        notes: parsed.data.notes,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        updatedAt: currentTime(),
      });
    },
  };
}

export type OpportunityBriefService = ReturnType<
  typeof createOpportunityBriefService
>;
