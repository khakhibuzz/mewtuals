import styles from "./ecosystem-intelligence.module.css";
import type { EcosystemSnapshotDto, RatioMetricDto } from "./types";

type CoverageSummaryProps = {
  snapshot: EcosystemSnapshotDto;
  stale: boolean;
};

function RatioAssistiveText({
  ratio,
  description,
}: {
  ratio: RatioMetricDto;
  description: string;
}) {
  return (
    <span className={styles.srOnly}>
      {ratio.numerator} of {ratio.denominator} filtered organisations {description}.
    </span>
  );
}

function MetricCard({
  label,
  definition,
  context,
}: {
  label: string;
  definition: string;
  context: string;
}) {
  return (
    <details className={styles.metricCard} data-testid="coverage-metric">
      <summary>{label}</summary>
      <div className={styles.metricDefinition}>
        <p>{definition}</p>
        <p className={styles.srOnly} data-metric-context>{context}</p>
      </div>
    </details>
  );
}

const qualityDefinitions = [
  ["resolvedState", "Resolved state", "have a resolved headquarters state"],
  ["resolvedCity", "Resolved city", "have a resolved headquarters city"],
  ["ecosystemRole", "Ecosystem role", "have an ecosystem role"],
  ["capability", "Capability", "have a mapped capability"],
  ["strongEvidence", "Strong evidence", "meet the strong-evidence rule"],
  ["publicContact", "Public contact", "have public-contact evidence recorded"],
  ["organisationsWithActiveSignal", "Active signals", "have a current public signal"],
  ["systemsContext", "Systems context", "have a current systems-context version"],
] as const;

export function CoverageSummary({ snapshot, stale }: CoverageSummaryProps) {
  const { summary, dataQuality, population } = snapshot;
  const publicReachabilityDefinition = snapshot.filters.includeEnablers
    ? "Companies qualify via a valid public website or LinkedIn URL; creators and media may additionally qualify via a valid primary social URL."
    : snapshot.filters.participantType === "creator"
      ? "Creators and media qualify via a valid public website, LinkedIn, or primary social URL."
      : "Companies qualify via a valid public website or LinkedIn URL.";
  const publicReachabilityDescription = snapshot.filters.includeEnablers
    ? "meet the participant-type-specific public reachability rule"
    : snapshot.filters.participantType === "creator"
      ? "have a public website, LinkedIn, or primary social URL"
      : "have a public website or LinkedIn URL";
  return (
    <section className={styles.coverageSection} aria-labelledby="coverage-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>What we have mapped</p>
          <h2 id="coverage-title">Coverage, with its limits visible</h2>
        </div>
        {stale ? <span className={styles.staleBadge}>Last available snapshot</span> : null}
      </div>

      {population.total === 0 ? (
        <div className={styles.emptyState}>
          <p>No organisations match this view.</p>
          <p>Your filters are still active. Remove a filter or reset the view.</p>
        </div>
      ) : (
        <div className={styles.metricStrip}>
          <MetricCard label={`${summary.organisations.count} organisations mapped`} definition="Distinct participants in the filtered Physical AI research sample." context={`${summary.organisations.count} of ${population.total} filtered organisations are included in this map.`} />
          <MetricCard label={`${summary.companies.percentage}% companies`} definition="Companies as a share of the filtered participant sample." context={`${summary.companies.numerator} of ${summary.companies.denominator} filtered organisations are companies.`} />
          <MetricCard label={`${summary.rolesRepresented.count} roles represented`} definition="Distinct evidence-backed or inferred ecosystem roles, excluding Unknown." context={`${summary.rolesRepresented.count} represented roles across ${population.total} filtered organisations.`} />
          <MetricCard label={`${summary.technicalLayersRepresented.count} technical layers represented`} definition="Distinct technical robot-stack layers, excluding Unknown." context={`${summary.technicalLayersRepresented.count} represented technical layers across ${population.total} filtered organisations.`} />
          <MetricCard label={`${summary.statesRepresented.count} states represented`} definition="Distinct public-evidence-backed headquarters states." context={`${summary.statesRepresented.count} represented states across ${population.total} filtered organisations.`} />
          <MetricCard label={`${summary.citiesRepresented.count} cities represented`} definition="Distinct public-evidence-backed headquarters cities." context={`${summary.citiesRepresented.count} cities across ${population.total} filtered organisations.`} />
          <MetricCard label={`${summary.publiclyReachable.percentage}% publicly reachable`} definition={publicReachabilityDefinition} context={`${summary.publiclyReachable.numerator} of ${summary.publiclyReachable.denominator} filtered organisations ${publicReachabilityDescription}.`} />
          <MetricCard label={`${summary.activeSignals.count} active public signals`} definition="Unexpired public candidate signals in the filtered view." context={`${summary.activeSignals.count} signals across ${summary.activeSignals.organisations.numerator} of ${summary.activeSignals.organisations.denominator} filtered organisations.`} />
          <MetricCard label={`${summary.documentedRelationships.count} documented relationships`} definition="Relationships supported by a public evidence URL." context={`${summary.documentedRelationships.count} relationships across ${summary.documentedRelationships.organisations.numerator} of ${summary.documentedRelationships.organisations.denominator} filtered organisations.`} />
        </div>
      )}

      <div className={styles.qualityPanel}>
        <div>
          <h3>Data quality</h3>
          <p>
            Percentages use this filtered sample as the denominator. Unknown facts remain
            visible; this is not a market census.
          </p>
        </div>
        <ul>
          {qualityDefinitions.map(([key, label, description]) => {
            const ratio = dataQuality[key];
            return (
              <li key={key} title={`${ratio.numerator} of ${ratio.denominator}: ${description}.`}>
                <span>{label}</span>
                <strong>{ratio.percentage}%</strong>
                <RatioAssistiveText ratio={ratio} description={description} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
