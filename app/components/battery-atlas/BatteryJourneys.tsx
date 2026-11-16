import { useState } from "react";
import { batteryJourneys } from "../../data/battery-journeys";
import { ResearchSources } from "./BatteryResearchPanel";
import styles from "./battery-atlas.module.css";

export function BatteryJourneys({ onOpenRecord }: { onOpenRecord: (id: string) => void }) {
  const [journeyId, setJourneyId] = useState(batteryJourneys[0].id);
  const journey = batteryJourneys.find((item) => item.id === journeyId)!;
  return <section id="battery-journeys" className={styles.journeys} aria-label="Battery provenance journeys">
    <div className={styles.journeyHeading}>
      <div><p className={styles.eyebrow}>FOLLOW A BATTERY</p><h2>Where does it actually come from?</h2></div>
      <p>Three examples. Different levels of evidence.</p>
    </div>
    <div className={styles.journeyChoices} aria-label="Choose a provenance journey">
      {batteryJourneys.map((item) => <button key={item.id} type="button" aria-pressed={item.id === journeyId} onClick={() => setJourneyId(item.id)}>{item.title}</button>)}
    </div>
    <div className={styles.journeyBody} aria-live="polite">
      <p className={styles.journeyEvidence}>{journey.evidence}</p>
      <ol className={styles.journeySteps}>{journey.steps.map((step) => <li key={step.label}><span>{step.label}</span><strong>{step.detail}</strong></li>)}</ol>
      <p className={styles.journeyLimit}>{journey.limit}</p>
      <div className={styles.journeyActions}>
        <button type="button" onClick={() => onOpenRecord(journey.recordId)}>Open the research record ↗</button>
        <details><summary>Read the primary sources</summary><ResearchSources ids={journey.sourceIds} /></details>
      </div>
    </div>
  </section>;
}
