import { z } from "zod";

import { normalizePublicHttpUrl } from "../public-url";
import {
  GLOBAL_RADAR_TAXONOMY_VERSION,
  globalRadarQueryIntents,
  globalRadarSourceFamilies,
  globalRadarThemes,
} from "../taxonomies/global-radar-v1";

const MAX_BOUNDED_RECORD_BYTES = 8_192;
const MAX_BOUNDED_RECORD_ARRAY_LENGTH = 100;
const MAX_BOUNDED_RECORD_STRING_CHARACTERS = 4_096;
const MAX_BOUNDED_RECORD_STRING_LENGTH = 2_048;
const MAX_BOUNDED_RECORD_KEYS = 20;
const MAX_BOUNDED_RECORD_KEY_LENGTH = 64;
const MAX_BOUNDED_RECORD_DEPTH = 3;
const MAX_BOUNDED_STRING_ARRAY_ITEMS = 50;
const MAX_BUSINESS_EMAIL_LENGTH = 254;
const MAX_COUNTRY_LENGTH = 100;
const MAX_LANGUAGE_LENGTH = 35;
const MAX_ENTITY_NAME_LENGTH = 200;
const MAX_EVIDENCE_CLAIM_LENGTH = 1_000;
const MAX_EVIDENCE_EXCERPT_LENGTH = 500;
const MAX_EVIDENCE_SUMMARY_LENGTH = 2_000;
const MAX_SOURCE_NAME_LENGTH = 200;
const MAX_SUPPORTED_FIELD_PATHS = 50;
const MAX_SIGNAL_SUMMARY_LENGTH = 2_000;
const MAX_SIGNAL_TITLE_LENGTH = 300;
const MAX_BATCH_EVIDENCE_ITEMS = 100;
const MAX_BATCH_REQUIREMENTS = 100;
export const MAX_GLOBAL_RADAR_BATCH_BYTES = 2 * 1_024 * 1_024;
export const MAX_PUBLIC_HTTP_URL_LENGTH = 2_048;
const MAX_BATCH_EXECUTED_QUERIES = 120;
const MAX_BATCH_ENTITIES = 50;
const MAX_BATCH_SIGNALS = 20;
const MAX_BATCH_SOURCE_ERRORS = 50;
const MAX_QUERY_LENGTH = 1_000;
const MAX_QUERY_RESULTS_EXAMINED = 10_000;
const MAX_REQUIREMENT_SUMMARY_LENGTH = 1_000;
const MAX_SHORT_STRING_LENGTH = 200;
const MAX_SOURCE_ERROR_LENGTH = 1_000;
const MAX_SUPPORTED_FIELD_PATH_LENGTH = 200;
const BATCH_BYTES_MESSAGE =
  "Global Radar batch must be at most 2097152 bytes.";
const DOCUMENT_MARKUP_MESSAGE =
  "Concise text must not contain HTML or document markup.";
const RECORD_PAGE_CONTENT_MESSAGE =
  "Record must not contain full-page content.";
const SOURCE_ERROR_QUERY_REFERENCE_MESSAGE =
  "Source error query fingerprint must reference an executed query.";
