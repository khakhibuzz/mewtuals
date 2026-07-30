"use client";

import { useState } from "react";

import {
  isGlobalRadarWatchlistItem,
  type GlobalRadarWatchlistItem,
} from "./types";
import styles from "./global-radar.module.css";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function date(value: string | null, empty: string) {
  if (!value) return empty;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function GlobalRadarWatchlist({
  initialItems,
}: {
  initialItems: readonly GlobalRadarWatchlistItem[];
}) {
  const [items, setItems] = useState([...initialItems]);
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);

  async function mutate(item: GlobalRadarWatchlistItem, action: "pause" | "resume" | "disable") {
    if (pendingEntityId) return;
    setPendingEntityId(item.entity.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/global-demand-radar/entities/${item.entity.id}/watchlist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: item.revision }),
      });
      const value: unknown = await response.json().catch(() => null);
      const body = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
      const latest = body?.watchlist;
      if (isGlobalRadarWatchlistItem(latest)) {
        setItems((current) => current.map((entry) => entry.entity.id === latest.entity.id ? latest : entry));
      }
      if (!response.ok) {
        setNotice({ kind: "alert", text: response.status === 409 ? "The watchlist entry changed. Review the latest state." : "The watchlist update could not be completed." });
        return;
      }
      if (body?.ok !== true || !isGlobalRadarWatchlistItem(latest)) {
        setNotice({ kind: "alert", text: "The watchlist update returned an invalid response." });
        return;
      }
      setNotice({ kind: "status", text: "Watchlist updated." });
    } catch {
      setNotice({ kind: "alert", text: "The watchlist update could not be completed." });
    } finally {
      setPendingEntityId(null);
    }
  }

  if (items.length === 0) return <p className={styles.emptyState}>No entities are on the Radar watchlist.</p>;
  return (
    <div className={styles.watchlist}>
      {notice ? <p role={notice.kind}>{notice.text}</p> : null}
      {items.map((item) => {
        const disabled = pendingEntityId !== null;
        return (
          <section aria-label={item.entity.canonicalName} className={styles.watchlistCard} key={item.entity.id}>
            <div><p className={styles.kicker}>{item.entity.headquartersCountry}</p><h2>{item.entity.canonicalName}</h2></div>
            <dl className={styles.watchlistFacts}>
              <div><dt>Monitoring</dt><dd>{label(item.monitoringState)}</dd></div>
              <div><dt>Priority</dt><dd>Priority {item.priority}</dd></div>
              <div><dt>Cadence</dt><dd>{label(item.cadence)}</dd></div>
              <div><dt>Next scan</dt><dd>{date(item.nextScanAt, "Not scheduled")}</dd></div>
              <div><dt>Expiry</dt><dd>{date(item.expiresAt, "No watchlist expiry")}</dd></div>
              <div><dt>Promotion</dt><dd>{label(item.promotionState)}</dd></div>
            </dl>
            <div className={styles.latestSignal}>
              <h3>Latest signal</h3>
              {item.latestSignal ? <><p>{item.latestSignal.title}</p><p>{label(item.latestSignal.signalClass)} · {label(item.latestSignal.status)}</p></> : <p>No signal attached yet.</p>}
            </div>
            <div className={styles.actions}>
              {item.monitoringState === "active" ? <button disabled={disabled} onClick={() => void mutate(item, "pause")} type="button">Pause {item.entity.canonicalName}</button> : null}
              {item.monitoringState === "paused" ? <button disabled={disabled} onClick={() => void mutate(item, "resume")} type="button">Resume {item.entity.canonicalName}</button> : null}
              {item.monitoringState !== "disabled" ? <button disabled={disabled} onClick={() => void mutate(item, "disable")} type="button">Disable {item.entity.canonicalName}</button> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
