import { z } from "zod";

import {
  globalRadarDemandFamilyLookup,
  globalRadarLeafIdentifierLookup,
  globalRadarThemes,
  indiaRelevanceTypeLookup,
  signalClassLookup,
  signalStatusLookup,
  type SignalClass,
} from "../../domain/global-radar";
import {
  serializeGlobalRadarMutationEntity,
  serializeGlobalRadarMutationWatchlistEntry,
  serializeGlobalRadarRun,
  serializeGlobalRadarSignalDetail,
  serializeGlobalRadarSignalListItem,
  serializeGlobalRadarWatchlistItem,
} from "./dto";
import type { GlobalRadarAdminActor } from "./run-service";

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().uuid();
const reasonSchema = z.string().trim().min(1).max(2_000);
const recordSchema = z.record(z.string(), z.unknown());

const envelopeShape = {
  expectedRevision: z.number().int().min(0),
  idempotencyKey: idempotencyKeySchema,
  reason: reasonSchema,
} as const;

const reviewSchema = z.strictObject({
  ...envelopeShape,
  command: z.strictObject({
    type: z.enum([
      "request_review",
      "monitor",
      "qualify",
      "dismiss",
      "expire",
      "reopen",
      "mark_no_india_fit",
    ]),
  }),
});

const classificationSchema = z.strictObject({
  ...envelopeShape,
  classification: recordSchema,
});

const expirySchema = z.strictObject({
  ...envelopeShape,
  expiry: z.strictObject({
    evergreen: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    reobserveBy: z.string().datetime({ offset: true }).nullable(),
  }),
});

const evidenceSchema = z.strictObject({
  ...envelopeShape,
  evidence: recordSchema,
});

const noteSchema = z.strictObject({
  ...envelopeShape,
  body: z.string().trim().min(1).max(2_000),
});

const mergeSchema = z.strictObject({
  survivorSignalId: uuidSchema,
  duplicateSignalId: uuidSchema,
  expectedSurvivorRevision: z.number().int().min(0),
  expectedDuplicateRevision: z.number().int().min(0),
  confirmed: z.literal(true),
  idempotencyKey: idempotencyKeySchema,
  reason: reasonSchema,
});

const watchlistSchema = z.strictObject({
  entity: recordSchema,
  expectedEntryRevision: z.number().int().min(0).nullable(),
  idempotencyKey: idempotencyKeySchema,
  reason: reasonSchema,
  configuration: recordSchema,
});

type RepositoryResult = Readonly<Record<string, unknown>>;

export type GlobalRadarAdminRepositoryPort = Readonly<{
  listSignals(input: unknown): Promise<RepositoryResult>;
  getClassMetrics(input: unknown): Promise<RepositoryResult>;
  getOverviewMetrics(input: unknown): Promise<RepositoryResult>;
  getSignalDetail(signalId: string): Promise<RepositoryResult>;
  listWatchlist(input: { page: number }): Promise<RepositoryResult>;
  getWatchlistEnrichment(input: {
    globalEntityIds: readonly string[];
    now: Date;
  }): Promise<RepositoryResult>;
  listRuns(input: { page: number }): Promise<RepositoryResult>;
  reviewSignal(input: unknown): Promise<RepositoryResult>;
  editSignalClassification(input: unknown): Promise<RepositoryResult>;
  editDirectDemandExpiry(input: unknown): Promise<RepositoryResult>;
  appendEvidence(input: unknown): Promise<RepositoryResult>;
  appendNote(input: unknown): Promise<RepositoryResult>;
  mergeSignals(input: unknown): Promise<RepositoryResult>;
  upsertWatchlist(input: unknown): Promise<RepositoryResult>;
}>;

export type GlobalRadarAdminServiceDependencies = Readonly<{
  repository: GlobalRadarAdminRepositoryPort;
  adminEmails: readonly string[];
  queueManualRun(input: {
    actor: GlobalRadarAdminActor;
    input: unknown;
  }): Promise<unknown>;
  promote(input: {
    actor: GlobalRadarAdminActor;
    input: unknown;
  }): Promise<unknown>;
  reversePromotion(input: {
    actor: GlobalRadarAdminActor;
    input: unknown;
  }): Promise<unknown>;
  now?: () => Date;
}>;

type ParsedSignalFilters = Record<string, string | number>;

