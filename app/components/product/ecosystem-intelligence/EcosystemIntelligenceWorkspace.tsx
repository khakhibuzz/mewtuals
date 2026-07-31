"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CoverageSummary } from "./CoverageSummary";
import { CapabilityHeatmaps } from "./CapabilityHeatmaps";
import { ChangeSignals } from "./ChangeSignals";
import { EcosystemCandidateDrawer } from "./EcosystemCandidateDrawer";
import { EcosystemCandidateLedger } from "./EcosystemCandidateLedger";
import { EcosystemExplorer } from "./EcosystemExplorer";
import { EcosystemFilterBar } from "./EcosystemFilterBar";
import { IndiaEcosystemMap } from "./IndiaEcosystemMap";
import { RelationshipReadiness } from "./RelationshipReadiness";
import { ResearchGapInsights } from "./ResearchGapInsights";
import {
  applyBrowserFilterChanges,
  ecosystemWorkspaceHref,
  filtersFromBrowserQuery,
  serializeBrowserFilters,
} from "./filter-state";
import styles from "./ecosystem-intelligence.module.css";
import type {
  EcosystemFiltersDto,
  EcosystemSnapshotDto,
  EcosystemSnapshotResponseDto,
} from "./types";

const SNAPSHOT_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h12",
  timeZone: "Asia/Kolkata",
});

type EcosystemIntelligenceWorkspaceProps = {
  initialSnapshot: EcosystemSnapshotDto;
  canonicalQuery: string;
};

function canonicalBrowserQuery(rawQuery: string): string {
  try {
    return serializeBrowserFilters(filtersFromBrowserQuery(rawQuery));
  } catch {
    return rawQuery;
  }
}

