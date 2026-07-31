import {
  ECOSYSTEM_TAXONOMY,
  type EcosystemTaxonomyKind,
  type TaxonomyTerm,
} from "../../../domain/ecosystem-intelligence-taxonomy";

export function taxonomyLabel(kind: EcosystemTaxonomyKind, key: string): string {
  const terms = ECOSYSTEM_TAXONOMY.termsByKind[kind] as readonly TaxonomyTerm[];
  return terms.find((term) => term.key === key)?.label ?? readableKey(key);
}

export function readableKey(key: string): string {
  if (key === "unknown") return "Unknown";
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function readinessLabel(readiness: "empty" | "needs_evidence" | "ready"): string {
  if (readiness === "needs_evidence") return "Needs evidence";
  return readableKey(readiness);
}
