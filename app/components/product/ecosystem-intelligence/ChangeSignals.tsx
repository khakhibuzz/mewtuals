import { readableKey, taxonomyLabel } from "./labels";
import styles from "./ecosystem-intelligence.module.css";
import type { CountOptionDto, EcosystemSnapshotDto } from "./types";

type ChangeSignalsProps = {
  velocity: EcosystemSnapshotDto["velocity"];
  momentum: EcosystemSnapshotDto["momentum"];
};

function Breakdown({
  label,
  items,
  totalCount = items.length,
  itemLabel = (item) => item.label,
}: {
  label: string;
  items: readonly CountOptionDto[];
  totalCount?: number;
  itemLabel?: (item: CountOptionDto) => string;
}) {
  if (items.length === 0) return null;
  const visibleItems = items.slice(0, 5);
  return (
    <div className={styles.signalBreakdown}>
      <h4>{label}</h4>
      <ul>
        {visibleItems.map((item) => (
          <li key={item.key}><span>{itemLabel(item)}</span><strong>{item.count}</strong></li>
        ))}
      </ul>
      {totalCount > visibleItems.length ? (
        <p>Showing {visibleItems.length} of {totalCount}.</p>
      ) : null}
    </div>
  );
}

export function ChangeSignals({ velocity, momentum }: ChangeSignalsProps) {
  return (
    <section className={styles.analysisSection} aria-labelledby="change-signals-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Change over time</p>
          <h2 id="change-signals-heading">What is changing</h2>
        </div>
        <p>Research activity and public ecosystem signals are separate evidence streams.</p>
      </div>
      <div className={styles.changeGrid}>
        <article className={styles.changePanel}>
          <h3>Mewtuals research activity</h3>
          <p className={styles.mutedCopy}>
            This is Discovery and research activity inside Mewtuals, not market momentum.
          </p>
          {velocity.windows.length === 0 ? (
            <p className={styles.matrixEmpty}>No research activity window is available for this view.</p>
          ) : (
            <div className={styles.velocityWindows}>
              {velocity.windows.map((window) => (
                <article key={window.days}>
                  <div className={styles.windowHeading}>
                    <h4>{window.days} days</h4>
                    <strong>{window.candidateCount} candidates researched</strong>
                  </div>
                  <p>{window.researchVersionCount} research versions · {window.sourceEvidenceCount} source records</p>
                  <div className={styles.breakdownGrid}>
                    <Breakdown label="Candidate dates" items={window.byCandidateDate} />
                    <Breakdown label="Sources" items={window.bySource} />
                    <Breakdown label="Roles" items={window.byRole} itemLabel={(item) => taxonomyLabel("ecosystem_role", item.key)} />
                    <Breakdown label="States" items={window.byState} itemLabel={(item) => readableKey(item.key)} />
                    <Breakdown label="Evidence" items={window.byEvidenceBand} itemLabel={(item) => readableKey(item.key)} />
                    <Breakdown label="Review status" items={window.byReviewStatus} itemLabel={(item) => readableKey(item.key)} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
        <article className={styles.changePanel}>
          <h3>Public ecosystem momentum</h3>
          <p className={styles.mutedCopy}>Only active, evidence-backed public signals appear here.</p>
          <p className={styles.momentumMessage}>{momentum.message}</p>
          <p className={styles.thresholdProgress}>
            {momentum.activeSignalCount} of {momentum.requiredSignalCount} required signals across {momentum.organisationCount} of {momentum.requiredOrganisationCount} required organisations.
          </p>
          {momentum.ready ? (
            <>
              <div className={styles.breakdownGrid}>
                <Breakdown label="Signal categories" items={momentum.categories} />
                <Breakdown label="Organisations" items={momentum.companies} totalCount={momentum.organisationCount} />
              </div>
              <p className={styles.thresholdProgress}>
                Showing {momentum.signals.length} of {momentum.activeSignalCount} most recent active signals.
              </p>
              <ul className={styles.evidenceList} aria-label="Active public signals">
                {momentum.signals.map((signal) => (
                  <li key={signal.id}>
                    <div>
                      <strong>{signal.candidateName}</strong>
                      <span>{taxonomyLabel("signal_type", signal.type)} · {signal.title}</span>
                      <span>Occurred <time dateTime={signal.occurredAt}>{signal.occurredAt.slice(0, 10)}</time></span>
                      <span>Active until <time dateTime={signal.activeUntil}>{signal.activeUntil.slice(0, 10)}</time></span>
                      {signal.expiresAt ? (
                        <span>Explicit expiry <time dateTime={signal.expiresAt}>{signal.expiresAt.slice(0, 10)}</time></span>
                      ) : (
                        <span>No separate explicit expiry; the registered freshness window applies.</span>
                      )}
                    </div>
                    <a href={signal.sourceUrl} target="_blank" rel="noreferrer">Public evidence</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
