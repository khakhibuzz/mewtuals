"use client";

import { useEffect, useState } from "react";

import styles from "./product.module.css";

type ResearchVersion = {
  id: string;
  discoveryRunId: string;
  summary: string;
  findings: string;
  sourceUrls: string[];
  analysisVersion: string;
  createdAt: string;
};

type ResearchHistory = {
  candidateId: string;
  latest: ResearchVersion | null;
  history: ResearchVersion[];
};

type ResearchState =
  | { candidateId: string; status: "loading" }
  | { candidateId: string; status: "error" }
  | { candidateId: string; status: "ready"; research: ResearchHistory };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPublicUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function researchVersionFromResponse(value: unknown): ResearchVersion | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.discoveryRunId !== "string" ||
    typeof value.summary !== "string" ||
    typeof value.findings !== "string" ||
    !Array.isArray(value.sourceUrls) ||
    !value.sourceUrls.every(isPublicUrl) ||
    typeof value.analysisVersion !== "string" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt))
  ) {
    return null;
  }
  return {
    id: value.id,
    discoveryRunId: value.discoveryRunId,
    summary: value.summary,
    findings: value.findings,
    sourceUrls: value.sourceUrls,
    analysisVersion: value.analysisVersion,
    createdAt: value.createdAt,
  };
}

function researchFromResponse(
  value: unknown,
  candidateId: string,
): ResearchHistory | null {
  if (!isRecord(value) || !isRecord(value.research)) return null;
  const research = value.research;
  if (
    research.candidateId !== candidateId ||
    !Array.isArray(research.history)
  ) {
    return null;
  }
  const latest =
    research.latest === null
      ? null
      : researchVersionFromResponse(research.latest);
  const history = research.history.map(researchVersionFromResponse);
  if (
    (research.latest !== null && latest === null) ||
    history.some((version) => version === null)
  ) {
    return null;
  }
  return {
    candidateId,
    latest,
    history: history as ResearchVersion[],
  };
}

export function DiscoveryResearchContext({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const [state, setState] = useState<ResearchState>({
    candidateId,
    status: "loading",
  });
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [showFindings, setShowFindings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [requestAttempt, setRequestAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadResearch() {
      try {
        const response = await fetch(
          `/api/admin/discovery/candidates/${candidateId}`,
          { signal: controller.signal },
        );
        const result: unknown = await response.json().catch(() => null);
        if (!active) return;
        const research = response.ok
          ? researchFromResponse(result, candidateId)
          : null;
        if (!research) {
          setState({ candidateId, status: "error" });
          return;
        }
        setState({ candidateId, status: "ready", research });
        setSelectedVersionId(research.latest?.id);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setState({ candidateId, status: "error" });
      }
    }

    void loadResearch();
    return () => {
      active = false;
      controller.abort();
    };
  }, [candidateId, requestAttempt]);

  const currentState: ResearchState =
    state.candidateId === candidateId
      ? state
      : { candidateId, status: "loading" };

  if (currentState.status === "loading") {
    return (
      <section className={styles.discoveryDrawerGroup}>
        <p className={styles.status} role="status">
          Loading systems context for {candidateName}…
        </p>
      </section>
    );
  }
  if (currentState.status === "error") {
    return (
      <section className={styles.discoveryDrawerGroup}>
        <p className={styles.error} role="alert">
          Systems context could not be loaded.
        </p>
        <button
          className={styles.discoveryDetailButton}
          type="button"
          onClick={() => {
            setState({ candidateId, status: "loading" });
            setRequestAttempt((attempt) => attempt + 1);
          }}
        >
          Retry systems context
        </button>
      </section>
    );
  }
  if (!currentState.research.latest) return null;

  const versions = [currentState.research.latest, ...currentState.research.history];
  const selectedVersion =
    versions.find(({ id }) => id === selectedVersionId) ??
    currentState.research.latest;

  return (
    <section
      className={`${styles.discoveryDrawerGroup} ${styles.discoveryResearch}`}
      aria-labelledby="discovery-research-title"
    >
      <div className={styles.discoveryResearchHeading}>
        <div>
          <h3 id="discovery-research-title">Systems context</h3>
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
          {currentState.research.history.length > 0 ? (
            <button
              className={styles.discoveryDetailButton}
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((current) => !current)}
            >
              History ({currentState.research.history.length})
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