const KOLKATA_OFFSET_MILLISECONDS = 5.5 * 60 * 60 * 1_000;
const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function calendarDateToKolkataInstant(
  value: string,
  nextDay: boolean,
): string | null {
  const match = calendarDatePattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(Date.UTC(year, month - 1, day));
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(
    local.getTime() + (nextDay ? 86_400_000 : 0) - KOLKATA_OFFSET_MILLISECONDS,
  ).toISOString();
}

function normalizedTimestamp(
  value: unknown,
  nextDayForCalendarDate: boolean,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const calendar = calendarDateToKolkataInstant(
    trimmed,
    nextDayForCalendarDate,
  );
  if (calendar) return calendar;
  const parsed = z.string().datetime({ offset: true }).safeParse(trimmed);
  return parsed.success ? new Date(parsed.data).toISOString() : null;
}

function normalizedPage(value: unknown): number | null {
  const normalized =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return Number.isInteger(normalized) && Number(normalized) >= 1 &&
    Number(normalized) <= 100
    ? Number(normalized)
    : null;
}

function normalizedFilters(
  signalClass: SignalClass,
  value: unknown,
): ParsedSignalFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const common = new Set([
    "status",
    "country",
    "indiaRelevance",
    "demandDomain",
    "capability",
    "observedFrom",
    "observedTo",
    "page",
  ]);
  const classKey =
    signalClass === "direct_demand"
      ? "expiresBefore"
      : signalClass === "demand_precursor"
        ? "horizon"
        : "theme";
  if (Object.keys(source).some((key) => !common.has(key) && key !== classKey)) {
    return null;
  }
  const filters: ParsedSignalFilters = {};
  if (source.page !== undefined) {
    const page = normalizedPage(source.page);
    if (!page) return null;
    filters.page = page;
  }
  if (source.status !== undefined) {
    if (
      typeof source.status !== "string" ||
      !signalStatusLookup[source.status as keyof typeof signalStatusLookup]
    ) {
      return null;
    }
    filters.status = source.status;
  }
  if (source.indiaRelevance !== undefined) {
    if (
      typeof source.indiaRelevance !== "string" ||
      !indiaRelevanceTypeLookup[
        source.indiaRelevance as keyof typeof indiaRelevanceTypeLookup
      ]
    ) {
      return null;
    }
    filters.indiaRelevance = source.indiaRelevance;
  }
  for (const key of ["country", "demandDomain", "capability", "theme"] as const) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== "string") return null;
    const text = source[key].trim();
    if (text.length < 1 || text.length > 200) return null;
    if (
      key === "demandDomain" &&
      !globalRadarDemandFamilyLookup[
        text as keyof typeof globalRadarDemandFamilyLookup
      ]
    ) return null;
    if (
      key === "capability" &&
      !globalRadarLeafIdentifierLookup[
        text as keyof typeof globalRadarLeafIdentifierLookup
      ]
    ) return null;
    if (
      key === "theme" &&
      !globalRadarThemes.includes(text as (typeof globalRadarThemes)[number])
    ) return null;
    filters[key] = text;
  }
  for (const key of ["observedFrom", "observedTo", "expiresBefore"] as const) {
    if (source[key] === undefined) continue;
    const timestamp = normalizedTimestamp(
      source[key],
      key === "observedTo" || key === "expiresBefore",
    );
    if (!timestamp) return null;
    filters[key] = timestamp;
  }
  if (
    typeof filters.observedFrom === "string" &&
    typeof filters.observedTo === "string" &&
    filters.observedFrom >= filters.observedTo
  ) return null;
  if (source.horizon !== undefined) {
    if (
      typeof source.horizon !== "string" ||
      ![
        "within_30_days",
        "days_31_to_90",
        "days_91_to_180",
        "days_181_to_365",
        "unknown",
      ].includes(source.horizon)
    ) return null;
    filters.horizon = source.horizon;
  }
  return filters;
}

function normalizeActor(
  actor: GlobalRadarAdminActor | null | undefined,
  allowlist: ReadonlySet<string>,
): GlobalRadarAdminActor | null {
  if (!actor || !uuidSchema.safeParse(actor.userId).success) return null;
  const email = actor.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success || !allowlist.has(email)) {
    return null;
  }
  return { userId: actor.userId.toLowerCase(), email };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === "number" && Number.isFinite(item))
      .map(([key, item]) => [key, item as number]),
  );
}

