import { useState } from "react";

import {
  ECOSYSTEM_TAXONOMY,
  type BusinessStageTerm,
  type TechnicalLayerTerm,
} from "../../../domain/ecosystem-intelligence-taxonomy";

import styles from "./ecosystem-intelligence.module.css";
import type { EcosystemSnapshotDto, ExplorerGroupDto } from "./types";

const REPRESENTATIVE_LIMIT = 5;

type ExplorerMode = "business" | "technical";
type ExplorerDto = EcosystemSnapshotDto["explorer"];

type EcosystemExplorerProps = {
  explorer: ExplorerDto;
  onBusinessStageFilter: (key: string) => void;
  onTechnicalLayerFilter: (key: string) => void;
};

function groupByKey(groups: readonly ExplorerGroupDto[]) {
  return new Map(groups.map((group) => [group.key, group]));
}

function emptyGroup(key: string): ExplorerGroupDto {
  return {
    key,
    count: 0,
    strongEvidence: { numerator: 0, denominator: 0, percentage: 0 },
    representativeCompanies: [],
    majorCapabilities: [],
  };
}

function capabilityLabel(key: string): string {
  return ECOSYSTEM_TAXONOMY.termsByKind.capability.find((term) => term.key === key)?.label ?? key;
}

function CurrentMappedFacts({ group }: { group: ExplorerGroupDto }) {
  const representatives = group.representativeCompanies.slice(0, REPRESENTATIVE_LIMIT);
  return (
    <div className={styles.explorerFacts}>
      <p className={styles.explorerLabel}>Representative participants</p>
      <p>Showing {representatives.length} of {group.count}.</p>
      <p>
        {representatives.length > 0
          ? representatives.map(({ name }) => name).join(", ")
          : "No representatives in the current filtered map."}
      </p>
      <p className={styles.explorerCapabilities}>
        <span>Major mapped capabilities: </span>
        {group.majorCapabilities.length > 0
          ? group.majorCapabilities.map(({ key, count }) => `${capabilityLabel(key)} (${count})`).join(", ")
          : "Unknown"}
      </p>
    </div>
  );
}

function BusinessContext({ term }: { term: BusinessStageTerm }) {
  return (
    <div className={styles.explorerContext}>
      <p className={styles.explorerLabel}>Configured ecosystem context</p>
      <p>{term.description}</p>
      <dl>
        <div>
          <dt>Typical upstream inputs</dt>
          <dd>{term.upstreamInputs.join(", ")}</dd>
        </div>
        <div>
          <dt>Typical downstream outputs</dt>
          <dd>{term.downstreamOutputs.join(", ")}</dd>
        </div>
      </dl>
    </div>
  );
}

function TechnicalContext({ term }: { term: TechnicalLayerTerm }) {
  return (
    <div className={styles.explorerContext}>
      <p className={styles.explorerLabel}>Configured ecosystem context</p>
      <p>{term.description}</p>
      <dl>
        <div>
          <dt>Underlying materials and processes</dt>
          <dd>{term.underlyingMaterialsOrProcesses.join(", ")}</dd>
        </div>
        <div>
          <dt>Contribution to robot behavior</dt>
          <dd>{term.robotBehaviorContribution}</dd>
        </div>
      </dl>
    </div>
  );
}

export function EcosystemExplorer({
  explorer,
  onBusinessStageFilter,
  onTechnicalLayerFilter,
}: EcosystemExplorerProps) {
  const [mode, setMode] = useState<ExplorerMode>("business");
  const businessGroups = groupByKey(explorer.businessStages);
  const technicalGroups = groupByKey(explorer.technicalLayers);

  return (
    <section className={styles.explorerSection} aria-labelledby="ecosystem-explorer-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Stack context</p>
          <h2 id="ecosystem-explorer-title">How the ecosystem fits together</h2>
        </div>
        <p>{explorer.denominator} participants in this filtered map</p>
      </div>

      <div className={styles.explorerSwitch} role="group" aria-label="Ecosystem explorer model">
        <button
          type="button"
          aria-pressed={mode === "business"}
          onClick={() => setMode("business")}
        >
          Business stages
        </button>
        <button
          type="button"
          aria-pressed={mode === "technical"}
          onClick={() => setMode("technical")}
        >
          Technical layers
        </button>
      </div>

      {mode === "business" ? (
        <ol className={styles.explorerGrid} aria-label="Business-stage explorer">
          {ECOSYSTEM_TAXONOMY.termsByKind.business_stage.map((term) => {
            const group = businessGroups.get(term.key) ?? emptyGroup(term.key);
            return (
              <li key={term.key} data-testid="business-stage-group">
                <article>
                  <button
                    type="button"
                    aria-label={`Filter by ${term.label}`}
                    onClick={() => onBusinessStageFilter(term.key)}
                  >
                    <span className={styles.explorerTitleRow}>
                      <strong>{term.label}</strong>
                      <span>{group.count}</span>
                    </span>
                    <span className={styles.explorerEvidence}>
                      Strong evidence: {group.strongEvidence.numerator} of {group.strongEvidence.denominator}
                      {` (${group.strongEvidence.percentage}%)`}
                    </span>
                  </button>
                  <BusinessContext term={term} />
                  <CurrentMappedFacts group={group} />
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className={styles.explorerGrid} aria-label="Technical-layer explorer">
          {ECOSYSTEM_TAXONOMY.termsByKind.technical_layer.map((term) => {
            const group = technicalGroups.get(term.key) ?? emptyGroup(term.key);
            return (
              <li key={term.key} data-testid="technical-layer-group">
                <article>
                  <button
                    type="button"
                    aria-label={`Filter by ${term.label}`}
                    onClick={() => onTechnicalLayerFilter(term.key)}
                  >
                    <span className={styles.explorerTitleRow}>
                      <strong>{term.label}</strong>
                      <span>{group.count}</span>
                    </span>
                    <span className={styles.explorerEvidence}>
                      Strong evidence: {group.strongEvidence.numerator} of {group.strongEvidence.denominator}
                      {` (${group.strongEvidence.percentage}%)`}
                    </span>
                  </button>
                  <TechnicalContext term={term} />
                  <CurrentMappedFacts group={group} />
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
