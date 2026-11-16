"use client";
import { useState, useSyncExternalStore } from "react";
import { batteryPolicies } from "../../data/battery-policies";
import { filterBatteryPolicies, type BatteryPolicyArea } from "../../domain/battery-policy";
import { BatterySectionHeader } from "./BatterySectionHeader";
import styles from "./battery-sections.module.css";
const areas: readonly BatteryPolicyArea[] = ["Manufacturing", "Demand & charging", "Materials & imports", "Recycling"];
const subscribe = () => () => {};
function dateLabel(date: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
export function BatteryPolicies() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [area, setArea] = useState<BatteryPolicyArea | "all">("all");
  const policies = filterBatteryPolicies(batteryPolicies, area);
  return <main className={styles.page} data-hydrated={hydrated}>
    <BatterySectionHeader current="policies" title="Policy watch" description="Recent Indian government measures shaping battery demand, local manufacturing, materials and recycling. Read what changed—and what it could mean for the supply chain." />
    <div className={styles.policyFilters} aria-label="Filter policies by impact area"><button type="button" aria-pressed={area === "all"} onClick={() => setArea("all")}>All policy areas</button>{areas.map((item) => <button key={item} type="button" aria-pressed={area === item} onClick={() => setArea(item)}>{item}</button>)}</div>
    <div className={styles.summary}><p role="status">{policies.length} measures · Selected national updates, 2024–2026</p><p>Official facts and Atlas interpretation are shown separately.</p></div>
    <div className={styles.policyList}>
      {policies.map((policy) => <article key={policy.id} className={styles.policy} aria-label={policy.title}>
        <header className={styles.policyHeader}><div><p className={styles.policyMeta}>{policy.area} · {policy.dateLabel} {dateLabel(policy.date)}</p><h2>{policy.title}</h2><p className={styles.policyMeta}>{policy.issuer}</p></div><span className={styles.badge}>{policy.status}</span></header>
        <div className={styles.affected} aria-label="Affected participants">{policy.affected.map((item) => <span key={item}>{item}</span>)}</div>
        <div className={styles.policyColumns}><div><h3>What the government changed</h3><p>{policy.change}</p></div><div className={styles.impact}><h3>Supply-chain impact · Atlas interpretation</h3><p>{policy.impact}</p></div></div>
        <p className={styles.policyLimit}><strong>Scope & limits:</strong> {policy.limitation}</p>
        <div className={styles.policySources}>{policy.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.date ? dateLabel(source.date) : "Current portal"} ↗</a>)}</div>
        <p className={styles.sellerCheck}>Reviewed {dateLabel(policy.checkedAt)}. Consult the cited notification and current scheme portal for eligibility and amendments.</p>
      </article>)}
    </div>
    <p className={styles.footnote}>This is a selected national-policy view, not a complete legal register. State incentives and individual project eligibility are not assessed here. Impact notes are interpretations of the cited measures, not government promises of demand, prices or returns.</p>
  </main>;
}
