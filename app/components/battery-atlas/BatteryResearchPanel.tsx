import { batteryResearchCheckedAt, batteryResearchSources } from "../../data/india-battery-research";
import type { BatteryResearchRecord, BatteryFactKey } from "../../domain/battery-research";
import { batteryStatusLabels } from "../../domain/battery-research";
import styles from "./battery-atlas.module.css";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function ResearchSources({ ids }: { ids: readonly string[] }) {
  return <ul className={styles.sources}>
    {ids.map((id) => {
      const source = batteryResearchSources[id];
      return <li key={id}>
        <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
        <span>{source.publisher} · {source.date ? dateLabel(source.date) : "Undated page"}</span>
      </li>;
    })}
  </ul>;
}

const procurementFields: readonly [BatteryFactKey, string][] = [
  ["cellOrigin", "Cell origin / imports"], ["chemistry", "Chemistry"], ["capacity", "Production capacity"],
  ["certifications", "Certifications & scope"], ["customers", "Customers / relationships"],
  ["moq", "Minimum order quantity"], ["leadTime", "Lead time"],
];

export function BatteryResearchPanel({ record, onBack }: { record: BatteryResearchRecord; onBack: () => void }) {
  return <article className={styles.researchDetail} aria-label="Selected research">
    <button type="button" className={styles.resultsBack} onClick={onBack}>← All results</button>
    <span className={styles.status} data-status={record.status}>{batteryStatusLabels[record.status]}</span>
    <h3>{record.name}</h3>
    <p className={styles.locality}>{record.locality}</p>
    <p>{record.summary}</p>
    <div className={styles.evidenceNote}><strong>What the evidence establishes</strong><p>{record.statusNote}</p></div>
    <div className={styles.tags} aria-label="Materials and applications">{record.applications.map((item) => <span key={item}>{item}</span>)}</div>
    <section className={styles.provenance}><h4>Supply-chain dossier</h4>
      <dl>{procurementFields.map(([key, label]) => {
        const fact = record.facts?.[key];
        return <div key={key}><dt>{label}</dt><dd>{fact ? <><p>{fact.value}</p><ResearchSources ids={fact.sourceIds} /></> : <span className={styles.unknown}>{key === "moq" || key === "leadTime" ? "No verified quote · ask supplier for a dated, product-specific offer." : "Not established in the reviewed sources."}</span>}</dd></div>;
      })}</dl>
    </section>
    {record.relationship && <section className={styles.relationship}><h4>Documented relationship</h4><p>{record.relationship}</p></section>}
    <section className={styles.locationEvidence}>
      <h4>Location precision</h4>
      <p>{record.locationNote}</p>
      {record.location && <a href={`https://www.geonames.org/${record.location.geonamesId}`} target="_blank" rel="noreferrer">{record.location.label} · GeoNames ↗</a>}
    </section>
    <section className={styles.sourceSection}><h4>Sources</h4><ResearchSources ids={record.sourceIds} /><p className={styles.checkedAt}>Reviewed {dateLabel(record.reviewedAt ?? batteryResearchCheckedAt)}. Status reflects the cited evidence date.</p></section>
  </article>;
}