const forbiddenRecordKeys = new Set([
  "body",
  "document",
  "documentcontent",
  "fullpage",
  "fullpagecontent",
  "html",
  "pagebody",
  "pagecontent",
  "rawbody",
  "rawcontent",
  "responsebody",
  "responsecontent",
]);
const documentMarkupPattern =
  /<(?:!doctype\b|\?xml\b|!\[cdata\[|\/?[a-z][a-z0-9:-]*(?:\s[^<>]*?)?\/?>)/i;

export const GLOBAL_RADAR_SCHEMA_VERSION = "global-radar-batch-v1" as const;
export const GLOBAL_RADAR_PROMPT_VERSION = "codex-public-web-v1" as const;

function createLookup<const Values extends readonly string[]>(
  values: Values,
): Readonly<Record<Values[number], true>> {
  return Object.freeze(
    Object.fromEntries(values.map((value) => [value, true])),
  ) as Readonly<Record<Values[number], true>>;
}

export const signalClasses = [
  "direct_demand",
  "demand_precursor",
  "ecosystem_momentum",
] as const;

export const indiaRelevanceTypes = [
  "explicit_India",
  "existing_India_presence",
  "India_expansion",
  "globally_open",
  "inferred_India_compatible",
  "no_current_India_fit",
] as const;

export const signalStatuses = [
  "newly_discovered",
  "needs_review",
  "monitoring",
  "qualified",
  "dismissed",
  "expired",
  "promoted",
] as const;

export const requirementKinds = [
  "physical_data",
  "robotics_hardware",
  "manufacturing",
  "deployment",
  "market_access",
  "research",
  "operational_service",
] as const;

export const radarRunStatuses = [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
] as const;

export const radarRunTriggers = ["scheduled", "manual", "trial"] as const;

export const radarScanModes = [
  "daily",
  "thematic",
  "watchlist_refresh",
  "manual",
] as const;

export const promotionEligibilityPaths = [
  "qualified_india_direct_demand",
  "repeated_india_compatible_signals",
  "documented_indian_relationship",
  "exceptional_strategic_relevance",
] as const;

export const professionalResponsePathTypes = [
  "supplier_or_partner_registration",
  "procurement_or_rfp_portal",
  "distributor_application",
  "official_enquiry_or_india_contact",
  "research_form",
  "official_business_email",
] as const;

export const signalClassLookup = createLookup(signalClasses);
export const indiaRelevanceTypeLookup = createLookup(indiaRelevanceTypes);
export const signalStatusLookup = createLookup(signalStatuses);
export const requirementKindLookup = createLookup(requirementKinds);
export const radarRunStatusLookup = createLookup(radarRunStatuses);
export const radarRunTriggerLookup = createLookup(radarRunTriggers);
export const radarScanModeLookup = createLookup(radarScanModes);
export const promotionEligibilityPathLookup = createLookup(
  promotionEligibilityPaths,
);
export const professionalResponsePathTypeLookup = createLookup(
  professionalResponsePathTypes,
);

export const publicHttpUrlSchema = z
  .string()
  .max(MAX_PUBLIC_HTTP_URL_LENGTH, {
    message: "Global Radar URL must be at most 2048 characters.",
  })
  .transform((value, context) => {
    try {
      return normalizePublicHttpUrl(value, "Global Radar URL");
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Global Radar URL is invalid.",
      });
      return z.NEVER;
    }
  });

export const boundedShortStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SHORT_STRING_LENGTH);

export const nullableBoundedStringArraySchema = z
  .array(boundedShortStringSchema)
  .max(MAX_BOUNDED_STRING_ARRAY_ITEMS)
  .nullable();

function trySerializedJsonByteLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? null
      : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return null;
  }
}

export function serializedJsonByteLength(value: unknown): number {
  return trySerializedJsonByteLength(value) ?? Number.POSITIVE_INFINITY;
}

type RecordInspectionTask =
  | { action: "visit"; value: unknown; depth: number }
  | { action: "leave"; value: object };

type RecordInspectionIssue =
  | "array_length"
  | "bytes"
  | "depth"
  | "document_markup"
  | "forbidden_key"
  | "invalid"
  | "key_length"
  | "page_content"
  | "keys";

