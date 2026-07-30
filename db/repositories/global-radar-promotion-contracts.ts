import { sql } from "drizzle-orm";

import {
  GLOBAL_RADAR_SCORE_VERSION,
  createGlobalRadarFingerprint,
  promotionEligibilityPaths,
  signalClasses,
  type PromotionEligibilityPath,
  type SignalClass,
} from "../../app/domain/global-radar";
import type {
  DiscoveryCandidate,
  DiscoveryRun,
  GlobalEntity,
  GlobalRadarPromotion,
  GlobalRadarSignal,
  GlobalSignalEvidence,
} from "../types";
import type { DiscoveryTransaction } from "./discovery-candidate-writer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 2_000;
const MAX_SUPPORTING_SIGNALS = 100;
export const REPEATED_SIGNAL_WINDOW_MS = 180 * 24 * 60 * 60 * 1_000;
export const PROMOTION_LOCK_NAMESPACE = "global-radar:promotion:v1:" as const;
export const REVERSAL_LOCK_NAMESPACE =
  "global-radar:promotion-reversal:v1:" as const;

export type GlobalRadarPromotionConfiguration = Readonly<{
  scoreVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
  thresholds: Readonly<Record<SignalClass, number>>;
}>;

export type GlobalRadarPromotionActor = Readonly<{
  userId: string;
  email: string;
}>;

export type PromoteGlobalRadarEntityInput = Readonly<{
  globalEntityId: string;
  primarySignalId: string;
  supportingSignalIds: readonly string[];
  eligibilityPath: PromotionEligibilityPath;
  expectedEntityRevision: number;
  expectedPrimarySignalRevision: number;
  expectedSupportingSignalRevisions: Readonly<Record<string, number>>;
  actor: GlobalRadarPromotionActor;
  idempotencyKey: string;
  reason: string;
  now: Date;
}>;

export type ReverseGlobalRadarPromotionInput = Readonly<{
  globalEntityId: string;
  expectedEntityRevision: number;
  expectedPrimarySignalRevision: number;
  actor: GlobalRadarPromotionActor;
  idempotencyKey: string;
  reason: string;
  now: Date;
}>;

export type LoadGlobalRadarPromotionContextInput = Readonly<{
  globalEntityId: string;
  primarySignalId: string;
  /** Additional administrator-selected signals; the primary may be omitted. */
  supportingSignalIds: readonly string[];
}>;

export type GlobalRadarPromotionConflictReason =
  | "invalid_input"
  | "not_found"
  | "administrator_required"
  | "idempotency_mismatch"
  | "active_promotion_exists"
  | "revision_mismatch"
  | "primary_signal_not_qualified"
  | "signal_entity_mismatch"
  | "supporting_signal_invalid"
  | "eligibility_not_met"
  | "candidate_identity_missing"
  | "candidate_mapping_invalid"
  | "source_evidence_missing"
  | "candidate_identity_conflict"
  | "promotion_reversed";

export type GlobalRadarReversalConflictReason =
  | "invalid_input"
  | "not_found"
  | "administrator_required"
  | "idempotency_mismatch"
  | "no_active_promotion"
  | "revision_mismatch"
  | "restoration_not_safe";

export type GlobalRadarPromotionSuccess = Readonly<{
  promotion: GlobalRadarPromotion;
  entity: GlobalEntity;
  primarySignal: GlobalRadarSignal;
  run: DiscoveryRun;
  candidate: DiscoveryCandidate;
}>;

export type PromoteGlobalRadarEntityResult =
  | ({ outcome: "promoted" | "replayed" } & GlobalRadarPromotionSuccess)
  | Readonly<{
      outcome: "conflict";
      reason: GlobalRadarPromotionConflictReason;
      promotion?: GlobalRadarPromotion;
    }>
  | Readonly<{
      outcome: "failed";
      reason: "persistence_failure";
      promotion: GlobalRadarPromotion;
    }>;

export type ReverseGlobalRadarPromotionResult =
  | Readonly<{
      outcome: "reversed" | "replayed";
      promotion: GlobalRadarPromotion;
      entity: GlobalEntity;
      primarySignal: GlobalRadarSignal;
    }>
  | Readonly<{
      outcome: "conflict";
      reason: GlobalRadarReversalConflictReason;
      promotion?: GlobalRadarPromotion;
    }>;

export type LoadedGlobalRadarPromotionContext = PromotionContext &
  Readonly<{
    /** Complete persisted selection, including the primary signal exactly once. */
    promotionSupportingSignalIds: string[];
    eligibilityFacts: Readonly<{
      hasPublicIdentityEvidence: boolean;
      hasIdentifierConflict: boolean;
    }>;
  }>;

export type LoadGlobalRadarPromotionContextResult =
  | Readonly<{
      outcome: "found";
      context: LoadedGlobalRadarPromotionContext;
    }>
  | Readonly<{ outcome: "invalid_input" | "not_found" }>;

