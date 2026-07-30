import type {
  GlobalRadarClassMetrics,
  GlobalRadarOverviewMetrics,
  GlobalRadarSignalClass,
} from "./types";
import styles from "./global-radar.module.css";

type Metric = Readonly<{ id: string; label: string; value: number | string }>;

const classLabels: Record<GlobalRadarSignalClass, string> = {
  direct_demand: "Direct Demand",
  demand_precursor: "Demand Precursors",
  ecosystem_momentum: "Momentum",
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b(?:india|rfp)\b/gi, (part) => part.toUpperCase())
    .replace(/^./, (letter) => letter.toUpperCase());
}

function date(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function classMetricItems(
  signalClass: GlobalRadarSignalClass,
  metrics: GlobalRadarClassMetrics,
): Metric[] {
  const classSpecific = signalClass === "direct_demand"
    ? [
        { id: "active", label: "Active direct demands", value: metrics.active },
        { id: "expiring", label: "Expiring direct demands", value: metrics.expiring },
      ]
    : signalClass === "demand_precursor"
      ? [
          { id: "high-quality", label: "High-quality precursors", value: metrics.highQuality },
          { id: "within-30", label: "Horizon · Within 30 days", value: metrics.horizon.within30Days },
          { id: "31-90", label: "Horizon · 31–90 days", value: metrics.horizon.days31To90 },
          { id: "91-180", label: "Horizon · 91–180 days", value: metrics.horizon.days91To180 },
          { id: "181-365", label: "Horizon · 181–365 days", value: metrics.horizon.days181To365 },
          { id: "unknown-horizon", label: "Horizon · Unknown", value: metrics.horizon.unknown },
        ]
      : [
          { id: "high-quality", label: "High-quality momentum", value: metrics.highQuality },
          { id: "qualified", label: "Qualified momentum", value: metrics.qualified },
        ];
  return [
    { id: "total", label: "Signals", value: metrics.total },
    ...classSpecific,
    { id: "india-explicit", label: "India · Explicit", value: metrics.india.explicit },
    { id: "india-inferred", label: "India · Inferred", value: metrics.india.inferred },
    { id: "india-other", label: "India · Other", value: metrics.india.other },
    { id: "country-us", label: "Country · United States", value: metrics.countries.unitedStates },
    { id: "country-china", label: "Country · China", value: metrics.countries.china },
    { id: "country-other", label: "Country · Other", value: metrics.countries.other },
    { id: "physical-data", label: "Requirements · Physical data", value: metrics.requirementMix.physicalData },
    { id: "hardware", label: "Requirements · Hardware", value: metrics.requirementMix.hardware },
    ...Object.entries(metrics.byStatus).map(([status, value]) => ({
      id: `status-${status}`,
      label: `Status · ${label(status)}`,
      value,
    })),
    ...Object.entries(metrics.demandFamilies).map(([family, value]) => ({
      id: `family-${family}`,
      label: `Demand family · ${label(family)}`,
      value,
    })),
  ];
}

function overviewMetricItems(metrics: GlobalRadarOverviewMetrics): Metric[] {
  return [
    { id: "new", label: "New signals today", value: metrics.newSignals },
    { id: "active-demand", label: "Active direct demand", value: metrics.activeDirectDemand },
    { id: "high-precursors", label: "High-quality precursors", value: metrics.highQualityPrecursors },
    { id: "india-explicit", label: "India · Explicit", value: metrics.india.explicit },
    { id: "india-inferred", label: "India · Inferred", value: metrics.india.inferred },
    { id: "us", label: "Country · United States", value: metrics.countries.unitedStates },
    { id: "china", label: "Country · China", value: metrics.countries.china },
    { id: "other", label: "Country · Other", value: metrics.countries.other },
    { id: "physical", label: "Requirements · Physical data", value: metrics.requirementMix.physicalData },
    { id: "hardware", label: "Requirements · Hardware", value: metrics.requirementMix.hardware },
    { id: "expiring", label: "Expiring direct demand", value: metrics.expiringDirectDemand },
    { id: "promotions", label: "Promoted entities", value: metrics.promotionCount },
    { id: "source-errors", label: "Source errors", value: metrics.sourceErrors },
    { id: "duplicates", label: "Merged duplicates", value: metrics.mergedDuplicates },
    ...metrics.capabilityFamilies.map(({ capability, signals }) => ({
      id: `capability-${capability}`,
      label: `Capability · ${label(capability)}`,
      value: signals,
    })),
    {
      id: "latest-run",
      label: "Latest run",
      value: metrics.latestRun
        ? `${label(metrics.latestRun.status)} · ${date(metrics.latestRun.completedAt ?? metrics.latestRun.createdAt)}`
        : "No run recorded",
    },
  ];
}

function MetricGroup({ label: groupLabel, metrics }: { label: string; metrics: readonly Metric[] }) {
  return (
    <dl aria-label={groupLabel} className={styles.metrics} role="group">
      {metrics.map((metric) => (
        <div key={metric.id}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GlobalRadarMetrics({
  signalClass,
  metrics,
}: {
  signalClass: GlobalRadarSignalClass;
  metrics: Readonly<{ class: GlobalRadarClassMetrics }> & GlobalRadarOverviewMetrics;
}) {
  return (
    <div className={styles.metricGroups}>
      <MetricGroup
        label={`${classLabels[signalClass]} class metrics`}
        metrics={classMetricItems(signalClass, metrics.class)}
      />
      <MetricGroup
        label="Radar overview metrics"
        metrics={overviewMetricItems(metrics)}
      />
    </div>
  );
}
