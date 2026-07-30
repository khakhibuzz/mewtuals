"use client";

import { useRef, useState } from "react";

import {
  isGlobalRadarRecord,
  isGlobalRadarRunItem,
  type GlobalRadarRunItem,
} from "./types";
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
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(new Date(value));
}

function values(values: readonly string[]) {
  return values.length > 0 ? values.map(label).join(", ") : "None recorded";
}

function noticeCount(count: number | undefined) {
  if (count === undefined) return null;
  return `${count} source ${count === 1 ? "error" : "errors"}`;
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function GlobalRadarRuns({
  initialRuns,
  approvedThemes,
  page = 1,
}: {
  initialRuns: readonly GlobalRadarRunItem[];
  approvedThemes: readonly string[];
  page?: number;
}) {
  const [runs, setRuns] = useState([...initialRuns]);
  const [theme, setTheme] = useState("");
  const [pending, setPending] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const requestBody = useRef<string | null>(null);

  async function refreshRuns() {
    const response = await fetch(`/api/admin/global-demand-radar/runs?page=${page}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok || !isGlobalRadarRecord(value) || value.ok !== true ||
        value.outcome !== "listed" || !Array.isArray(value.runs) ||
        !value.runs.every(isGlobalRadarRunItem) || value.page !== page ||
        !isNonNegativeInteger(value.total) || !isNonNegativeInteger(value.pageSize) ||
        value.pageSize === 0) return false;
    setRuns(value.runs);
    return true;
  }

  async function queue() {
    if (pending) return;
    const retryingUnknownRequest = unknownOutcome && requestBody.current !== null;
    requestBody.current ??= JSON.stringify({
      requestId: globalThis.crypto.randomUUID(),
      ...(theme ? { theme } : {}),
    });
    const exactRequestBody = requestBody.current;
    setPending(true);
    setNotice(null);
    try {
      if (retryingUnknownRequest && !await refreshRuns()) {
        setNotice({
          kind: "alert",
          text: "The manual Radar run outcome is still unknown because the latest run list could not be refreshed.",
        });
        return;
      }
      const response = await fetch("/api/admin/global-demand-radar/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: exactRequestBody,
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500) {
          setUnknownOutcome(true);
          setNotice({ kind: "alert", text: "The manual Radar run outcome is unknown. Resubmit the same request." });
          return;
        }
        requestBody.current = null;
        setUnknownOutcome(false);
        setNotice({
          kind: "alert",
          text: response.status === 409
            ? "That manual request conflicts with the current Radar queue. Review it before resubmitting."
            : "The manual Radar run could not be queued.",
        });
        return;
      }
      if (!isGlobalRadarRecord(value) || value.ok !== true ||
          !["queued", "replayed"].includes(String(value.outcome)) ||
          !isGlobalRadarRunItem(value.run) || value.run.trigger !== "manual" ||
          value.run.scanMode !== "manual") {
        setUnknownOutcome(true);
        setNotice({ kind: "alert", text: "The manual Radar run outcome is unknown. Resubmit the same request." });
        return;
      }
      const safeRun = value.run;
      setRuns((current) => [safeRun, ...current.filter(({ id }) => id !== safeRun.id)]);
      requestBody.current = null;
      setUnknownOutcome(false);
      setNotice({
        kind: "status",
        text: value.outcome === "replayed"
          ? "Manual Radar run was already queued."
          : "Manual Radar run queued.",
      });
    } catch {
      setUnknownOutcome(true);
      setNotice({ kind: "alert", text: "The manual Radar run outcome is unknown. Resubmit the same request." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.runs}>
      <form className={styles.manualRun} onSubmit={(event) => { event.preventDefault(); void queue(); }}>
        <label>
          <span>Optional theme</span>
          <select disabled={pending || unknownOutcome} onChange={(event) => setTheme(event.target.value)} value={theme}>
            <option value="">Normal daily mix</option>
            {approvedThemes.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <button disabled={pending} type="submit">
          {unknownOutcome ? "Retry same manual request" : "Queue manual Radar run"}
        </button>
      </form>
      {notice ? <p role={notice.kind}>{notice.text}</p> : null}
      {runs.length === 0 ? (
        <p className={styles.emptyState}>No Radar runs have been queued yet.</p>
      ) : (
        <div className={styles.runList}>
          {runs.map((run) => (
            <section aria-label={`Radar run ${run.id}`} className={styles.runCard} key={run.id}>
              <div className={styles.runHeading}><h2>{label(run.status)}</h2><p>{label(run.trigger)} · {label(run.scanMode)}</p></div>
              <dl className={styles.runFacts}>
                <div><dt>Created</dt><dd>{dateTime(run.createdAt)}</dd></div>
                <div><dt>Started</dt><dd>{dateTime(run.startedAt)}</dd></div>
                <div><dt>Completed</dt><dd>{dateTime(run.completedAt)}</dd></div>
                <div><dt>Updated</dt><dd>{dateTime(run.updatedAt)}</dd></div>
                <div><dt>Results examined</dt><dd>{run.counts.resultsExamined}</dd></div>
                <div><dt>Entities observed</dt><dd>{run.counts.entitiesObserved}</dd></div>
                <div><dt>Signals found</dt><dd>{run.counts.signalsFound}</dd></div>
                <div><dt>Direct / precursor / momentum</dt><dd>{run.counts.directDemands} / {run.counts.precursors} / {run.counts.momentumRecords}</dd></div>
                <div><dt>New / updated / duplicate</dt><dd>{run.counts.new} / {run.counts.updated} / {run.counts.duplicates}</dd></div>
                <div><dt>Weak evidence rejected</dt><dd>{run.counts.rejectedForWeakEvidence}</dd></div>
                <div><dt>Source errors</dt><dd>{run.counts.sourceErrors}</dd></div>
                <div><dt>Countries</dt><dd>{values(run.sourceCountries)}</dd></div>
                <div><dt>Languages</dt><dd>{values(run.sourceLanguages)}</dd></div>
                <div><dt>Target domains</dt><dd>{values(run.targetDomains)}</dd></div>
                <div><dt>Signal types</dt><dd>{values(run.targetSignalTypes)}</dd></div>
                <div><dt>Sources</dt><dd>{values(run.sourcesUsed)}</dd></div>
              </dl>
              {run.notices.length > 0 ? (
                <ul aria-label="Run notices" className={styles.notices}>
                  {run.notices.map((runNotice) => (
                    <li className={styles.notice} key={runNotice.code}>
                      <span>{runNotice.message}</span>
                      {noticeCount(runNotice.count) ? <span> · {noticeCount(runNotice.count)}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
