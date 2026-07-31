import type { IndiaRelevanceType } from "./contracts";

const indiaFitScoreByRelevanceType = Object.freeze({
  explicit_India: 100,
  existing_India_presence: 90,
  India_expansion: 85,
  globally_open: 70,
  inferred_India_compatible: 60,
  no_current_India_fit: 0,
} as const satisfies Record<IndiaRelevanceType, number>);

export function globalRadarIndiaFitScore(
  relevanceType: IndiaRelevanceType,
): number {
  return indiaFitScoreByRelevanceType[relevanceType];
}