function inspectBoundedRecord(
  record: Record<string, unknown>,
): RecordInspectionIssue | null {
  const serializedBytes = trySerializedJsonByteLength(record);
  if (
    serializedBytes !== null &&
    serializedBytes > MAX_BOUNDED_RECORD_BYTES
  ) {
    return "bytes";
  }

  const activeObjects = new Set<object>();
  const tasks: RecordInspectionTask[] = [
    { action: "visit", value: record, depth: 1 },
  ];
  let keyCount = 0;
  let stringCharacterCount = 0;
  let workUnits = 0;

  try {
    while (tasks.length > 0) {
      const task = tasks.pop();
      if (!task) break;
      if (task.action === "leave") {
        activeObjects.delete(task.value);
        continue;
      }

      workUnits += 1;
      if (workUnits > MAX_BOUNDED_RECORD_BYTES) return "bytes";

      const { value, depth } = task;
      if (typeof value === "string") {
        if (documentMarkupPattern.test(value)) return "document_markup";
        stringCharacterCount += value.length;
        if (
          value.length > MAX_BOUNDED_RECORD_STRING_LENGTH ||
          stringCharacterCount > MAX_BOUNDED_RECORD_STRING_CHARACTERS
        ) {
          return "page_content";
        }
        continue;
      }
      if (value === null || typeof value === "boolean") {
        continue;
      }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return "invalid";
        continue;
      }
      if (typeof value !== "object" || activeObjects.has(value)) {
        return "invalid";
      }
      if (depth > MAX_BOUNDED_RECORD_DEPTH) return "depth";

      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (!array && prototype !== Object.prototype && prototype !== null) {
        return "invalid";
      }

      activeObjects.add(value);
      tasks.push({ action: "leave", value });

      if (array) {
        if (value.length > MAX_BOUNDED_RECORD_ARRAY_LENGTH) {
          return "array_length";
        }
        if (Object.hasOwn(value, "toJSON")) return "invalid";
        for (const key in value) {
          if (
            Object.hasOwn(value, key) &&
            (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
          ) {
            return "invalid";
          }
        }
        for (let index = value.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, index);
          if (!descriptor?.enumerable) continue;
          if (!("value" in descriptor)) return "invalid";
          tasks.push({
            action: "visit",
            value: descriptor.value,
            depth: depth + 1,
          });
        }
        continue;
      }

      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.hasOwn(descriptors, "toJSON")) return "invalid";
      const entries = Object.entries(descriptors).filter(
        ([, descriptor]) => descriptor.enumerable,
      );
      keyCount += entries.length;
      if (keyCount > MAX_BOUNDED_RECORD_KEYS) return "keys";

      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, descriptor] = entries[index];
        if (key.length > MAX_BOUNDED_RECORD_KEY_LENGTH) {
          return "key_length";
        }
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (forbiddenRecordKeys.has(normalizedKey)) {
          return "forbidden_key";
        }
        if (!("value" in descriptor)) return "invalid";
        tasks.push({
          action: "visit",
          value: descriptor.value,
          depth: depth + 1,
        });
      }
    }
  } catch {
    return "invalid";
  }

  return null;
}

const boundedRecordMessages = {
  array_length: "Record arrays must contain at most 100 elements.",
  bytes: "Record must be at most 8192 serialized bytes.",
  depth: "Record must have JSON depth at most 3.",
  document_markup: RECORD_PAGE_CONTENT_MESSAGE,
  forbidden_key: RECORD_PAGE_CONTENT_MESSAGE,
  invalid: "Record must contain only JSON-compatible values.",
  key_length: "Record keys must be at most 64 characters.",
  page_content: RECORD_PAGE_CONTENT_MESSAGE,
  keys: "Record must contain at most 20 keys.",
} as const;

export const boundedRecordSchema = z.preprocess(
  (input, context) => {
    if (input !== null && typeof input === "object") {
      const issue = inspectBoundedRecord(input as Record<string, unknown>);
      if (issue) {
        context.addIssue({
          code: "custom",
          message: boundedRecordMessages[issue],
        });
      }
    }
    return input;
  },
  z.record(z.string(), z.unknown()),
);

export const scoreComponentSchema = z.number().int().min(0).max(100);
export const confidenceSchema = scoreComponentSchema;
export const isoTimestampSchema = z.string().datetime({ offset: true });

export const businessEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(MAX_BUSINESS_EMAIL_LENGTH);

export const professionalResponsePathSchema = z
  .strictObject({
    type: z.enum(professionalResponsePathTypes),
    url: publicHttpUrlSchema.nullable(),
    businessEmail: businessEmailSchema.nullable(),
    evidenceUrl: publicHttpUrlSchema,
  })
  .superRefine((path, context) => {
    const emailPath = path.type === "official_business_email";
    if (emailPath && (!path.businessEmail || path.url !== null)) {
      context.addIssue({
        code: "custom",
        message: "Official business email paths require only a business email.",
      });
    }
    if (!emailPath && (!path.url || path.businessEmail !== null)) {
      context.addIssue({
        code: "custom",
        message: "Professional response paths require only a public URL.",
      });
    }
  });

export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

function boundedRequiredString(maximumLength: number) {
  return z.string().trim().min(1).max(maximumLength);
}

function conciseRequiredString(maximumLength: number) {
  return boundedRequiredString(maximumLength).refine(
    (value) => !documentMarkupPattern.test(value),
    { message: DOCUMENT_MARKUP_MESSAGE },
  );
}

