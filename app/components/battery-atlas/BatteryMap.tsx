"use client";

import { geoIdentity, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";
import indiaRaw from "../../data/india-states-simplified.geojson?raw";
import type { BatteryResearchRecord } from "../../domain/battery-research";
import { clusterMapPoints } from "./map-points";
import styles from "./battery-atlas.module.css";

const WIDTH = 720;
const HEIGHT = 600;
const geography = JSON.parse(indiaRaw) as FeatureCollection;
// This country-scale planar projection preserves the source GeoJSON winding.
const projection = geoIdentity().reflectY(true).fitExtent([[125, 35], [635, 540]], geography);
const path = geoPath(projection);
const initialView = { zoom: 1, x: 0, y: 0 };
type View = typeof initialView;

function boundedView(view: View): View {
  const zoom = Math.max(1, Math.min(4, view.zoom));
  const maxX = WIDTH * (zoom - 1) / 2;
  const maxY = HEIGHT * (zoom - 1) / 2;
  return { zoom, x: Math.max(-maxX, Math.min(maxX, view.x)), y: Math.max(-maxY, Math.min(maxY, view.y)) };
}

interface BatteryMapProps {
  selected: boolean;
  onSelect: () => void;
  records?: readonly BatteryResearchRecord[];
  selectedRecordId?: string | null;
  onSelectRecords?: (ids: readonly string[]) => void;
}

export function BatteryMap({ selected, onSelect, records = [], selectedRecordId, onSelectRecords }: BatteryMapProps) {
  const [view, setView] = useState(initialView);
  const drawing = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: WIDTH, height: HEIGHT });
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const wasDragged = useRef(false);
  const move = (x: number, y: number) => setView((current) => boundedView({ ...current, x: current.x + x, y: current.y + y }));

  useEffect(() => {
    if (!drawing.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(drawing.current);
    return () => observer.disconnect();
  }, []);

  const points = records.flatMap((record) => {
    if (!record.location) return [];
    const point = projection([record.location.longitude, record.location.latitude]);
    if (!point) return [];
    return [{ id: record.id,
      x: ((point[0] - WIDTH / 2) * view.zoom + WIDTH / 2 + view.x) * size.width / WIDTH,
      y: ((point[1] - HEIGHT / 2) * view.zoom + HEIGHT / 2 + view.y) * size.height / HEIGHT,
    }];
  });
  const clusters = clusterMapPoints(points, 48);

  return (
    <div className={styles.map}>
      <div className={styles.mapHeading}><span className={styles.dot} /> INDIA <span>Select a locality marker</span></div>
      <div className={styles.mapDrawing} ref={drawing}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.geography} role="group" aria-label="India battery atlas map" tabIndex={0}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
          if (directions[event.key]) { event.preventDefault(); move(...directions[event.key]); }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          wasDragged.current = false;
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          if (!drag.current.moved && Math.hypot(dx, dy) < 4) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const bounds = event.currentTarget.getBoundingClientRect();
          // SVG's default meet alignment can letterbox the viewBox on either axis.
          const scale = 1 / Math.min(bounds.width / WIDTH, bounds.height / HEIGHT);
          move(dx * scale, dy * scale);
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: true };
          wasDragged.current = true;
        }}
        onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}
        onPointerCancel={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}
        onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}>
        <title>India — battery ecosystem</title>
        <desc>Select India to explore the battery lifecycle. Zoom in, then drag or use arrow keys to pan. Markers show approximate localities, not factory entrances. Numbers group nearby records. The results list provides the same research and includes records without verified site locations.</desc>
        <g transform={`translate(${WIDTH / 2 + view.x} ${HEIGHT / 2 + view.y}) scale(${view.zoom}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}>
          <g role="button" tabIndex={0} aria-label="Select India on map" aria-pressed={selected}
            className={styles.country} data-selected={selected}
            onClick={() => { if (!wasDragged.current) onSelect(); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); }
            }}>
            {geography.features.map((feature, index) => <path key={index} d={path(feature) ?? undefined} />)}
          </g>
          <text x="345" y="285" className={styles.countryLabel} aria-hidden="true">INDIA</text>
        </g>
        <text x="100" y="410" className={styles.waterLabel} aria-hidden="true">ARABIAN SEA</text>
        <text x="490" y="390" className={styles.waterLabel} aria-hidden="true">BAY OF BENGAL</text>
        <text x="295" y="570" className={styles.waterLabel} aria-hidden="true">INDIAN OCEAN</text>
      </svg>
      <div className={styles.markerLayer} aria-label="Research locality markers">
        {clusters.map((cluster) => {
          const label = cluster.ids.length === 1
            ? `Open location: ${records.find((record) => record.id === cluster.ids[0])?.name}`
            : `Open ${cluster.ids.length} records in this area`;
          return <button key={cluster.ids.join("-")} type="button" className={styles.mapMarker}
            style={{ left: cluster.x, top: cluster.y }} aria-label={label} title={label}
            aria-pressed={selectedRecordId ? cluster.ids.includes(selectedRecordId) : false}
            onClick={() => onSelectRecords?.(cluster.ids)}>
            <span>{cluster.ids.length === 1 ? "•" : cluster.ids.length}</span>
          </button>;
        })}
      </div>
      </div>
      <div className={styles.mapControls}>
        <button type="button" aria-label="Zoom in" disabled={view.zoom === 4} onClick={() => setView((v) => boundedView({ ...v, zoom: v.zoom + 0.5 }))}>+</button>
        <button type="button" aria-label="Zoom out" disabled={view.zoom === 1} onClick={() => setView((v) => boundedView({ ...v, zoom: v.zoom - 0.5 }))}>−</button>
        <button type="button" aria-label="Reset map" onClick={() => setView(initialView)}>↺</button>
      </div>
      <div className={styles.mapFoot}><span>Numbers group nearby records</span><span>Approximate localities</span></div>
    </div>
  );
}