function metricsRecord(value: unknown) {
  const source = (value ?? {}) as Record<string, unknown>;
  const india = (source.india ?? {}) as Record<string, unknown>;
  const countries = (source.countries ?? {}) as Record<string, unknown>;
  const requirementMix = (source.requirementMix ?? {}) as Record<string, unknown>;
  const horizon = (source.horizon ?? {}) as Record<string, unknown>;
  return {
    total: numberValue(source.total),
    highQuality: numberValue(source.highQuality),
    byStatus: numberMap(source.byStatus),
    india: {
      explicit: numberValue(india.explicit),
      inferred: numberValue(india.inferred),
      other: numberValue(india.other),
    },
    countries: {
      unitedStates: numberValue(countries.unitedStates),
      china: numberValue(countries.china),
      other: numberValue(countries.other),
    },
    requirementMix: {
      physicalData: numberValue(requirementMix.physicalData),
      hardware: numberValue(requirementMix.hardware),
    },
    demandFamilies: numberMap(source.demandFamilies),
    active: numberValue(source.active),
    expiring: numberValue(source.expiring),
    horizon: {
      within30Days: numberValue(horizon.within30Days),
      days31To90: numberValue(horizon.days31To90),
      days91To180: numberValue(horizon.days91To180),
      days181To365: numberValue(horizon.days181To365),
      unknown: numberValue(horizon.unknown),
    },
    qualified: numberValue(source.qualified),
  };
}

function overviewRecord(value: unknown) {
  const source = (value ?? {}) as Record<string, unknown>;
  const india = (source.india ?? {}) as Record<string, unknown>;
  const countries = (source.countries ?? {}) as Record<string, unknown>;
  const requirementMix = (source.requirementMix ?? {}) as Record<
    string,
    unknown
  >;
  const latest =
    source.latestRun && typeof source.latestRun === "object"
      ? (source.latestRun as Record<string, unknown>)
      : null;
  const capabilityFamilies = Array.isArray(source.capabilityFamilies)
    ? source.capabilityFamilies.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const candidate = item as Record<string, unknown>;
        return typeof candidate.capability === "string"
          ? [
              {
                capability: candidate.capability,
                signals: numberValue(candidate.signals),
              },
            ]
          : [];
      })
    : [];
  return {
    newSignals: numberValue(source.newSignals),
    activeDirectDemand: numberValue(source.activeDirectDemand),
    highQualityPrecursors: numberValue(source.highQualityPrecursors),
    india: {
      explicit: numberValue(india.explicit),
      inferred: numberValue(india.inferred),
    },
    countries: {
      unitedStates: numberValue(countries.unitedStates),
      china: numberValue(countries.china),
      other: numberValue(countries.other),
    },
    requirementMix: {
      physicalData: numberValue(requirementMix.physicalData),
      hardware: numberValue(requirementMix.hardware),
    },
    capabilityFamilies,
    expiringDirectDemand: numberValue(source.expiringDirectDemand),
    promotionCount: numberValue(source.promotedEntities),
    latestRun: latest
      ? {
          id: String(latest.id ?? ""),
          status: String(latest.status ?? ""),
          completedAt:
            latest.completedAt === null
              ? null
              : new Date(latest.completedAt as string | Date).toISOString(),
          createdAt: new Date(latest.createdAt as string | Date).toISOString(),
        }
      : null,
    sourceErrors: numberValue(source.sourceErrors),
    mergedDuplicates: numberValue(source.mergedDuplicates),
  };
}

function resultRecord(value: unknown): RepositoryResult {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RepositoryResult)
    : { outcome: "conflict", reason: "invalid_input" };
}

const safeMutationReasons = new Set([
  "already_merged",
  "classification_requirements_not_met",
  "duplicate_signal",
  "entity_identity_conflict",
  "idempotency_mismatch",
  "invalid_input",
  "not_found",
  "qualification_requirements_not_met",
  "revision_mismatch",
  "transition_not_allowed",
]);

function safeMutationReason(value: unknown): string {
  return typeof value === "string" && safeMutationReasons.has(value)
    ? value
    : "invalid_input";
}

