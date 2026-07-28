import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import {
  allocateCandidates,
  candidateStatusSchema,
  candidateTypeSchema,
  discoveryBatchSchema,
  discoveryV1BatchSchema,
  discoveryV2BatchSchema,
  DISCOVERY_V1_PROMPT_VERSION,
  DISCOVERY_V2_PROMPT_VERSION,
  MAX_DISCOVERY_BATCH_BYTES,
} from "../domain/discovery";
import {
  PHYSICAL_AI_CAMPAIGN_KEY,
  physicalAiSeedConfig,
  publicDiscoveryWorkerConfig,
  type DiscoveryConfig,
} from "./discovery-config";
import type {
  DiscoveryRepository,
  QueueDiscoveryRunInput,
} from "../../db/repositories/discovery-repository";
import type { DiscoveryRun } from "../../db/types";
import {
  hashDiscoveryToken,
  verifyDiscoveryBearer,
} from "./discovery-worker-auth";

export type DiscoveryAdminActor = {
  userId: string;
  email: string;
};

export const DISCOVERY_PROMPT_VERSION = DISCOVERY_V2_PROMPT_VERSION;
export const DISCOVERY_LEASE_DURATION_MS = 2 * 60 * 60 * 1_000;

export type DiscoveryClaimSelector = {
  trigger: "scheduled" | "trial";
  preset?: "robotics-seed";
};

const discoveryClaimSelectorSchema = z
  .strictObject({
    trigger: z.enum(["scheduled", "trial"]),
    preset: z.literal("robotics-seed").optional(),
  })
  .refine((selector) => !selector.preset || selector.trigger === "trial", {
    message: "Discovery presets are only available for trial claims.",
    path: ["preset"],
  });

type MutableJsonSchema = {
  [key: string]: unknown;
  properties?: Record<string, MutableJsonSchema>;
  items?: MutableJsonSchema;
  propertyNames?: MutableJsonSchema;
};

function createDiscoveryOutputSchema(
  schema: typeof discoveryV1BatchSchema | typeof discoveryV2BatchSchema,
): MutableJsonSchema {
  const output = z.toJSONSchema(schema, {
    io: "input",
  }) as MutableJsonSchema;
  output.description =
    `Validated discovery batch. The serialized JSON body must be at most ${MAX_DISCOVERY_BATCH_BYTES} bytes.`;

  const candidate = output.properties?.candidates?.items;
  const candidateProperties = candidate?.properties;
  if (!candidate || !candidateProperties) {
    throw new Error("Discovery output schema could not be generated.");
  }
  const candidateProperty = (name: string) => {
    const property = candidateProperties[name];
    if (!property) {
      throw new Error(`Discovery output schema is missing ${name}.`);
    }
    return property;
  };
  Object.assign(candidateProperty("name"), {
    minLength: 1,
    maxLength: 200,
  });
  Object.assign(candidateProperty("discoveryScore"), {
    type: "integer",
    minimum: 0,
    maximum: 100,
  });
  Object.assign(candidateProperty("canonicalUrl"), {
    format: "uri",
    description:
      "Public HTTP(S) stable candidate identity URL; search results and article-only URLs are not accepted.",
  });
  for (const property of [
    "websiteUrl",
    "primarySocialUrl",
    "linkedinUrl",
    "sourceUrl",
  ]) {
    Object.assign(candidateProperty(property), {
      description: "Public HTTP(S) URL only.",
    });
  }
  const rawMetadata = candidateProperty("rawMetadata");
  Object.assign(rawMetadata, {
    maxProperties: 20,
    description:
      "JSON metadata with maximum depth 3, at most 20 total keys, key length at most 64 characters, and serialized size at most 8192 bytes.",
  });
  rawMetadata.propertyNames ??= {};
  rawMetadata.propertyNames.maxLength = 64;

  const research = candidateProperties.research?.properties;
  if (research) {
    Object.assign(research.summary, {
      minLength: 80,
      maxLength: 1_200,
      description:
        "Concise systems and ecosystem context for the administrator drawer.",
    });
    Object.assign(research.findings, {
      minLength: 600,
      maxLength: 12_000,
      description:
        "Structured plain-text Physical AI findings with facts, assessments, unknowns, and source references.",
    });
    Object.assign(research.sourceUrls, {
      minItems: 1,
      maxItems: 12,
      uniqueItems: true,
      description: "Ordered public HTTP(S) evidence URLs, each at most 2048 characters.",
    });
  }
  return output;
}