export function EcosystemIntelligenceWorkspace({
  initialSnapshot,
  canonicalQuery,
}: EcosystemIntelligenceWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const frameworkQuery = canonicalBrowserQuery(searchParams?.toString() ?? "");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loadedQuery, setLoadedQuery] = useState(canonicalQuery);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<{
    id: string;
    name: string;
    trigger: HTMLButtonElement;
  }>();
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const pendingReturnFocusCandidateId = useRef<string | null>(null);

  const filters = useMemo(() => {
    try {
      return filtersFromBrowserQuery(frameworkQuery);
    } catch {
      return snapshot.filters;
    }
  }, [frameworkQuery, snapshot.filters]);

  const loadSnapshot = useCallback(async (query: string) => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const sequence = ++requestSequence.current;
    setBusy(true);
    setStale(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/admin/ecosystem-intelligence${query ? `?${query}` : ""}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Snapshot request failed.");
      const payload = await response.json() as EcosystemSnapshotResponseDto;
      if (!payload.ok) throw new Error("Snapshot request failed.");
      if (sequence !== requestSequence.current) return;
      setSnapshot(payload.snapshot);
      setLoadedQuery(query);
      setStale(false);
    } catch {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setError(true);
      setStale(true);
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (frameworkQuery === loadedQuery) {
        activeController.current?.abort();
        requestSequence.current += 1;
        setBusy(false);
        setError(false);
        setStale(false);
        return;
      }
      void loadSnapshot(frameworkQuery);
    });
    return () => {
      cancelled = true;
      activeController.current?.abort();
    };
  }, [frameworkQuery, loadSnapshot, loadedQuery]);

  useEffect(() => {
    const candidateId = pendingReturnFocusCandidateId.current;
    if (!candidateId) return;
    const matchingButtons = [...document.querySelectorAll<HTMLButtonElement>(
      "button[data-ecosystem-candidate-id]",
    )].filter((button) => button.dataset.ecosystemCandidateId === candidateId);
    const visibleButton = matchingButtons.find((button) => button.getClientRects().length > 0);
    const fallbackHeading = document.getElementById("candidate-ledger-heading");
    (visibleButton ?? matchingButtons[0] ?? fallbackHeading)?.focus();
    pendingReturnFocusCandidateId.current = null;
  }, [snapshot]);

  const updateFilters = useCallback((changes: Partial<EcosystemFiltersDto>) => {
    try {
      const nextFilters = applyBrowserFilterChanges(filters, changes);
      const query = serializeBrowserFilters(nextFilters);
      router.push(ecosystemWorkspaceHref(query));
    } catch {
      // Native controls can briefly expose incomplete values; keep the last canonical URL.
    }
  }, [filters, router]);

  const openCandidate = useCallback((candidateId: string, trigger: HTMLButtonElement) => {
    const candidate = snapshot.ledger.items.find(({ id }) => id === candidateId);
    setSelectedCandidate({ id: candidateId, name: candidate?.name ?? "Candidate", trigger });
  }, [snapshot.ledger.items]);

  const candidateReviewed = useCallback((candidate: { candidateId: string }) => {
    const returnFocus = selectedCandidate?.trigger;
    pendingReturnFocusCandidateId.current = candidate.candidateId;
    setSelectedCandidate(undefined);
    queueMicrotask(() => returnFocus?.focus());
    void loadSnapshot(frameworkQuery);
  }, [frameworkQuery, loadSnapshot, selectedCandidate]);

  return (
    <section
      className={styles.workspace}
      data-testid="ecosystem-workspace"
      data-stale={stale ? "true" : "false"}
      aria-busy={busy}
      aria-label="Ecosystem Intelligence workspace"
    >
      <div
        data-testid="ecosystem-initial-snapshot"
        data-canonical-query={canonicalQuery}
        data-generated-at={initialSnapshot.generatedAt}
      >
        <EcosystemFilterBar
          filters={filters}
          options={snapshot.filterOptions}
          onChange={updateFilters}
        />
        {error ? (
          <div className={styles.refreshError} role="alert">
            <p>We could not refresh this view. Showing the last available snapshot.</p>
            <button type="button" onClick={() => void loadSnapshot(frameworkQuery)}>
              Retry
            </button>
          </div>
        ) : null}
        <CoverageSummary snapshot={snapshot} stale={stale} />
        <IndiaEcosystemMap
          geography={snapshot.geography}
          selectedStateKeys={filters.headquartersStates}
          selectedCityKeys={filters.headquartersCities}
          onStateFilter={(stateKey) => updateFilters({ headquartersStates: [stateKey] })}
          onCityFilter={(cityKey) => updateFilters({ headquartersCities: [cityKey] })}
        />
        <EcosystemExplorer
          explorer={snapshot.explorer}
          onBusinessStageFilter={(key) => updateFilters({ businessStages: [key] })}
          onTechnicalLayerFilter={(key) => updateFilters({ technicalLayers: [key] })}
        />
        <CapabilityHeatmaps matrices={snapshot.matrices} onFilter={updateFilters} />
        <ResearchGapInsights insights={snapshot.insights} onFilter={updateFilters} />
        <ChangeSignals velocity={snapshot.velocity} momentum={snapshot.momentum} />
        <RelationshipReadiness relationships={snapshot.relationships} />
        <EcosystemCandidateLedger
          ledger={snapshot.ledger}
          filters={filters}
          onOpenCandidate={openCandidate}
        />
        <p className={styles.updatedAt}>
          Snapshot generated <time dateTime={snapshot.generatedAt}>{SNAPSHOT_TIME_FORMATTER.format(new Date(snapshot.generatedAt))}</time>.
        </p>
      </div>
      {selectedCandidate ? (
        <EcosystemCandidateDrawer
          candidateId={selectedCandidate.id}
          candidateName={selectedCandidate.name}
          returnFocusElement={selectedCandidate.trigger}
          onClose={() => setSelectedCandidate(undefined)}
          onCandidateUpdated={candidateReviewed}
        />
      ) : null}
    </section>
  );
}
