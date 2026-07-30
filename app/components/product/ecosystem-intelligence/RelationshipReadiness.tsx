import { taxonomyLabel } from "./labels";
import styles from "./ecosystem-intelligence.module.css";
import type { EcosystemSnapshotDto } from "./types";

type RelationshipReadinessProps = {
  relationships: EcosystemSnapshotDto["relationships"];
};

type PositionedNode = EcosystemSnapshotDto["relationships"]["nodes"][number] & {
  x: number;
  y: number;
};

function positionNodes(nodes: EcosystemSnapshotDto["relationships"]["nodes"]): PositionedNode[] {
  const clusters = [...new Set(nodes.map((node) => node.clusterKey))].sort();
  const clusterIndex = new Map(clusters.map((cluster, index) => [cluster, index]));
  const clusterSizes = new Map(clusters.map((cluster) => [
    cluster,
    nodes.filter((node) => node.clusterKey === cluster).length,
  ]));
  const groupPosition = new Map<string, number>();
  return nodes.map((node) => {
    const cluster = clusterIndex.get(node.clusterKey) ?? 0;
    const member = groupPosition.get(node.clusterKey) ?? 0;
    groupPosition.set(node.clusterKey, member + 1);
    const clusterCount = Math.max(clusters.length, 1);
    const clusterWidth = 600 / clusterCount;
    const subcolumnCount = Math.max(1, Math.ceil((clusterSizes.get(node.clusterKey) ?? 1) / 8));
    const subcolumn = Math.floor(member / 8);
    return {
      ...node,
      x: 20 + cluster * clusterWidth + ((subcolumn + 0.5) * clusterWidth / subcolumnCount),
      y: 55 + (member % 8) * 38,
    };
  });
}

export function RelationshipReadiness({ relationships }: RelationshipReadinessProps) {
  const positioned = positionNodes(relationships.nodes);
  const nodeById = new Map(positioned.map((node) => [node.id, node]));

  return (
    <section className={styles.analysisSection} aria-labelledby="relationships-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Verified connections</p>
          <h2 id="relationships-heading">How mapped companies are connected</h2>
        </div>
        <p>Only evidence-backed relationships are rendered.</p>
      </div>
      {!relationships.ready ? (
        <div className={styles.readinessPanel}>
          <strong>{relationships.message}</strong>
          <p>{relationships.evidencedEdgeCount} of {relationships.requiredEvidencedEdges} verified relationships across {relationships.candidateCount} of {relationships.requiredCandidates} candidates.</p>
          <p>{relationships.unresolvedTargetCount} unresolved relationship targets.</p>
        </div>
      ) : (
        <div className={styles.relationshipGrid}>
          <figure className={styles.relationshipMap}>
            <svg viewBox="0 0 640 360" role="img" aria-label="Verified relationship map">
              {relationships.edges.map((edge) => {
                const source = nodeById.get(edge.sourceCandidateId);
                const target = nodeById.get(edge.targetCandidateId);
                if (!source || !target) return null;
                return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
              })}
              {positioned.map((node) => (
                <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                  <circle r="9" />
                  <text x="14" y="4">{node.name}</text>
                  <title>{`${node.name}, ${taxonomyLabel("ecosystem_role", node.clusterKey)}`}</title>
                </g>
              ))}
            </svg>
            <figcaption>
              {relationships.nodes.length} of {relationships.candidateCount} connected candidates and {relationships.edges.length} of {relationships.evidencedEdgeCount} verified relationships are shown. Nodes are grouped by their selected ecosystem role or technical-layer fallback.
            </figcaption>
          </figure>
          <div className={styles.relationshipLedger}>
            <h3>Verified relationship ledger</h3>
            <ul className={styles.nodeList} aria-label="Companies in the relationship map">
              {positioned.map((node) => (
                <li key={node.id}>{node.name} · {taxonomyLabel("ecosystem_role", node.clusterKey)}</li>
              ))}
            </ul>
            <ul className={styles.evidenceList} aria-label="Verified relationship ledger">
              {relationships.edges.map((edge) => {
                const source = nodeById.get(edge.sourceCandidateId);
                const target = nodeById.get(edge.targetCandidateId);
                return (
                  <li key={edge.id}>
                    <div>
                      <strong>{source?.name ?? "Unknown source"} {taxonomyLabel("relationship_type", edge.type).toLowerCase()} {target?.name ?? "Unknown target"}</strong>
                      <span>{edge.confidence}% evidence confidence{edge.observedAt ? ` · observed ${edge.observedAt.slice(0, 10)}` : ""}</span>
                    </div>
                    <a href={edge.evidenceUrl} target="_blank" rel="noreferrer">Public evidence</a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
