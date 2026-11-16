"use client";

import { useEffect, useRef, useState } from "react";
import type { BatteryResearchRecord } from "../../domain/battery-research";
import { clusterMapPoints } from "./map-points";
import styles from "./battery-atlas.module.css";

interface Props {
  records: readonly BatteryResearchRecord[];
  selectedRecordId?: string | null;
  onSelectRecords: (ids: readonly string[]) => void;
  onFallback: () => void;
}

export function BatteryMap3D({ records, selectedRecordId, onSelectRecords, onFallback }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [points, setPoints] = useState<{ id: string; x: number; y: number }[]>([]);
  const controls = useRef<{ zoom: (factor: number) => void; reset: () => void } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./battery-scene").then(({ createBatteryScene }) => createBatteryScene(element, records, (next) => {
      if (!cancelled) setPoints(next);
    })).then((scene) => {
      if (cancelled) { scene.dispose(); return; }
      dispose = scene.dispose;
      controls.current = scene;
      setReady(true);
    }).catch(() => { if (!cancelled) onFallback(); });
    return () => { cancelled = true; dispose?.(); controls.current = null; };
  }, [records, onFallback]);
  const clusters = clusterMapPoints(points, 48);
  return <div className={styles.map}>
    <div className={styles.mapHeading}><span className={styles.dot} /> INDIA <span>Drag to orbit · scroll to zoom</span></div>
    <div className={styles.sceneHost} ref={host} aria-label="Three-dimensional India map" data-ready={ready} />
    {!ready && <p className={styles.sceneLoading} role="status">Opening India in 3D…</p>}
    <div className={styles.markerLayer} aria-label="Research locality markers">
      {clusters.map((cluster) => <button key={cluster.ids.join("-")} type="button" className={styles.mapMarker}
        style={{ left: cluster.x, top: cluster.y }}
        aria-label={cluster.ids.length === 1 ? `Open location: ${records.find((r) => r.id === cluster.ids[0])?.name}` : `Open ${cluster.ids.length} records in this area`}
        aria-pressed={!!selectedRecordId && cluster.ids.includes(selectedRecordId)}
        onClick={() => onSelectRecords(cluster.ids)}><span>{cluster.ids.length === 1 ? "•" : cluster.ids.length}</span></button>)}
    </div>
    <div className={styles.mapControls}>
      <button type="button" aria-label="Zoom in" onClick={() => controls.current?.zoom(1.25)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => controls.current?.zoom(.8)}>−</button>
      <button type="button" aria-label="Reset map" onClick={() => controls.current?.reset()}>↺</button>
    </div>
    <div className={styles.mapFoot}><span>Uniform height · no capacity encoding</span><span>Approximate localities</span></div>
  </div>;
}
