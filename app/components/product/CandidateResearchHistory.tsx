"use client";

import { useMemo, useState } from "react";

import styles from "./product.module.css";

export type CandidateResearchVersion = {
  id: string;
  discoveryRunId: string;
  summary: string;
  findings: string;
  sourceUrls: string[];
  analysisVersion: string;
  createdAt: string;
};

export type CandidateResearchHistoryData = {
  latest: CandidateResearchVersion | null;
  history: CandidateResearchVersion[];
};

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  const day = String(timestamp.getUTCDate()).padStart(2, "0");
  const month = monthLabels[timestamp.getUTCMonth()];
  const year = timestamp.getUTCFullYear();
  const hours = String(timestamp.getUTCHours()).padStart(2, "0");
  const minutes = String(timestamp.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

export function CandidateResearchHistory({
  candidateName,
  research,
  showEvidenceState = true,
}: {
  candidateName: string;
  research: CandidateResearchHistoryData;
  showEvidenceState?: boolean;
}) {
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [showFindings, setShowFindings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const versions = useMemo(() => {
    if (!research.latest) return [];
    const unique = new Map(
      [research.latest, ...research.history].map((version) => [version.id, version]),
    );
    return [...unique.values()].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  }, [research]);

  if (!research.latest) {
    return showEvidenceState ? (
      <section className={styles.discoveryDrawerGroup}>
        <h3>Systems context</h3>
        <p className={styles.status}>Unknown</p>
      </section>
    ) : null;
  }

  const selectedVersion =
    versions.find(({ id }) => id === selectedVersionId) ?? research.latest;

  return (
    <section
      className={`${styles.discoveryDrawerGroup} ${styles.discoveryResearch}`}
      aria-labelledby="candidate-research-title"
    >
      <div className={styles.discoveryResearchHeading}>
        <div>
          <h3 id="candidate-research-title">Systems context</h3>
          {showEvidenceState ? <p className={styles.status}>Evidence-backed</p> : null}
          <p>{formatTimestamp(selectedVersion.createdAt)}</p>
        </div>
        <div className={styles.discoveryResearchActions}>
          <button
            className={styles.discoveryDetailButton}
            type="button"
            aria-expanded={showFindings}
            onClick={() => setShowFindings((current) => !current)}
          >
            {showFindings ? "Hide findings" : "Show findings"}
          </button>
          {research.history.length > 0 ? (
            <button
              className={styles.discoveryDetailButton}
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((current) => !current)}
            >
              History ({research.history.length})
            </button>
          ) : null}
        </div>
      </div>
      <p className={styles.discoveryResearchSummary}>{selectedVersion.summary}</p>
      {showHistory ? (
        <ul className={styles.discoveryResearchHistory} aria-label="Research versions">
          {versions.map((version, index) => (
            <li key={version.id}>
              <button
                type="button"
                aria-current={version.id === selectedVersion.id ? "true" : undefined}
                aria-label={`View research from ${formatTimestamp(version.createdAt)}`}
                onClick={() => setSelectedVersionId(version.id)}
              >
                <span>{index === 0 ? "Latest" : `Version ${versions.length - index}`}</span>
                <time dateTime={version.createdAt}>
                  {formatTimestamp(version.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showFindings ? (
        <div className={styles.discoveryResearchFindings}>
          <pre>{selectedVersion.findings}</pre>
          <ul aria-label={`Research sources for ${candidateName}`}>
            {selectedVersion.sourceUrls.map((sourceUrl, index) => (
              <li key={sourceUrl}>
                <a
                  href={sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                  aria-label={`Research source ${index + 1} for ${candidateName}`}
                >
                  Source {index + 1}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
