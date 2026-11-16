"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { batteryStages } from "../../data/battery-stages";
import { batteryStageResearch } from "../../data/battery-stage-research";
import { indiaBatteryRecords } from "../../data/india-battery-research";
import { batteryStatusLabels, filterBatteryRecords, type BatteryRole, type BatteryStageId } from "../../domain/battery-research";
import { BatteryNavigation } from "./BatteryNavigation";
import { BatteryJourneys } from "./BatteryJourneys";
import { BatteryMap3D } from "./BatteryMap3D";
import { BatteryMap } from "./BatteryMap";
import { BatteryResearchPanel, ResearchSources } from "./BatteryResearchPanel";
import styles from "./battery-atlas.module.css";

const subscribeToHydration = () => () => {};

export function BatteryAtlas() {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [mapMode, setMapMode] = useState<"3d" | "2d">("3d");
  const fallback = useCallback(() => setMapMode("2d"), []);
  const [selected, setSelected] = useState(true);
  const [role, setRole] = useState<BatteryRole | "all">("all");
  const [stageId, setStageId] = useState<BatteryStageId | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [areaIds, setAreaIds] = useState<readonly string[] | null>(null);
  const countryButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const stage = batteryStages.find((item) => item.id === stageId);
  const filtered = useMemo(() => filterBatteryRecords(indiaBatteryRecords, stageId).filter((item) => role === "all" || item.roles?.includes(role)), [stageId, role]);
  const visibleRecords = areaIds ? filtered.filter((record) => areaIds.includes(record.id)) : filtered;
  const record = filtered.find((item) => item.id === recordId);
  const mappedCount = filtered.filter((item) => item.location !== null).length;

  function closeDetails() {
    setSelected(false);
    countryButton.current?.focus();
  }

  function selectStage(id: BatteryStageId | null) {
    setStageId(id);
    setRecordId(null);
    setAreaIds(null);
    setSelected(true);
  }

  function showRecords(ids: readonly string[]) {
    setSelected(true);
    setAreaIds(ids.length > 1 ? ids : null);
    setRecordId(ids.length === 1 ? ids[0] : null);
    queueMicrotask(() => {
      if (panel.current) panel.current.scrollTop = 0;
      panel.current?.focus({ preventScroll: true });
      if (window.matchMedia?.("(max-width: 767px)").matches) panel.current?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <main className={styles.atlas} data-hydrated={hydrated}>
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>MEWTUALS / ENERGY SYSTEMS</p><h1>Battery Atlas<span>.</span></h1></div>
        <div className={styles.toolbar}>
          <button ref={countryButton} type="button" className={styles.countryButton} aria-pressed={selected} aria-controls="battery-country-details" onClick={() => { setSelected(true); setRecordId(null); setAreaIds(null); }}><span className={styles.dot} />India <span>↗</span></button>
          <span>{indiaBatteryRecords.length} research records<br />Reviewed 6 Sep 2026</span>
        </div>
      </div>
      <BatteryNavigation current="map" />
      <section className={styles.lifecycle} aria-label="Battery lifecycle stages">
        <div className={styles.lifecycleHeading}><h2>The battery lifecycle</h2><span>Filter the map and evidence together</span></div>
        <div className={`${styles.stages} ${styles.researchedStages}`}>
          <button type="button" aria-pressed={stageId === null} onClick={() => selectStage(null)}><span>INDIA</span>All stages</button>
          {batteryStages.map((item, index) => <button key={item.id} type="button" aria-label={`${String(index + 1).padStart(2, "0")} ${item.name}`} aria-pressed={stageId === item.id} onClick={() => selectStage(item.id)}><span>{String(index + 1).padStart(2, "0")}</span>{item.name}</button>)}
        </div>
      </section>
      <div className={styles.roleFilter}><label htmlFor="battery-role">Find a capability</label><select id="battery-role" value={role} onChange={(event) => { setRole(event.target.value as BatteryRole | "all"); setStageId(null); setRecordId(null); setAreaIds(null); setSelected(true); }}>
        <option value="all">All capabilities</option><option value="cells">Cell manufacturing</option><option value="packs">Battery packs</option><option value="bms">BMS</option><option value="chargers">Chargers</option><option value="materials">Materials & refining</option><option value="recycling">Recycling</option><option value="applications">End uses</option>
      </select></div>
      <div className={styles.researchScope}><span><strong>{filtered.length}</strong> records · <strong>{mappedCount}</strong> approximate locality markers</span><span>Selected evidence, not a complete census.</span></div>
      <div className={styles.viewModes} aria-label="Map display"><button type="button" aria-pressed={mapMode === "3d"} onClick={() => setMapMode("3d")}>3D India</button><button type="button" aria-pressed={mapMode === "2d"} onClick={() => setMapMode("2d")}>Flat map</button><a href="#battery-journeys">Follow a battery ↓</a></div>
      <div className={styles.workspace}>
        {mapMode === "3d" ? <BatteryMap3D key={`${stageId}-${role}`} records={filtered} selectedRecordId={recordId} onSelectRecords={showRecords} onFallback={fallback} /> : <BatteryMap selected={selected} onSelect={() => { setSelected(true); setRecordId(null); setAreaIds(null); }} records={filtered} selectedRecordId={recordId} onSelectRecords={showRecords} />}
        <aside ref={panel} tabIndex={-1} id="battery-country-details" className={`${styles.details} ${styles.researchPanel}`} aria-label="Country details" onKeyDown={(event) => { if (event.key === "Escape" && selected) closeDetails(); }}>
          {selected ? <>
            <div className={styles.countryHeading}><div><p className={styles.eyebrow}>COUNTRY 01</p><h2>India</h2></div><button type="button" aria-label="Close country details" onClick={closeDetails}>×</button></div>
            {record ? <BatteryResearchPanel record={record} onBack={() => { setRecordId(null); setAreaIds(null); panel.current?.focus(); }} /> : <>
              {areaIds ? <div className={styles.areaHeading}><h3>{visibleRecords.length} records in this area</h3><button type="button" onClick={() => setAreaIds(null)}>Show all results</button></div> : <div className={styles.researchOverview}>
                <h3>{stage?.name ?? "India’s battery supply chain"}</h3>
                <p>{stageId ? batteryStageResearch[stageId].summary : "India is developing battery materials, cells and packs alongside recycling. A March 2026 government snapshot says advanced-cell demand is still largely met through imports."}</p>
                <details className={styles.explainer}><summary>{stage ? "Stage guide and sources" : "Context source"}</summary>{stage && <p>{stage.description}</p>}<ResearchSources ids={stageId ? batteryStageResearch[stageId].sourceIds : ["india-acc"]} /></details>
              </div>}
              <div className={styles.researchList} aria-label="Research results">
                {visibleRecords.length === 0 && <p>No researched records match these filters yet.</p>}
                {visibleRecords.map((item) => <button type="button" key={item.id} aria-label={`Read research: ${item.name}`} className={styles.resultCard} onClick={() => showRecords([item.id])}>
                  <span className={styles.status} data-status={item.status}>{batteryStatusLabels[item.status]}</span><strong>{item.name}</strong><span>{item.locality}</span>{!item.location && <small>Listed only · no verified site marker</small>}
                </button>)}
              </div>
            </>}
          </> : <div className={styles.empty}><p className={styles.eyebrow}>EXPLORE A COUNTRY</p><h2>Start with India</h2><p>Select India or a map marker to open its research.</p></div>}
        </aside>
      </div>
      <BatteryJourneys onOpenRecord={(id) => {
        setRole("all"); setStageId(null); showRecords([id]);
        queueMicrotask(() => panel.current?.scrollIntoView({ block: "start" }));
      }} />
      <footer className={styles.footer}>
        <p>Pins show towns or district references, not factory boundaries. Operating status is source-reported; missing evidence does not mean no activity.</p>
        <p>Map: <a href="https://github.com/datameet/maps/tree/b3fbbde595310b397a55d718e0958ce249a4fa1f">DataMeet</a> · Localities: <a href="https://www.geonames.org/export/">GeoNames</a> (CC BY).<br />Primary government and company sources are linked inside each record.</p>
      </footer>
    </main>
  );
}