export const executedQuerySchema = z.strictObject({
  fingerprint: fingerprintSchema,
  query: boundedRequiredString(MAX_QUERY_LENGTH),
  language: boundedRequiredString(MAX_LANGUAGE_LENGTH),
  sourceCountry: boundedRequiredString(MAX_COUNTRY_LENGTH),
  theme: z.enum(globalRadarThemes),
  signalIntent: z.enum(globalRadarQueryIntents),
  sourceAdapter: z.literal("codex_public_web"),
  executedAt: isoTimestampSchema,
  resultsExamined: z.number().int().min(0).max(MAX_QUERY_RESULTS_EXAMINED),
  error: boundedRequiredString(MAX_SOURCE_ERROR_LENGTH).nullable(),
});

export const linkedinOrganizationUrlSchema = publicHttpUrlSchema.refine(
  (value) => {
    const url = new URL(value);
    return (
      url.hostname === "linkedin.com" &&
      /^\/(company|school|showcase)\/[^/]+\/?$/i.test(url.pathname)
    );
  },
  { message: "LinkedIn organization URL must identify a public organization." },
);

export const observedEntitySchema = z.strictObject({
  name: boundedRequiredString(MAX_ENTITY_NAME_LENGTH),
  websiteUrl: publicHttpUrlSchema.nullable(),
  linkedinOrganizationUrl: linkedinOrganizationUrlSchema.nullable(),
  sourceCountry: boundedRequiredString(MAX_COUNTRY_LENGTH),
  rawMetadata: boundedRecordSchema,
});

export const evidenceSchema = z.strictObject({
  sourceUrl: publicHttpUrlSchema,
  sourceName: boundedRequiredString(MAX_SOURCE_NAME_LENGTH),
  sourceFamily: z.enum(globalRadarSourceFamilies),
  sourceLanguage: boundedRequiredString(MAX_LANGUAGE_LENGTH),
  sourceCountry: boundedRequiredString(MAX_COUNTRY_LENGTH),
  claim: conciseRequiredString(MAX_EVIDENCE_CLAIM_LENGTH),
  excerpt: conciseRequiredString(MAX_EVIDENCE_EXCERPT_LENGTH).nullable(),
  englishSummary: conciseRequiredString(MAX_EVIDENCE_SUMMARY_LENGTH),
  publishedAt: isoTimestampSchema.nullable(),
  observedAt: isoTimestampSchema,
  evidenceConfidence: confidenceSchema,
  translationConfidence: confidenceSchema.nullable(),
  isPrimarySource: z.boolean(),
  supportedFieldPaths: z
    .array(boundedRequiredString(MAX_SUPPORTED_FIELD_PATH_LENGTH))
    .min(1)
    .max(MAX_SUPPORTED_FIELD_PATHS),
  rawMetadata: boundedRecordSchema,
});

export const requirementSchema = z.strictObject({
  kind: z.enum(requirementKinds),
  summary: conciseRequiredString(MAX_REQUIREMENT_SUMMARY_LENGTH),
  confidence: confidenceSchema,
  rawMetadata: boundedRecordSchema,
});

export const signalDraftSchema = z.strictObject({
  signalClass: z.enum(signalClasses),
  title: conciseRequiredString(MAX_SIGNAL_TITLE_LENGTH),
  factualSummary: conciseRequiredString(MAX_SIGNAL_SUMMARY_LENGTH),
  interpretationSummary: conciseRequiredString(MAX_SIGNAL_SUMMARY_LENGTH),
  sourceCountry: boundedRequiredString(MAX_COUNTRY_LENGTH),
  observedAt: isoTimestampSchema,
  evidence: z.array(evidenceSchema).min(1).max(MAX_BATCH_EVIDENCE_ITEMS),
  requirements: z
    .array(requirementSchema)
    .min(1)
    .max(MAX_BATCH_REQUIREMENTS),
  rawMetadata: boundedRecordSchema,
});

export const sourceErrorSchema = z.strictObject({
  sourceName: boundedRequiredString(MAX_SOURCE_NAME_LENGTH),
  message: boundedRequiredString(MAX_SOURCE_ERROR_LENGTH),
  queryFingerprint: fingerprintSchema.nullable(),
});

