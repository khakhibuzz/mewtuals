import type { GlobalRadarMetric } from "./types";
import styles from "./global-radar.module.css";

export function GlobalRadarMetrics({
  label,
  metrics,
}: {
  label: string;
  metrics: readonly GlobalRadarMetric[];
}) {
  if (metrics.length === 0) return null;
  return (
    <dl aria-label={`${label} metrics`} className={styles.metrics} role="group">
      {metrics.map((metric) => (
        <div key={metric.id}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