export const discoveryV1OutputSchema = createDiscoveryOutputSchema(
  discoveryV1BatchSchema,
);
export const discoveryV2OutputSchema = createDiscoveryOutputSchema(
  discoveryV2BatchSchema,
);
export const discoveryOutputSchema = discoveryV2OutputSchema;

const discoveryFailureSchema = z.strictObject({
  runId: z.string().uuid({ message: "Discovery run id must be a valid UUID." }),
  leaseToken: z
    .string()
    .trim()
    .min(1, { message: "Discovery lease token is required." })
    .max(512, { message: "Discovery lease token is too long." }),
  message: z
    .string()
    .trim()
    .min(1, { message: "Discovery failure message is required." })
    .max(1_000, { message: "Discovery failure message is too long." }),
});

const discoveryAbandonmentSchema = z.strictObject({
  runId: z.string().uuid({ message: "Discovery run id must be a valid UUID." }),
  message: z
    .string()
    .trim()
    .min(1, { message: "Discovery abandonment message is required." })
    .max(1_000, { message: "Discovery abandonment message is too long." }),
});

const candidateIdSchema = z.string().uuid({
  message: "Discovery candidate id must be a valid UUID.",
});

const candidateStatusUpdateSchema = z
  .object({
    status: candidateStatusSchema,
    expectedUpdatedAt: z
      .string()
      .datetime({ offset: true, message: "Expected update time is invalid." })
      .transform((value) => new Date(value)),
  })
  .strict();

const optionalFilterString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(100).optional(),
);

const optionalFilterInteger = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(1).max(maximum).optional(),
  );