const globalRadarBatchObjectSchema = z.strictObject({
  schemaVersion: z.literal(GLOBAL_RADAR_SCHEMA_VERSION),
  promptVersion: z.literal(GLOBAL_RADAR_PROMPT_VERSION),
  taxonomyVersion: z.literal(GLOBAL_RADAR_TAXONOMY_VERSION),
  runId: z.string().uuid(),
  planFingerprint: fingerprintSchema,
  executedQueries: z
    .array(executedQuerySchema)
    .max(MAX_BATCH_EXECUTED_QUERIES),
  entities: z.array(observedEntitySchema).max(MAX_BATCH_ENTITIES),
  signals: z.array(signalDraftSchema).max(MAX_BATCH_SIGNALS),
  sourceErrors: z.array(sourceErrorSchema).max(MAX_BATCH_SOURCE_ERRORS),
});

const normalizedGlobalRadarBatchSchema = globalRadarBatchObjectSchema.superRefine(
  (batch, context) => {
    const evidenceCount = batch.signals.reduce(
      (total, signal) => total + signal.evidence.length,
      0,
    );
    if (evidenceCount > MAX_BATCH_EVIDENCE_ITEMS) {
      context.addIssue({
        code: "custom",
        message: "Global Radar batch must contain at most 100 evidence items.",
        path: ["signals"],
      });
    }
    const requirementCount = batch.signals.reduce(
      (total, signal) => total + signal.requirements.length,
      0,
    );
    if (requirementCount > MAX_BATCH_REQUIREMENTS) {
      context.addIssue({
        code: "custom",
        message: "Global Radar batch must contain at most 100 requirements.",
        path: ["signals"],
      });
    }
    if (serializedJsonByteLength(batch) > MAX_GLOBAL_RADAR_BATCH_BYTES) {
      context.addIssue({
        code: "custom",
        message: BATCH_BYTES_MESSAGE,
      });
    }
    const hasRecordedFailure =
      batch.sourceErrors.length > 0 ||
      batch.executedQueries.some((query) => query.error !== null);
    if (batch.signals.length === 0 && hasRecordedFailure) {
      context.addIssue({
        code: "custom",
        message:
          "Global Radar batch with query or source errors must contain a valid signal.",
        path: ["signals"],
      });
    }
    const executedQueryFingerprints = new Set(
      batch.executedQueries.map((query) => query.fingerprint),
    );
    batch.sourceErrors.forEach((error, index) => {
      if (
        error.queryFingerprint !== null &&
        !executedQueryFingerprints.has(error.queryFingerprint)
      ) {
        context.addIssue({
          code: "custom",
          message: SOURCE_ERROR_QUERY_REFERENCE_MESSAGE,
          path: ["sourceErrors", index, "queryFingerprint"],
        });
      }
    });
  },
);

export const globalRadarBatchSchema = z.preprocess(
  (input, context) => {
    if (serializedJsonByteLength(input) > MAX_GLOBAL_RADAR_BATCH_BYTES) {
      context.addIssue({ code: "custom", message: BATCH_BYTES_MESSAGE });
    }
    return input;
  },
  normalizedGlobalRadarBatchSchema,
);

export type SignalClass = (typeof signalClasses)[number];
export type IndiaRelevanceType = (typeof indiaRelevanceTypes)[number];
export type SignalStatus = (typeof signalStatuses)[number];
export type RequirementKind = (typeof requirementKinds)[number];
export type RadarRunStatus = (typeof radarRunStatuses)[number];
export type RadarRunTrigger = (typeof radarRunTriggers)[number];
export type RadarScanMode = (typeof radarScanModes)[number];
export type PromotionEligibilityPath =
  (typeof promotionEligibilityPaths)[number];
export type ProfessionalResponsePathType =
  (typeof professionalResponsePathTypes)[number];
export type ProfessionalResponsePath = z.infer<
  typeof professionalResponsePathSchema
>;
export type ExecutedQuery = z.infer<typeof executedQuerySchema>;
export type ObservedEntity = z.infer<typeof observedEntitySchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type RequirementDraft = z.infer<typeof requirementSchema>;
export type SignalDraft = z.infer<typeof signalDraftSchema>;
export type SourceError = z.infer<typeof sourceErrorSchema>;
export type GlobalRadarBatch = z.infer<typeof globalRadarBatchSchema>;