export type GlobalRadarPromotionRepository = Readonly<{
  loadContext(
    input: LoadGlobalRadarPromotionContextInput,
  ): Promise<LoadGlobalRadarPromotionContextResult>;
  promote(
    input: PromoteGlobalRadarEntityInput,
  ): Promise<PromoteGlobalRadarEntityResult>;
  reverse(
    input: ReverseGlobalRadarPromotionInput,
  ): Promise<ReverseGlobalRadarPromotionResult>;
}>;

export type CanonicalPromotionInput = Omit<
  PromoteGlobalRadarEntityInput,
  | "globalEntityId"
  | "primarySignalId"
  | "supportingSignalIds"
  | "actor"
  | "idempotencyKey"
  | "reason"
  | "now"
> &
  Readonly<{
    globalEntityId: string;
    primarySignalId: string;
    supportingSignalIds: string[];
    actor: GlobalRadarPromotionActor;
    idempotencyKey: string;
    reason: string;
    now: Date;
    requestHash: string;
  }>;

export type CanonicalReversalInput = Omit<
  ReverseGlobalRadarPromotionInput,
  "globalEntityId" | "actor" | "idempotencyKey" | "reason" | "now"
> &
  Readonly<{
    globalEntityId: string;
    actor: GlobalRadarPromotionActor;
    idempotencyKey: string;
    reason: string;
    now: Date;
    requestHash: string;
  }>;

export type PromotionContext = Readonly<{
  entity: GlobalEntity;
  primarySignal: GlobalRadarSignal;
  supportingSignals: GlobalRadarSignal[];
  evidence: GlobalSignalEvidence[];
}>;

export type PromotionAttemptReason = Exclude<
  GlobalRadarPromotionConflictReason,
  "invalid_input" | "not_found" | "idempotency_mismatch" | "promotion_reversed"
>;

export const promotionAttemptReasons = new Set<PromotionAttemptReason>([
  "administrator_required",
  "active_promotion_exists",
  "revision_mismatch",
  "primary_signal_not_qualified",
  "signal_entity_mismatch",
  "supporting_signal_invalid",
  "eligibility_not_met",
  "candidate_identity_missing",
  "candidate_mapping_invalid",
  "source_evidence_missing",
  "candidate_identity_conflict",
]);

export class GlobalRadarPromotionUnavailableError extends Error {
  constructor() {
    super("Global Radar promotion is temporarily unavailable.");
    this.name = "GlobalRadarPromotionUnavailableError";
  }
}

export function validPromotionConfiguration(
  configuration: GlobalRadarPromotionConfiguration,
): boolean {
  return (
    configuration.scoreVersion === GLOBAL_RADAR_SCORE_VERSION &&
    Object.keys(configuration.thresholds).length === signalClasses.length &&
    signalClasses.every((signalClass) => {
      const threshold = configuration.thresholds[signalClass];
      return (
        Number.isInteger(threshold) && threshold >= 0 && threshold <= 100
      );
    })
  );
}

function canonicalReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().replace(/\s+/g, " ");
  return reason.length >= 1 && reason.length <= MAX_REASON_LENGTH
    ? reason
    : null;
}

function canonicalActor(value: unknown): GlobalRadarPromotionActor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const actor = value as Record<string, unknown>;
  if (
    typeof actor.userId !== "string" ||
    !UUID_PATTERN.test(actor.userId) ||
    typeof actor.email !== "string"
  ) return null;
  const email = actor.email.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  return { userId: actor.userId.toLowerCase(), email };
}