export function createGlobalRadarAdminService(
  dependencies: GlobalRadarAdminServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const adminEmails = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );

  function administrator(actor: GlobalRadarAdminActor | null | undefined) {
    return normalizeActor(actor, adminEmails);
  }

  async function getSignalDetail(
    actor: GlobalRadarAdminActor | null,
    signalId: unknown,
  ) {
    if (!administrator(actor)) return { outcome: "forbidden" as const };
    const id = uuidSchema.safeParse(signalId);
    if (!id.success) return { outcome: "invalid" as const };
    const result = await dependencies.repository.getSignalDetail(id.data);
    if (result.outcome === "not_found") return { outcome: "not_found" as const };
    if (result.outcome !== "found") return { outcome: "invalid" as const };
    return {
      outcome: "found" as const,
      detail: serializeGlobalRadarSignalDetail(result.detail),
    };
  }

  async function getClassSummary(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    if (!administrator(actor)) return { outcome: "forbidden" as const };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { outcome: "invalid" as const };
    }
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).some((key) => !["signalClass", "filters"].includes(key)) ||
      typeof input.signalClass !== "string" ||
      !signalClassLookup[input.signalClass as SignalClass]
    ) {
      return { outcome: "invalid" as const };
    }
    const signalClass = input.signalClass as SignalClass;
    const filters = normalizedFilters(signalClass, input.filters ?? {});
    if (!filters) return { outcome: "invalid" as const };
    const observedAt = now();
    const hasActiveFilters = Object.keys(filters).some(
      (key) => key !== "page",
    );
    const [list, classMetrics, overview, unfilteredClassMetrics] = await Promise.all([
      dependencies.repository.listSignals({ signalClass, filters }),
      dependencies.repository.getClassMetrics({
        signalClass,
        filters,
        now: observedAt,
      }),
      dependencies.repository.getOverviewMetrics({ now: observedAt }),
      hasActiveFilters
        ? dependencies.repository.getClassMetrics({
            signalClass,
            filters: {},
            now: observedAt,
          })
        : Promise.resolve(null),
    ]);
    if (
      list.outcome !== "listed" ||
      classMetrics.outcome !== "listed" ||
      overview.outcome !== "listed" ||
      (hasActiveFilters && unfilteredClassMetrics?.outcome !== "listed") ||
      !Array.isArray(list.items)
    ) {
      return { outcome: "invalid" as const };
    }
    const baselineMetrics = hasActiveFilters
      ? unfilteredClassMetrics?.metrics
      : classMetrics.metrics;
    return {
      outcome: "listed" as const,
      page: numberValue(list.page),
      pageSize: numberValue(list.pageSize),
      total: numberValue(list.total),
      hasAnySignals:
        numberValue(
          (baselineMetrics as Record<string, unknown> | null | undefined)
            ?.total,
        ) > 0,
      items: list.items.map(serializeGlobalRadarSignalListItem),
      metrics: {
        class: metricsRecord(classMetrics.metrics),
        ...overviewRecord(overview.metrics),
      },
    };
  }

  async function listRuns(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    if (!administrator(actor)) return { outcome: "forbidden" as const };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { outcome: "invalid" as const };
    }
    const source = value as Record<string, unknown>;
    if (Object.keys(source).some((key) => key !== "page")) {
      return { outcome: "invalid" as const };
    }
    const page = normalizedPage(source.page ?? 1);
    if (!page) return { outcome: "invalid" as const };
    const result = await dependencies.repository.listRuns({ page });
    if (result.outcome !== "listed" || !Array.isArray(result.runs)) {
      return { outcome: "invalid" as const };
    }
    return {
      outcome: "listed" as const,
      page: numberValue(result.page),
      pageSize: numberValue(result.pageSize),
      total: numberValue(result.total),
      runs: result.runs.map(serializeGlobalRadarRun),
    };
  }

  async function listWatchlist(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    if (!administrator(actor)) return { outcome: "forbidden" as const };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { outcome: "invalid" as const };
    }
    const source = value as Record<string, unknown>;
    if (Object.keys(source).some((key) => key !== "page")) {
      return { outcome: "invalid" as const };
    }
    const page = normalizedPage(source.page ?? 1);
    if (!page) return { outcome: "invalid" as const };
    const result = await dependencies.repository.listWatchlist({ page });
    if (result.outcome !== "listed" || !Array.isArray(result.entries)) {
      return { outcome: "invalid" as const };
    }
    const ids = result.entries.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const id = (item as Record<string, unknown>).globalEntityId;
      return typeof id === "string" ? [id] : [];
    });
    const enrichment = await dependencies.repository.getWatchlistEnrichment({
      globalEntityIds: ids,
      now: now(),
    });
    if (enrichment.outcome !== "listed" || !Array.isArray(enrichment.items)) {
      return { outcome: "invalid" as const };
    }
    const byEntityId = new Map(
      enrichment.items.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const candidate = item as Record<string, unknown>;
        return typeof candidate.globalEntityId === "string"
          ? [[candidate.globalEntityId, candidate] as const]
          : [];
      }),
    );
    return {
      outcome: "listed" as const,
      page: numberValue(result.page),
      pageSize: numberValue(result.pageSize),
      total: numberValue(result.total),
      entries: result.entries.map((item) => {
        const entry = resultRecord(item);
        const enrichmentItem = byEntityId.get(String(entry.globalEntityId));
        return serializeGlobalRadarWatchlistItem({
          ...entry,
          latestSignal: enrichmentItem?.latestSignal ?? null,
          expiry: enrichmentItem?.expiry ?? null,
          promotion: enrichmentItem?.promotion ?? null,
        });
      }),
    };
  }

  function signalMutationResult(value: unknown) {
    const result = resultRecord(value);
    if (result.outcome === "conflict") {
      return {
        outcome: "conflict" as const,
        reason: safeMutationReason(result.reason),
        httpStatus: 409 as const,
        ...(result.detail
          ? { latest: serializeGlobalRadarSignalDetail(result.detail) }
          : {}),
      };
    }
    if (
      (result.outcome === "updated" || result.outcome === "replayed") &&
      result.detail
    ) {
      return {
        outcome: result.outcome,
        detail: serializeGlobalRadarSignalDetail(result.detail),
      };
    }
    return { outcome: "invalid" as const };
  }

  function appendMutationResult(value: unknown) {
    const result = resultRecord(value);
    if (result.outcome === "conflict") {
      return {
        outcome: "conflict" as const,
        reason: safeMutationReason(result.reason),
        httpStatus: 409 as const,
        ...(result.detail
          ? { latest: serializeGlobalRadarSignalDetail(result.detail) }
          : {}),
      };
    }
    if (
      (result.outcome === "appended" || result.outcome === "replayed") &&
      typeof result.revision === "number" &&
      Number.isInteger(result.revision) &&
      result.revision >= 0
    ) {
      return { outcome: result.outcome, revision: result.revision };
    }
    return { outcome: "invalid" as const };
  }

  function mergeMutationResult(value: unknown) {
    const result = resultRecord(value);
    if (result.outcome === "conflict") {
      return {
        outcome: "conflict" as const,
        reason: safeMutationReason(result.reason),
        httpStatus: 409 as const,
        ...(result.survivor
          ? {
              survivor: serializeGlobalRadarSignalDetail(result.survivor),
            }
          : {}),
        ...(result.duplicate
          ? {
              duplicate: serializeGlobalRadarSignalDetail(result.duplicate),
            }
          : {}),
      };
    }
    if (
      (result.outcome === "merged" || result.outcome === "replayed") &&
      result.survivor &&
      result.duplicate
    ) {
      return {
        outcome: result.outcome,
        survivor: serializeGlobalRadarSignalDetail(result.survivor),
        duplicate: serializeGlobalRadarSignalDetail(result.duplicate),
      };
    }
    return { outcome: "invalid" as const };
  }

  function watchlistMutationResult(value: unknown) {
    const result = resultRecord(value);
    if (result.outcome === "conflict") {
      return {
        outcome: "conflict" as const,
        reason: safeMutationReason(result.reason),
        httpStatus: 409 as const,
        ...(result.entity
          ? { entity: serializeGlobalRadarMutationEntity(result.entity) }
          : {}),
        ...(result.entry
          ? {
              entry: serializeGlobalRadarMutationWatchlistEntry(result.entry),
            }
          : {}),
      };
    }
    if (
      (result.outcome === "created" ||
        result.outcome === "updated" ||
        result.outcome === "replayed") &&
      result.entity &&
      result.entry
    ) {
      return {
        outcome: result.outcome,
        entity: serializeGlobalRadarMutationEntity(result.entity),
        entry: serializeGlobalRadarMutationWatchlistEntry(result.entry),
      };
    }
    return { outcome: "invalid" as const };
  }

  function envelope(
    actor: GlobalRadarAdminActor,
    input: {
      expectedRevision: number;
      idempotencyKey: string;
      reason: string;
    },
  ) {
    return {
      actor,
      envelope: {
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey.toLowerCase(),
        reason: input.reason,
        now: now(),
      },
    };
  }

  async function reviewSignal(
    actor: GlobalRadarAdminActor | null,
    signalId: unknown,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const id = uuidSchema.safeParse(signalId);
    const parsed = reviewSchema.safeParse(value);
    if (!id.success || !parsed.success) return { outcome: "invalid" as const };
    return signalMutationResult(
      await dependencies.repository.reviewSignal({
        signalId: id.data,
        ...envelope(admin, parsed.data),
        command: parsed.data.command,
      }),
    );
  }

  async function editClassification(
    actor: GlobalRadarAdminActor | null,
    signalId: unknown,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const id = uuidSchema.safeParse(signalId);
    const parsed = classificationSchema.safeParse(value);
    if (!id.success || !parsed.success) return { outcome: "invalid" as const };
    return signalMutationResult(
      await dependencies.repository.editSignalClassification({
        signalId: id.data,
        ...envelope(admin, parsed.data),
        classification: parsed.data.classification,
      }),
    );
  }

  async function editExpiry(
    actor: GlobalRadarAdminActor | null,
    signalId: unknown,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const id = uuidSchema.safeParse(signalId);
    const parsed = expirySchema.safeParse(value);
    if (!id.success || !parsed.success) return { outcome: "invalid" as const };
    return signalMutationResult(
      await dependencies.repository.editDirectDemandExpiry({
        signalId: id.data,
        ...envelope(admin, parsed.data),
        expiry: parsed.data.expiry,
      }),
    );
  }

  async function appendEvidence(
    actor: GlobalRadarAdminActor | null,
    signalId: unknown,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const id = uuidSchema.safeParse(signalId);
    const parsed = evidenceSchema.safeParse(value);
    if (!id.success || !parsed.success) return { outcome: "invalid" as const };
    return appendMutationResult(
      await dependencies.repository.appendEvidence({
        signalId: id.data,
        ...envelope(admin, parsed.data),
        evidence: parsed.data.evidence,
      }),
    );
  }

  async function appendNote(
    actor: GlobalRadarAdminActor | null,
    signalId: unknown,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const id = uuidSchema.safeParse(signalId);
    const parsed = noteSchema.safeParse(value);
    if (!id.success || !parsed.success) return { outcome: "invalid" as const };
    return appendMutationResult(
      await dependencies.repository.appendNote({
        signalId: id.data,
        ...envelope(admin, parsed.data),
        body: parsed.data.body,
      }),
    );
  }

  async function mergeSignals(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const parsed = mergeSchema.safeParse(value);
    if (!parsed.success) return { outcome: "invalid" as const };
    return mergeMutationResult(
      await dependencies.repository.mergeSignals({
        ...parsed.data,
        actor: admin,
        now: now(),
      }),
    );
  }

  async function upsertWatchlist(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    const parsed = watchlistSchema.safeParse(value);
    if (!parsed.success) return { outcome: "invalid" as const };
    return watchlistMutationResult(
      await dependencies.repository.upsertWatchlist({
        entity: parsed.data.entity,
        expectedEntryRevision: parsed.data.expectedEntryRevision,
        actor: admin,
        envelope: {
          idempotencyKey: parsed.data.idempotencyKey,
          reason: parsed.data.reason,
          now: now(),
        },
        configuration: parsed.data.configuration,
      }),
    );
  }

  async function delegate(
    actor: GlobalRadarAdminActor | null,
    input: unknown,
    operation: GlobalRadarAdminServiceDependencies["queueManualRun"],
  ) {
    const admin = administrator(actor);
    if (!admin) return { outcome: "forbidden" as const };
    return operation({ actor: admin, input });
  }

  return {
    getSignalDetail,
    getClassSummary,
    listRuns,
    listWatchlist,
    reviewSignal,
    editClassification,
    editExpiry,
    appendEvidence,
    appendNote,
    mergeSignals,
    upsertWatchlist,
    queueManual: (actor: GlobalRadarAdminActor | null, input: unknown) =>
      delegate(actor, input, dependencies.queueManualRun),
    promote: (actor: GlobalRadarAdminActor | null, input: unknown) =>
      delegate(actor, input, dependencies.promote),
    reversePromotion: (
      actor: GlobalRadarAdminActor | null,
      input: unknown,
    ) => delegate(actor, input, dependencies.reversePromotion),
  };
}

export type GlobalRadarAdminService = ReturnType<
  typeof createGlobalRadarAdminService
>;
