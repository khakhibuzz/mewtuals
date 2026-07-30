import {
  MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS,
  createGlobalRadarMomentumPolicy,
  deriveEcosystemMomentum,
  globalRadarDemandFamilyLookup,
  globalRadarSourceFamilyLookup,
  globalRadarSourceFamilies,
  type MomentumDerivationResult,
} from "../../app/domain/global-radar";

const DAY_MS = 24 * 60 * 60 * 1_000;
const LOOKBACK_MS = 180 * DAY_MS;

export const MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE =
  MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS;

type SourceFamily = (typeof globalRadarSourceFamilies)[number];

export type GlobalRadarAdminMomentumEvidence = Readonly<{
  id: string;
  runId: string | null;
  entityId: string | null;
  sourceId: string;
  sourceFamily: string;
  isPrimarySource: boolean;
  isSyndicated: boolean;
  observedAt: Date;
}>;

export type GlobalRadarAdminMomentumInput = Readonly<{
  taxonomy: string;
  taxonomyConsistency: number;
  evidenceQuality: number;
  now: Date;
  associations: readonly Readonly<{
    entityId: string;
    role: "supporting" | "contributor";
  }>[];
  entities: readonly Readonly<{
    id: string;
    canonicalCorporateGroupId: string | null;
  }>[];
  evidence: readonly GlobalRadarAdminMomentumEvidence[];
}>;

export type GlobalRadarAdminMomentumResult =
  | Readonly<{
      outcome: "derived";
      derivation: Extract<MomentumDerivationResult, { valid: true }>;
    }>
  | Readonly<{ outcome: "conflict"; reason: "invalid_input" }>;

export function deriveGlobalRadarAdminMomentum(
  input: GlobalRadarAdminMomentumInput,
): GlobalRadarAdminMomentumResult {
  if (
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime()) ||
    !Number.isInteger(input.taxonomyConsistency) ||
    !Number.isInteger(input.evidenceQuality) ||
    !globalRadarDemandFamilyLookup[
      input.taxonomy as keyof typeof globalRadarDemandFamilyLookup
    ]
  ) return { outcome: "conflict", reason: "invalid_input" };
  const taxonomy = input.taxonomy as Parameters<
    typeof createGlobalRadarMomentumPolicy
  >[0];
  const contributorIds = new Set(
    input.associations
      .filter(({ role }) => role === "contributor")
      .map(({ entityId }) => entityId),
  );
  const entityById = new Map(input.entities.map((entity) => [entity.id, entity]));
  const eligibleEvidence = input.evidence.filter(
    ({ entityId, isSyndicated, observedAt }) =>
      entityId !== null &&
      contributorIds.has(entityId) &&
      !isSyndicated &&
      observedAt <= input.now &&
      input.now.getTime() - observedAt.getTime() <= LOOKBACK_MS,
  );
  if (eligibleEvidence.length > MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE) {
    return { outcome: "conflict", reason: "invalid_input" };
  }
  const observations = eligibleEvidence.flatMap((evidence) => {
    if (evidence.entityId === null) return [];
    const entity = entityById.get(evidence.entityId);
    if (
      !entity ||
      !globalRadarSourceFamilyLookup[evidence.sourceFamily as SourceFamily]
    ) return [];
    return [{
      evidenceId: evidence.id,
      entityId: entity.id,
      corporateGroupId:
        entity.canonicalCorporateGroupId ?? `group:${entity.id}`,
      sourceId: evidence.sourceId,
      sourceFamily: evidence.sourceFamily as SourceFamily,
      isPrimarySource: evidence.isPrimarySource,
      observedAt: evidence.observedAt.toISOString(),
    }];
  });
  const policy = createGlobalRadarMomentumPolicy(taxonomy);
  const derivation = deriveEcosystemMomentum(
    {
      taxonomy,
      taxonomyConsistency: input.taxonomyConsistency,
      evidenceQuality: input.evidenceQuality,
      observations,
    },
    policy,
    { now: () => new Date(input.now.getTime()) },
  );
  return derivation.valid
    ? { outcome: "derived", derivation }
    : { outcome: "conflict", reason: "invalid_input" };
}