function validRevision(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

export function canonicalPromotionInput(
  input: PromoteGlobalRadarEntityInput,
): CanonicalPromotionInput | null {
  const reason = canonicalReason(input?.reason);
  const actor = canonicalActor(input?.actor);
  if (
    !input ||
    typeof input.globalEntityId !== "string" ||
    !UUID_PATTERN.test(input.globalEntityId) ||
    typeof input.primarySignalId !== "string" ||
    !UUID_PATTERN.test(input.primarySignalId) ||
    !Array.isArray(input.supportingSignalIds) ||
    input.supportingSignalIds.length < 1 ||
    input.supportingSignalIds.length > MAX_SUPPORTING_SIGNALS ||
    !promotionEligibilityPaths.includes(input.eligibilityPath) ||
    !validRevision(input.expectedEntityRevision) ||
    !validRevision(input.expectedPrimarySignalRevision) ||
    !actor ||
    typeof input.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(input.idempotencyKey) ||
    !reason ||
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime())
  ) return null;
  const supportingSignalIds = [
    ...new Set(
      input.supportingSignalIds.map((signalId) =>
        typeof signalId === "string" ? signalId.toLowerCase() : "",
      ),
    ),
  ].sort();
  if (
    supportingSignalIds.length !== input.supportingSignalIds.length ||
    supportingSignalIds.some((signalId) => !UUID_PATTERN.test(signalId)) ||
    !supportingSignalIds.includes(input.primarySignalId.toLowerCase()) ||
    !input.expectedSupportingSignalRevisions ||
    typeof input.expectedSupportingSignalRevisions !== "object" ||
    Array.isArray(input.expectedSupportingSignalRevisions)
  ) return null;
  const expectedRevisionEntries = Object.entries(
    input.expectedSupportingSignalRevisions,
  )
    .map(([signalId, revision]) => [signalId.toLowerCase(), revision] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const expectedSupportingSignalRevisions =
    Object.fromEntries(expectedRevisionEntries);
  if (
    expectedRevisionEntries.length !== supportingSignalIds.length ||
    expectedRevisionEntries.some(
      ([signalId, revision], index) =>
        signalId !== supportingSignalIds[index] ||
        !validRevision(revision),
    ) ||
    expectedSupportingSignalRevisions[input.primarySignalId.toLowerCase()] !==
      input.expectedPrimarySignalRevision
  ) return null;
  const canonical = {
    globalEntityId: input.globalEntityId.toLowerCase(),
    primarySignalId: input.primarySignalId.toLowerCase(),
    supportingSignalIds,
    eligibilityPath: input.eligibilityPath,
    expectedEntityRevision: input.expectedEntityRevision,
    expectedPrimarySignalRevision: input.expectedPrimarySignalRevision,
    expectedSupportingSignalRevisions,
    actor,
    idempotencyKey: input.idempotencyKey.toLowerCase(),
    reason,
    now: new Date(input.now.getTime()),
  };
  return {
    ...canonical,
    requestHash: createGlobalRadarFingerprint({
      version: "global-radar-promotion-request-v1",
      ...canonical,
      now: undefined,
    }),
  };
}

export function canonicalReversalInput(
  input: ReverseGlobalRadarPromotionInput,
): CanonicalReversalInput | null {
  const reason = canonicalReason(input?.reason);
  const actor = canonicalActor(input?.actor);
  if (
    !input ||
    typeof input.globalEntityId !== "string" ||
    !UUID_PATTERN.test(input.globalEntityId) ||
    !validRevision(input.expectedEntityRevision) ||
    !validRevision(input.expectedPrimarySignalRevision) ||
    !actor ||
    typeof input.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(input.idempotencyKey) ||
    !reason ||
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime())
  ) return null;
  const canonical = {
    globalEntityId: input.globalEntityId.toLowerCase(),
    expectedEntityRevision: input.expectedEntityRevision,
    expectedPrimarySignalRevision: input.expectedPrimarySignalRevision,
    actor,
    idempotencyKey: input.idempotencyKey.toLowerCase(),
    reason,
    now: new Date(input.now.getTime()),
  };
  return {
    ...canonical,
    requestHash: createGlobalRadarFingerprint({
      version: "global-radar-promotion-reversal-request-v1",
      ...canonical,
      now: undefined,
    }),
  };
}

export function canonicalPromotionContextSelection(
  input: LoadGlobalRadarPromotionContextInput,
):
  | Readonly<{
      globalEntityId: string;
      primarySignalId: string;
      promotionSupportingSignalIds: string[];
    }>
  | null {
  if (
    !input ||
    typeof input.globalEntityId !== "string" ||
    !UUID_PATTERN.test(input.globalEntityId) ||
    typeof input.primarySignalId !== "string" ||
    !UUID_PATTERN.test(input.primarySignalId) ||
    !Array.isArray(input.supportingSignalIds) ||
    input.supportingSignalIds.length > MAX_SUPPORTING_SIGNALS
  ) return null;
  const additionalSignalIds = input.supportingSignalIds.map((signalId) =>
    typeof signalId === "string" ? signalId.toLowerCase() : "",
  );
  if (
    additionalSignalIds.some((signalId) => !UUID_PATTERN.test(signalId)) ||
    new Set(additionalSignalIds).size !== additionalSignalIds.length
  ) return null;
  const primarySignalId = input.primarySignalId.toLowerCase();
  const promotionSupportingSignalIds = [
    ...new Set([primarySignalId, ...additionalSignalIds]),
  ].sort();
  if (promotionSupportingSignalIds.length > MAX_SUPPORTING_SIGNALS) return null;
  return {
    globalEntityId: input.globalEntityId.toLowerCase(),
    primarySignalId,
    promotionSupportingSignalIds,
  };
}

export async function takePromotionIdempotencyLock(
  transaction: DiscoveryTransaction,
  namespace: string,
  idempotencyKey: string,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${namespace}${idempotencyKey}`}, 0))`,
  );
}
