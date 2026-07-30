"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CandidateReviewActions,
  type CandidateReviewUpdate,
} from "../CandidateReviewActions";
import { CandidateResearchHistory } from "../CandidateResearchHistory";
import { readableKey, taxonomyLabel } from "./labels";
import styles from "./ecosystem-intelligence.module.css";
import type {
  EcosystemCandidateDetailDto,
  EcosystemCandidateDetailResponseDto,
} from "./types";

type EcosystemCandidateDrawerProps = {
  candidateId: string;
  candidateName: string;
  returnFocusElement: HTMLElement | null;
  onClose: () => void;
  onCandidateUpdated: (candidate: {
    candidateId: string;
    status: EcosystemCandidateDetailDto["status"];
  }) => void;
};

function closeOpenDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export function EcosystemCandidateDrawer({
  candidateId,
  candidateName,
  returnFocusElement,
  onClose,
  onCandidateUpdated,
}: EcosystemCandidateDrawerProps) {
  const [detail, setDetail] = useState<EcosystemCandidateDetailDto>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const historyControllerRef = useRef<AbortController | null>(null);

  const loadDetail = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/ecosystem-intelligence/candidates/${encodeURIComponent(candidateId)}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Candidate request failed.");
      const payload = await response.json() as EcosystemCandidateDetailResponseDto;
      if (!payload.ok || payload.candidate.id !== candidateId) throw new Error("Candidate request failed.");
      setDetail(payload.candidate);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [candidateId]);

  const loadOlderResearch = useCallback(async () => {
    const nextOffset = detail?.research.historyPage.nextOffset;
    if (nextOffset === null || nextOffset === undefined || loadingHistory) return;
    historyControllerRef.current?.abort();
    const controller = new AbortController();
    historyControllerRef.current = controller;
    setLoadingHistory(true);
    setHistoryFailed(false);
    try {
      const response = await fetch(
        `/api/admin/ecosystem-intelligence/candidates/${encodeURIComponent(candidateId)}?researchOffset=${nextOffset}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Candidate history request failed.");
      const payload = await response.json() as EcosystemCandidateDetailResponseDto;
      if (!payload.ok || payload.candidate.id !== candidateId) {
        throw new Error("Candidate history request failed.");
      }
      setDetail((current) => {
        if (!current) return payload.candidate;
        const history = new Map(
          [...current.research.history, ...payload.candidate.research.history]
            .map((version) => [version.id, version]),
        );
        return {
          ...current,
          research: {
            current: current.research.current ?? payload.candidate.research.current,
            history: [...history.values()].sort(
              (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
            ),
            historyPage: payload.candidate.research.historyPage,
          },
        };
      });
    } catch {
      if (!controller.signal.aborted) setHistoryFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoadingHistory(false);
    }
  }, [candidateId, detail?.research.historyPage.nextOffset, loadingHistory]);

  const closeDrawer = useCallback(() => {
    closeOpenDialog(dialogRef.current);
    const returnFocus = returnFocusRef.current;
    onClose();
    queueMicrotask(() => returnFocus?.focus());
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    returnFocusRef.current = returnFocusElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    closeRef.current?.focus();
    queueMicrotask(() => {
      if (!cancelled) void loadDetail();
    });
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDrawer();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", closeOnEscape);
      controllerRef.current?.abort();
      historyControllerRef.current?.abort();
      document.body.style.overflow = priorOverflow;
      closeOpenDialog(dialog);
    };
  }, [closeDrawer, loadDetail, returnFocusElement]);

  function handleReviewUpdate(update: CandidateReviewUpdate) {
    if (!update.candidate || update.candidate.id !== candidateId) return;
    setDetail((current) => current ? {
      ...current,
      status: update.candidate!.status,
      updatedAt: update.candidate!.updatedAt,
    } : current);
    if (update.outcome === "saved") {
      onCandidateUpdated({ candidateId, status: update.candidate.status });
    }
  }

  return (
    <div className={styles.candidateDrawerBackdrop}>
      <dialog
        ref={dialogRef}
        className={styles.candidateDrawer}
        aria-labelledby="ecosystem-candidate-drawer-title"
        onCancel={(event) => { event.preventDefault(); closeDrawer(); }}
      >
        <div className={styles.candidateDrawerHeader}>
          <div>
            <p className={styles.kicker}>Company systems context</p>
            <h2 id="ecosystem-candidate-drawer-title">{detail?.name ?? candidateName}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={closeDrawer} aria-label={`Close ${candidateName} details`}>
            Close
          </button>
        </div>
        {loading ? <p role="status" className={styles.drawerStatus}>Loading candidate evidence…</p> : null}
        {failed ? (
          <div role="alert" className={styles.drawerError}>
            <p>We could not load this candidate. Please try again.</p>
            <button type="button" onClick={() => void loadDetail()} aria-label="Retry candidate details">Retry</button>
          </div>
        ) : null}
        {detail ? <CandidateDetail
          detail={detail}
          onReviewUpdate={handleReviewUpdate}
          loadingHistory={loadingHistory}
          historyFailed={historyFailed}
          onLoadOlderResearch={loadOlderResearch}
        /> : null}
      </dialog>
    </div>
  );
}

function CandidateDetail({
  detail,
  onReviewUpdate,
  loadingHistory,
  historyFailed,
  onLoadOlderResearch,
}: {
  detail: EcosystemCandidateDetailDto;
  onReviewUpdate: (update: CandidateReviewUpdate) => void;
  loadingHistory: boolean;
  historyFailed: boolean;
  onLoadOlderResearch: () => Promise<void>;
}) {
  const publicLinkCandidates = [
    detail.publicUrls.canonical ? { href: detail.publicUrls.canonical, label: `${detail.name} canonical profile`, text: "Canonical profile" } : null,
    detail.publicUrls.website ? { href: detail.publicUrls.website, label: `${detail.name} website`, text: "Website" } : null,
    detail.publicUrls.linkedin ? { href: detail.publicUrls.linkedin, label: `${detail.name} LinkedIn`, text: "LinkedIn" } : null,
    detail.type === "creator" && detail.publicUrls.primarySocial
      ? { href: detail.publicUrls.primarySocial, label: `${detail.name} primary social profile`, text: "Primary social" }
      : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);
  const seenPublicUrls = new Set<string>();
  const publicLinks = publicLinkCandidates.filter((link) => {
    if (seenPublicUrls.has(link.href)) return false;
    seenPublicUrls.add(link.href);
    return true;
  });
  const classificationsByKind = new Map<string, typeof detail.classifications>();
  for (const classification of detail.classifications) {
    const current = classificationsByKind.get(classification.kind) ?? [];
    classificationsByKind.set(classification.kind, [...current, classification]);
  }

  return (
    <div className={styles.candidateDrawerBody}>
      <p className={styles.candidateDescription}>{detail.description}</p>
      <dl className={styles.candidateIdentityGrid}>
        <div><dt>Type</dt><dd>{readableKey(detail.type)}</dd></div>
        <div><dt>Category</dt><dd>{detail.category}</dd></div>
        <div><dt>Subcategory</dt><dd>{detail.subcategory ?? "Unknown"}</dd></div>
        <div><dt>Discovery confidence</dt><dd>{detail.discoveryScore} / 100</dd></div>
        <div><dt>Review status</dt><dd>{readableKey(detail.status)}</dd></div>
        <div><dt>Headquarters</dt><dd>{detail.headquarters ? `${detail.headquarters.cityLabel}, ${detail.headquarters.stateLabel}` : "Unknown"}</dd></div>
      </dl>
      <section className={styles.drawerGroup}>
        <h3>Headquarters evidence</h3>
        {detail.headquarters ? (
          <div className={styles.factEvidence}>
            <p><strong>{detail.headquarters.cityLabel}, {detail.headquarters.stateLabel}</strong></p>
            <p>{detail.headquarters.evidenceState === "evidence_backed" ? "Evidence-backed" : "Inferred"} · {detail.headquarters.confidence}% confidence</p>
            <div className={styles.drawerLinks}>
              {detail.headquarters.sourceUrls.map((sourceUrl, index) => (
                <a key={sourceUrl} href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`Headquarters evidence ${index + 1} for ${detail.name}`}>Source {index + 1}</a>
              ))}
            </div>
          </div>
        ) : <p className={styles.drawerStatus}>Unknown</p>}
      </section>
      <section className={styles.drawerGroup}>
        <h3>Classifications</h3>
        {detail.classifications.length ? (
          <ul className={styles.classificationList}>
            {[...classificationsByKind].flatMap(([kind, classifications]) => classifications.map((classification) => (
              <li key={`${kind}:${classification.termKey}`}>
                <strong>{taxonomyLabel(classification.kind, classification.termKey)}</strong>
                <span>{readableKey(classification.kind)}</span>
                <span data-evidence-state={classification.evidenceState}>{classification.evidenceState === "evidence_backed" ? "Evidence-backed" : "Inferred"}</span>
                <p>{classification.confidence === null ? "Confidence not separately scored" : `${classification.confidence}% confidence`} · {classification.basis}</p>
                {classification.sourceUrls.length ? <div className={styles.drawerLinks}>{classification.sourceUrls.map((sourceUrl, index) => (
                  <a key={sourceUrl} href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`${taxonomyLabel(classification.kind, classification.termKey)} evidence ${index + 1}`}>Source {index + 1}</a>
                ))}</div> : null}
              </li>
            )))}</ul>
        ) : <p className={styles.drawerStatus}>Unknown</p>}
      </section>
      <section className={styles.drawerGroup}>
        <h3>Public professional contacts</h3>
        {publicLinks.length ? <div className={styles.drawerLinks}>{publicLinks.map((link) => (
          <a key={`${link.label}:${link.href}`} href={link.href} aria-label={link.label} target="_blank" rel="noreferrer">{link.text}</a>
        ))}</div> : <p className={styles.drawerStatus}>Unknown</p>}
      </section>
      <CandidateResearchHistory
        candidateName={detail.name}
        research={{ latest: detail.research.current, history: detail.research.history }}
        historyTotal={detail.research.historyPage.total}
        hasMoreHistory={detail.research.historyPage.hasMore}
        loadingMoreHistory={loadingHistory}
        historyLoadError={historyFailed}
        onLoadMoreHistory={() => void onLoadOlderResearch()}
      />
      <section className={styles.drawerGroup}>
        <h3>Active public signals</h3>
        {detail.signals.length ? <ul className={styles.drawerEvidenceList}>{detail.signals.map((signal) => (
          <li key={signal.id}>
            <div>
              <strong>{signal.title}</strong>
              <span>{taxonomyLabel("signal_type", signal.type)} · {signal.confidence}% confidence</span>
              <span>Occurred {signal.occurredAt.slice(0, 10)} · active until {signal.activeUntil.slice(0, 10)}</span>
              <span>{signal.expiresAt ? `Explicit expiry ${signal.expiresAt.slice(0, 10)}` : "Registered freshness window applies"}</span>
            </div>
            <a href={signal.sourceUrl} aria-label={`Evidence for ${signal.title}`} target="_blank" rel="noreferrer">Evidence</a>
          </li>
        ))}</ul> : <p className={styles.drawerStatus}>Unknown</p>}
      </section>
      <section className={styles.drawerGroup}>
        <h3>Verified relationships</h3>
        {detail.relationships.length ? <ul className={styles.drawerEvidenceList}>{detail.relationships.map((relationship) => {
          const counterpartyName = relationship.direction === "upstream"
            ? relationship.sourceName
            : relationship.targetName;
          return <li key={relationship.id}>
            <div><strong>{relationship.direction === "upstream" ? "Upstream" : "Downstream"}: {counterpartyName}</strong><span>{taxonomyLabel("relationship_type", relationship.type)} · {relationship.confidence}% confidence</span></div>
            <a href={relationship.evidenceUrl} aria-label={`Evidence for relationship with ${counterpartyName}`} target="_blank" rel="noreferrer">Evidence</a>
          </li>;
        })}</ul> : <p className={styles.drawerStatus}>Unknown</p>}
      </section>
      <section className={styles.drawerGroup}>
        <h3>Evidence sources</h3>
        {detail.sources.length ? <ul className={styles.drawerEvidenceList}>{detail.sources.map((source) => (
          <li key={source.id}><div><strong>{source.sourceName}</strong><span>Last seen {source.lastSeenAt.slice(0, 10)}</span></div><a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a></li>
        ))}</ul> : <p className={styles.drawerStatus}>Unknown</p>}
      </section>
      <section className={styles.drawerGroup}>
        <h3>Review status</h3>
        <CandidateReviewActions
          candidateId={detail.id}
          candidateName={detail.name}
          status={detail.status}
          updatedAt={detail.updatedAt}
          onUpdated={onReviewUpdate}
        />
      </section>
    </div>
  );
}
