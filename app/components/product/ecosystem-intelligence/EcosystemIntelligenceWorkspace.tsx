"use client";

type InitialSnapshot = {
  generatedAt: string;
  population: {
    total: number;
    fingerprint: string;
  };
};

type EcosystemIntelligenceWorkspaceProps = {
  initialSnapshot: InitialSnapshot;
  canonicalQuery: string;
};

export function EcosystemIntelligenceWorkspace({
  initialSnapshot,
  canonicalQuery,
}: EcosystemIntelligenceWorkspaceProps) {
  return (
    <section
      data-testid="ecosystem-initial-snapshot"
      data-canonical-query={canonicalQuery}
      data-generated-at={initialSnapshot.generatedAt}
      aria-labelledby="ecosystem-initial-title"
    >
      <h2 id="ecosystem-initial-title">Current Physical AI view</h2>
      <p>{initialSnapshot.population.total} Physical AI participants in this view.</p>
      <p>Interactive analysis is loading from this server-rendered snapshot.</p>
    </section>
  );
}
