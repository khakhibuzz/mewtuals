"use client";

import { useRef, useState } from "react";

import { isGlobalRadarRunItem, type GlobalRadarRunItem } from "./types";
import styles from "./global-radar.module.css";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function GlobalRadarRuns({
  initialRuns,
  approvedThemes,
}: {
  initialRuns: readonly GlobalRadarRunItem[];
  approvedThemes: readonly string[];
}) {
  const [runs, setRuns] = useState([...initialRuns]);
  const [theme, setTheme] = useState("");
  const [pending, setPending] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const requestId = useRef<string | null>(null);

  async function queue() {
    if (pending) return;
    requestId.current ??= globalThis.crypto.randomUUID();
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/global-demand-radar/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, theme: theme || null }),
      });
      const value: unknown = await response.json().catch(() => null);
      const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
      if (!response.ok) {
        setUnknownOutcome(false);
        setNotice({ kind: "alert", text: response.status === 409 ? "That manual request conflicts with an existing request." : "The manual Radar run could not be queued." });
        return;
      }
      if (body?.ok !== true || !isGlobalRadarRunItem(body.run)) {
        setUnknownOutcome(true);
        setNotice({ kind: "alert", text: "The manual Radar run outcome is unknown. Retry with the same request." });
        return;
      }
      setRuns((current) => [body.run as GlobalRadarRunItem, ...current.filter(({ id }) => id !== (body.run as GlobalRadarRunItem).id)]);
      requestId.current = null;
      setUnknownOutcome(false);
      setNotice({ kind: "status", text: "Manual Radar run queued." });
    } catch {
      setUnknownOutcome(true);
      setNotice({ kind: "alert", text: "The manual Radar run outcome is unknown. Retry with the same request." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.runs}>
      <form className={styles.manualRun} onSubmit={(event) => { event.preventDefault(); void queue(); }}>
        <label><span>Optional theme</span><select disabled={pending} onChange={(event) => setTheme(event.target.value)} value={theme}><option value="">Normal daily mix</option>{approvedThemes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <button disabled={pending} type="submit">{unknownOutcome ? "Retry manual Radar run" : "Queue manual Radar run"}</button>
      </form>
      {notice ? <p role={notice.kind}>{notice.text}</p> : null}
      {runs.length === 0 ? <p className={styles.emptyState}>No Radar runs have been queued yet.</p> : (
        <div className={styles.runList}>
          {runs.map((run) => (
            <section aria-label={`Radar run ${run.id}`} className={styles.runCard} key={run.id}>
              <div className={styles.runHeading}><h2>{label(run.status)}</h2><p>{label(run.trigger)} · {label(run.scanMode)}</p></div>
              <dl className={styles.runFacts}>
                <div><dt>Created</dt><dd>{dateTime(run.createdAt)}</dd></div>
                <div><dt>Completed</dt><dd>{dateTime(run.completedAt)}</dd></div>
                <div><dt>Results examined</dt><dd>{run.resultsExamined}</dd></div>
                <div><dt>Entities observed</dt><dd>{run.entitiesObserved}</dd></div>
                <div><dt>Signals found</dt><dd>{run.signalsFound}</dd></div>
                <div><dt>New / updated / duplicate</dt><dd>{run.numberNew} / {run.numberUpdated} / {run.numberDuplicates}</dd></div>
                <div><dt>Source errors</dt><dd>{run.sourceErrorCount}</dd></div>
              </dl>
              {run.notice ? <p className={styles.notice}>{run.notice}</p> : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
