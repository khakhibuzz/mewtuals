import type { SignalClass } from "../../app/domain/global-radar";

export type GlobalRadarClassificationGraph = Readonly<{
  primaryEntityId: string | null;
  associations: readonly Readonly<{
    entityId: string;
    role: "supporting" | "contributor";
  }>[];
}>;

export function createGlobalRadarClassificationGraph(input: {
  primaryEntityId: string | null;
  associations: readonly Readonly<{ entityId: string }>[];
  targetClass: SignalClass;
  requestedPrimaryEntityId: string | null;
}): GlobalRadarClassificationGraph | null {
  const entityIds = new Set(
    [
      input.primaryEntityId,
      ...input.associations.map(({ entityId }) => entityId),
    ].filter((entityId): entityId is string => entityId !== null),
  );
  if (input.targetClass === "ecosystem_momentum") {
    return {
      primaryEntityId: null,
      associations: [...entityIds]
        .sort()
        .map((entityId) => ({ entityId, role: "contributor" as const })),
    };
  }
  const primaryEntityId =
    input.requestedPrimaryEntityId ?? input.primaryEntityId;
  if (primaryEntityId === null || !entityIds.has(primaryEntityId)) return null;
  return {
    primaryEntityId,
    associations: [...entityIds]
      .filter((entityId) => entityId !== primaryEntityId)
      .sort()
      .map((entityId) => ({ entityId, role: "supporting" as const })),
  };
}

export function createGlobalRadarDedupeLockKey(dedupeKey: string): string {
  return `global-radar:signal-dedupe:v1:${dedupeKey}`;
}

export function isGlobalRadarActiveDedupeConflict(error: unknown): boolean {
  let current = error;
  const visited = new Set<object>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    if (visited.has(current)) return false;
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (
      record.code === "23505" &&
      (record.constraint_name ?? record.constraint) ===
        "global_radar_signals_active_dedupe_unique"
    ) return true;
    current = record.cause;
  }
  return false;
}
