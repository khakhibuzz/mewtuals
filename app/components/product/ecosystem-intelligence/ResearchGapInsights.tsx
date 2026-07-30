import styles from "./ecosystem-intelligence.module.css";
import type { EcosystemFiltersDto, EcosystemSnapshotDto } from "./types";

type ResearchGapInsightsProps = {
  insights: EcosystemSnapshotDto["insights"];
  onFilter: (changes: Partial<EcosystemFiltersDto>) => void;
};

export function ResearchGapInsights({ insights, onFilter }: ResearchGapInsightsProps) {
  return (
    <section className={styles.analysisSection} aria-labelledby="research-gaps-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Research gaps</p>
          <h2 id="research-gaps-heading">Where this map needs deeper research</h2>
        </div>
        <p>Deterministic rules qualify the current sample; they do not claim market absence.</p>
      </div>
      {insights.items.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>No research-gap rule is triggered for this view.</strong>
          <p>The current filters may be too narrow or the configured thresholds are not met.</p>
        </div>
      ) : (
        <div className={styles.insightGrid}>
          {insights.items.map((insight) => (
            <article key={insight.ruleKey} aria-label={insight.title} className={styles.insightCard}>
              <p className={styles.ruleKey}>Rule: {insight.ruleKey}</p>
              <h3>{insight.title}</h3>
              <p>{insight.copy}</p>
              <dl className={styles.insightEvidence}>
                <div><dt>Affected</dt><dd>{insight.numerator} of {insight.denominator}</dd></div>
                <div><dt>Coverage</dt><dd>{insight.percentage}% coverage</dd></div>
                <div><dt>Confidence</dt><dd>Confidence: map evidence</dd></div>
              </dl>
              <button
                type="button"
                aria-label={`View supporting companies for ${insight.title}`}
                onClick={() => onFilter(insight.supportingFilters)}
              >
                View supporting companies
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
