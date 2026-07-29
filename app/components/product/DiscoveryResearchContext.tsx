"use client";

import { useEffect, useState } from "react";

import {
  CandidateResearchHistory,
  type CandidateResearchHistoryData,
  type CandidateResearchVersion,
} from "./CandidateResearchHistory";
import styles from "./product.module.css";

type ResearchHistory = CandidateResearchHistoryData & {
  candidateId: string;
};

type ResearchState =
  | { candidateId: string; status: "loading" }
  | { candidateId: string; status: "error" }
  | { candidateId: string; status: "ready"; research: ResearchHistory };

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

function researchVersionFromResponse(
  value: unknown,
): CandidateResearchVersion | null {
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
  if (research.candidateId !== candidateId || !Array.isArray(research.history)) {
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
    history: history as CandidateResearchVersion[],
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
        setState(
          research
            ? { candidateId, status: "ready", research }
            : { candidateId, status: "error" },
        );
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

  return (
    <CandidateResearchHistory
      candidateName={candidateName}
      research={currentState.research}
      showEvidenceState={false}
    />
  );
}