const optionalFilterDate = z.preprocess((value) => {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || value.trim() === "") return value || undefined;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00+05:30`)
    : new Date(trimmed);
}, z.date().optional());

const discoveryFiltersSchema = z
  .object({
    type: candidateTypeSchema.optional(),
    geography: optionalFilterString,
    category: optionalFilterString,
    source: optionalFilterString,
    status: candidateStatusSchema.optional(),
    discoveredFrom: optionalFilterDate,
    discoveredTo: optionalFilterDate,
    page: optionalFilterInteger(100),
    pageSize: optionalFilterInteger(100),
    runLimit: optionalFilterInteger(100),
  })
  .strict();

type DiscoveryServiceDependencies = {
  repository: DiscoveryRepository;
  adminEmails: readonly string[];
  workerSecret: string;
  config: DiscoveryConfig;
  now?: () => Date;
  token?: () => string;
};

export function createDiscoveryService(
  dependencies: DiscoveryServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const token =
    dependencies.token ?? (() => randomBytes(32).toString("base64url"));
  const adminEmails = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );

  function isAdministrator(actor: DiscoveryAdminActor): boolean {
    return adminEmails.has(actor.email.trim().toLowerCase());
  }

  function configuredRunInput(
    trigger: "scheduled" | "manual" | "trial",
    externalRunKey: string,
    queuedAt: Date,
    requestedByEmail: string | null,
    config: DiscoveryConfig = dependencies.config,
    candidateType: "company" | "creator" | "both" = "both",
  ) {
    return {
      externalRunKey,
      campaignKey: config.campaignKey,
      trigger,
      now: queuedAt,
      geography: config.geographies[0] ?? "India",
      candidateType,
      sourcesUsed: config.enabledSources,
      requestedCount: config.totalCandidates,
      companyPercentage: config.companyPercentage,
      requestedByEmail,
    };
  }

  function indiaLocalDate(value: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function dailyExternalRunKey(queuedAt: Date): string {
    const geography = (dependencies.config.geographies[0] ?? "India")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return [
      "discovery",
      "scheduled",
      dependencies.config.campaignKey,
      indiaLocalDate(queuedAt),
      geography,
      "both",
      dependencies.config.totalCandidates,
      dependencies.config.companyPercentage,
    ].join(":");
  }

  function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      return `{${Object.keys(object)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
        )
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function submissionHash(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
  }

  function validationDetails(error: z.ZodError) {
    const errors: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = String(issue.path[0] ?? "body");
      errors[field] ??= issue.message;
    }
    return errors;
  }

  function runResult(
    result: Awaited<ReturnType<DiscoveryRepository["completeRun"]>>,
  ) {
    if (result.outcome === "not_found") {
      return {
        ok: false as const,
        status: 404 as const,
        error: "Discovery run was not found.",
      };
    }
    if (result.outcome === "conflict") {
      if (result.reason === "duplicate_candidate_in_batch") {
        return {
          ok: false as const,
          status: 409 as const,
          error: "Discovery run cannot accept this submission.",
          reason: result.reason,
          details: result.details,
        };
      }
      return {
        ok: false as const,
        status: 409 as const,
        error: "Discovery run cannot accept this submission.",
        reason: result.reason,
      };
    }
    return {
      ok: true as const,
      outcome: result.outcome,
      run: publicWorkerRun(result.run),
    };
  }

  function publicWorkerRun(run: DiscoveryRun) {
    return {
      id: run.id,
      campaignKey: run.campaignKey ?? "general_discovery",
      trigger: run.trigger,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      geography: run.geography,
      candidateType: run.candidateType,
      sourcesUsed: run.sourcesUsed,
      requestedCount: run.requestedCount,
      companyPercentage: run.companyPercentage,
      foundCount: run.foundCount,
      newCount: run.newCount,
      duplicateCount: run.duplicateCount,
      errorSummary: run.errorSummary,
    };
  }

  function workerConfigForRun(run: DiscoveryRun) {
    return publicDiscoveryWorkerConfig({
      ...dependencies.config,
      campaignKey: run.campaignKey ?? "general_discovery",
      geographies: [run.geography],
      enabledSources: run.sourcesUsed,
      totalCandidates: run.requestedCount,
      companyPercentage: run.companyPercentage,
    });
  }

  function persistedAllocationError(
    run: DiscoveryRun,
    candidates: readonly { type: "company" | "creator" }[],
  ): string | null {
    const companies = candidates.filter(({ type }) => type === "company").length;
    const creators = candidates.length - companies;
    if (run.candidateType === "company" && creators > 0) {
      return "Discovery batch contains creators outside the claimed company run.";
    }
    if (run.candidateType === "creator" && companies > 0) {
      return "Discovery batch contains companies outside the claimed creator run.";
    }
    if (run.candidateType === "both") {
      const allocation = allocateCandidates(
        run.requestedCount,
        run.companyPercentage,
      );
      if (companies > allocation.companies) {
        return "Discovery batch exceeds the claimed company allocation.";
      }
      if (creators > allocation.creators) {
        return "Discovery batch exceeds the claimed creator allocation.";
      }
    }
    if (candidates.length > run.requestedCount) {
      return "Discovery batch exceeds the claimed candidate allocation.";
    }
    return null;
  }

  async function claimSelectedRun(
    claimedAt: Date,
    selector: {
      triggers?: readonly DiscoveryRun["trigger"][];
      externalRunKey?: string;
      fallbackExternalRunKey?: string;
      queueIfMissing?: QueueDiscoveryRunInput;
    },
  ) {
    const leaseToken = token();
    const claimed = await dependencies.repository.claimRun({
      now: claimedAt,
      leaseTokenHash: hashDiscoveryToken(
        dependencies.workerSecret,
        leaseToken,
      ),
      leaseExpiresAt: new Date(
        claimedAt.getTime() + DISCOVERY_LEASE_DURATION_MS,
      ),
      ...selector,
    });
    if (!claimed) return null;
    const promptVersion = promptVersionForRun(claimed);
    return {
      ok: true as const,
      claimed: true as const,
      runId: claimed.id,
      leaseToken,
      promptVersion,
      config: workerConfigForRun(claimed),
      outputSchema:
        promptVersion === DISCOVERY_V2_PROMPT_VERSION
          ? discoveryV2OutputSchema
          : discoveryV1OutputSchema,
    };
  }

  function promptVersionForRun(run: Pick<DiscoveryRun, "campaignKey">) {
    return run.campaignKey === PHYSICAL_AI_CAMPAIGN_KEY
      ? DISCOVERY_V2_PROMPT_VERSION
      : DISCOVERY_V1_PROMPT_VERSION;
  }

  return {
    isAdministrator,
    authenticateWorker(authorization: string | null) {
      return verifyDiscoveryBearer(authorization, dependencies.workerSecret);
    },

    async queueManualRun(actor: DiscoveryAdminActor) {
      if (!isAdministrator(actor)) {
        return {
          ok: false as const,
          status: 403 as const,
          error: "Administrator access is required.",
        };
      }
      const queuedAt = now();
      const run = await dependencies.repository.queueRun(
        configuredRunInput(
          "manual",
          `discovery:manual:${dependencies.config.campaignKey}:${token()}`,
          queuedAt,
          actor.email.trim().toLowerCase(),
        ),
      );
      return { ok: true as const, run: publicWorkerRun(run) };
    },

    async claimRun(
      input: DiscoveryClaimSelector | "scheduled" | "trial" = {
        trigger: "scheduled",
      },
    ) {
      const parsedSelector = discoveryClaimSelectorSchema.safeParse(
        typeof input === "string" ? { trigger: input } : input,
      );
      if (!parsedSelector.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid discovery claim selector.",
          errors: validationDetails(parsedSelector.error),
        };
      }
      const { trigger, preset } = parsedSelector.data;
      const claimedAt = now();
      const runConfig = preset
        ? physicalAiSeedConfig(dependencies.config)
        : dependencies.config;
      const externalRunKey =
        trigger === "scheduled"
          ? dailyExternalRunKey(claimedAt)
          : [
              "discovery",
              "trial",
              runConfig.campaignKey,
              ...(preset ? [preset] : []),
              token(),
            ].join(":");
      const queueIfMissing = configuredRunInput(
        trigger,
        externalRunKey,
        claimedAt,
        null,
        runConfig,
        preset === "robotics-seed" ? "company" : "both",
      );
      const claimed = await claimSelectedRun(
        claimedAt,
        trigger === "scheduled"
          ? {
              triggers: ["manual"],
              fallbackExternalRunKey: externalRunKey,
              queueIfMissing,
            }
          : { externalRunKey, queueIfMissing },
      );
      return claimed ?? { ok: true as const, claimed: false as const };
    },

    async completeRun(routeRunId: string, input: unknown) {
      const parsed = discoveryBatchSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid discovery batch.",
          errors: validationDetails(parsed.error),
        };
      }
      if (parsed.data.runId !== routeRunId) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Discovery route and batch run ids must match.",
        };
      }
      const persistedRun = await dependencies.repository.getRun(parsed.data.runId);
      if (!persistedRun) {
        return {
          ok: false as const,
          status: 404 as const,
          error: "Discovery run was not found.",
        };
      }
      const expectedPromptVersion = promptVersionForRun(persistedRun);
      if (parsed.data.promptVersion !== expectedPromptVersion) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Discovery batch prompt version does not match the claimed run.",
        };
      }
      const allocationError = persistedAllocationError(
        persistedRun,
        parsed.data.candidates,
      );
      if (allocationError) {
        return {
          ok: false as const,
          status: 400 as const,
          error: allocationError,
        };
      }

      const result = await dependencies.repository.completeRun({
        runId: parsed.data.runId,
        leaseTokenHash: hashDiscoveryToken(
          dependencies.workerSecret,
          parsed.data.leaseToken,
        ),
        submissionHash: submissionHash(parsed.data),
        now: now(),
        candidates: parsed.data.candidates,
        sourceErrors: parsed.data.sourceErrors,
      });
      return runResult(result);
    },

    async failRun(routeRunId: string, input: unknown) {
      const parsed = discoveryFailureSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid discovery failure.",
          errors: validationDetails(parsed.error),
        };
      }
      if (parsed.data.runId !== routeRunId) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Discovery route and failure run ids must match.",
        };
      }

      const result = await dependencies.repository.failRun({
        runId: parsed.data.runId,
        leaseTokenHash: hashDiscoveryToken(
          dependencies.workerSecret,
          parsed.data.leaseToken,
        ),
        now: now(),
        message: parsed.data.message,
      });
      return runResult(result);
    },

    async abandonRun(routeRunId: string, input: unknown) {
      const parsed = discoveryAbandonmentSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid discovery abandonment.",
          errors: validationDetails(parsed.error),
        };
      }
      if (parsed.data.runId !== routeRunId) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Discovery route and abandonment run ids must match.",
        };
      }

      return runResult(
        await dependencies.repository.abandonRun({
          runId: parsed.data.runId,
          now: now(),
          message: parsed.data.message,
        }),
      );
    },

    async updateCandidateStatus(
      actor: DiscoveryAdminActor,
      candidateId: string,
      input: unknown,
    ) {
      if (!isAdministrator(actor)) {
        return {
          ok: false as const,
          status: 403 as const,
          error: "Administrator access is required.",
        };
      }
      const parsedCandidateId = candidateIdSchema.safeParse(candidateId);
      const parsed = candidateStatusUpdateSchema.safeParse(input);
      if (!parsedCandidateId.success || !parsed.success) {
        const errors = parsed.success ? {} : validationDetails(parsed.error);
        if (!parsedCandidateId.success) {
          errors.candidateId = "Discovery candidate id must be a valid UUID.";
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid candidate status change.",
          errors,
        };
      }

      const result = await dependencies.repository.updateCandidateStatus({
        candidateId: parsedCandidateId.data,
        status: parsed.data.status,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        now: now(),
      });
      if (result.outcome === "not_found") {
        return {
          ok: false as const,
          status: 404 as const,
          error: "Discovery candidate was not found.",
        };
      }
      if (result.outcome === "conflict") {
        return {
          ok: false as const,
          status: 409 as const,
          error: "This discovery candidate changed before the status update.",
          candidate: result.candidate,
        };
      }
      return { ok: true as const, candidate: result.candidate };
    },

    async getCandidateResearch(
      actor: DiscoveryAdminActor,
      candidateId: string,
    ) {
      if (!isAdministrator(actor)) {
        return {
          ok: false as const,
          status: 403 as const,
          error: "Administrator access is required.",
        };
      }
      const parsedCandidateId = candidateIdSchema.safeParse(candidateId);
      if (!parsedCandidateId.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Submit a valid discovery candidate id.",
          errors: {
            candidateId: "Discovery candidate id must be a valid UUID.",
          },
        };
      }

      const result =
        await dependencies.repository.getCandidateResearchVersions(
          parsedCandidateId.data,
          25,
        );
      if (!result) {
        return {
          ok: false as const,
          status: 404 as const,
          error: "Discovery candidate was not found.",
        };
      }
      const versionDto = (
        version: NonNullable<typeof result.latest>,
      ) => ({
        id: version.id,
        discoveryRunId: version.discoveryRunId,
        summary: version.summary,
        findings: version.findings,
        sourceUrls: version.sourceUrls,
        analysisVersion: version.analysisVersion,
        createdAt: version.createdAt.toISOString(),
      });
      return {
        ok: true as const,
        research: {
          candidateId: result.candidateId,
          latest: result.latest ? versionDto(result.latest) : null,
          history: result.history.map(versionDto),
        },
      };
    },

    async getAdminSummary(
      actor: DiscoveryAdminActor,
      input: unknown = {},
    ) {
      if (!isAdministrator(actor)) {
        return {
          ok: false as const,
          status: 403 as const,
          error: "Administrator access is required.",
        };
      }
      const parsed = discoveryFiltersSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Review the discovery filters.",
          errors: validationDetails(parsed.error),
        };
      }

      const current = now();
      const todayStart = new Date(
        `${indiaLocalDate(current)}T00:00:00+05:30`,
      );
      const snapshot = await dependencies.repository.getAdminSummary({
        ...parsed.data,
        todayStart,
      });
      return { ok: true as const, snapshot };
    },
  };
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;
