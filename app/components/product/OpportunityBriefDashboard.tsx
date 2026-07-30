"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  OpportunityBriefDetailDialog,
  type OpportunityBriefConflictEditReset,
  type OpportunityBriefDashboardRequest,
  type OpportunityBriefFeedback,
  type OpportunityBriefMutation,
} from "./OpportunityBriefDetailDialog";
import styles from "./product.module.css";

export type { OpportunityBriefDashboardRequest } from "./OpportunityBriefDetailDialog";

export type OpportunityBriefDashboardSnapshot = {
  summary: {
    total: number;
    newToday: number;
    companies: number;
    creators: number;
    awaitingResearch: number;
    linkedCandidates: number;
    unlinked: number;
    acknowledgementPending: number;
    acknowledgementFailed: number;
    sources: Record<string, number>;
  };
  requests: OpportunityBriefDashboardRequest[];
  page: number;
  pageSize: number;
  totalPages: number;
};

export type OpportunityBriefDashboardFilters = Partial<
  Record<"participantType" | "status" | "source" | "linked" | "from" | "to" | "page" | "pageSize", string>
>;

const filterKeys = ["participantType", "status", "source", "linked", "from", "to"] as const;
const canonicalFilterKeys = [...filterKeys, "page", "pageSize"] as const;
const statuses = [
  "submitted",
  "researching",
  "brief_ready",
  "contacted",
  "invited_to_join",
  "converted",
  "rejected",
] as const;
const acknowledgementStatuses = ["not_requested", "pending", "sent", "failed"] as const;
const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function label(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return `${String(timestamp.getUTCDate()).padStart(2, "0")} ${monthLabels[timestamp.getUTCMonth()]} ${timestamp.getUTCFullYear()}, ${String(timestamp.getUTCHours()).padStart(2, "0")}:${String(timestamp.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function pageHref(filters: OpportunityBriefDashboardFilters, page: number): string {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  if (filters.pageSize) query.set("pageSize", filters.pageSize);
  query.set("page", String(page));
  return `/admin/opportunity-briefs?${query.toString()}`;
}

function filterKey(filters: OpportunityBriefDashboardFilters): string {
  const query = new URLSearchParams();
  for (const key of canonicalFilterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return query.toString();
}

function snapshotHref(
  filters: OpportunityBriefDashboardFilters,
  page: number,
  pageSize: number,
): string {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));
  return `/api/admin/opportunity-briefs?${query.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function requestFromResponse(value: unknown): OpportunityBriefDashboardRequest | null {
  if (!isRecord(value) || !isRecord(value.utm)) return null;
  const rawUtm = value.utm;
  if (
    typeof value.id !== "string" ||
    (value.participantType !== "company" && value.participantType !== "creator") ||
    typeof value.profileUrl !== "string" ||
    !nullableString(value.email) ||
    !nullableString(value.phoneNumber) ||
    !nullableString(value.openToText) ||
    !nullableString(value.source) ||
    !nullableString(value.linkedCandidateId) ||
    typeof value.status !== "string" ||
    !statuses.includes(value.status as (typeof statuses)[number]) ||
    !nullableString(value.adminNotes) ||
    typeof value.acknowledgementStatus !== "string" ||
    !acknowledgementStatuses.includes(
      value.acknowledgementStatus as (typeof acknowledgementStatuses)[number],
    ) ||
    !nullableString(value.acknowledgementSentAt) ||
    !nullableString(value.acknowledgementError) ||
    typeof value.submissionCount !== "number" ||
    typeof value.lastSubmittedAt !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) return null;
  const utm = Object.fromEntries(
    ["source", "medium", "campaign", "term", "content"]
      .filter((key) => typeof rawUtm[key] === "string")
      .map((key) => [key, rawUtm[key] as string]),
  );
  return {
    id: value.id,
    participantType: value.participantType,
    profileUrl: value.profileUrl,
    email: value.email,
    phoneNumber: value.phoneNumber,
    openToText: value.openToText,
    source: value.source,
    utm,
    linkedCandidateId: value.linkedCandidateId,
    status: value.status as OpportunityBriefDashboardRequest["status"],
    adminNotes: value.adminNotes,
    acknowledgementStatus:
      value.acknowledgementStatus as OpportunityBriefDashboardRequest["acknowledgementStatus"],
    acknowledgementSentAt: value.acknowledgementSentAt,
    acknowledgementError: value.acknowledgementError,
    submissionCount: value.submissionCount,
    lastSubmittedAt: value.lastSubmittedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function finiteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function snapshotFromResponse(value: unknown): OpportunityBriefDashboardSnapshot | null {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.requests)) {
    return null;
  }
  const summary = value.summary;
  const numericSummaryKeys = [
    "total",
    "newToday",
    "companies",
    "creators",
    "awaitingResearch",
    "linkedCandidates",
    "unlinked",
    "acknowledgementPending",
    "acknowledgementFailed",
  ] as const;
  if (
    numericSummaryKeys.some((key) => !finiteInteger(summary[key])) ||
    !isRecord(summary.sources) ||
    !finiteInteger(value.page) ||
    value.page < 1 ||
    !finiteInteger(value.pageSize) ||
    value.pageSize < 1 ||
    !finiteInteger(value.totalPages)
  ) return null;
  const requests = value.requests.map(requestFromResponse);
  if (requests.some((request) => request === null)) return null;
  const sources = Object.fromEntries(
    Object.entries(summary.sources).filter((entry): entry is [string, number] =>
      finiteInteger(entry[1]),
    ),
  );
  return {
    summary: {
      total: summary.total as number,
      newToday: summary.newToday as number,
      companies: summary.companies as number,
      creators: summary.creators as number,
      awaitingResearch: summary.awaitingResearch as number,
      linkedCandidates: summary.linkedCandidates as number,
      unlinked: summary.unlinked as number,
      acknowledgementPending: summary.acknowledgementPending as number,
      acknowledgementFailed: summary.acknowledgementFailed as number,
      sources,
    },
    requests: requests as OpportunityBriefDashboardRequest[],
    page: value.page,
    pageSize: value.pageSize,
    totalPages: value.totalPages,
  };
}

function contact(request: OpportunityBriefDashboardRequest): string {
  return [request.email, request.phoneNumber].filter(Boolean).join(" · ") || "Not supplied";
}

function mutationKind(mutation: OpportunityBriefMutation) {
  if ("status" in mutation) return "status" as const;
  if ("notes" in mutation) return "notes" as const;
  if ("linkedCandidateId" in mutation) return "link" as const;
  return "unlink" as const;
}

const successMessages = {
  status: "Status saved.",
  notes: "Administrator notes saved.",
  link: "Discovery candidate linked.",
  unlink: "Discovery candidate unlinked.",
} as const;

export function OpportunityBriefDashboard({
  snapshot,
  filters,
}: {
  snapshot: OpportunityBriefDashboardSnapshot;
  filters: OpportunityBriefDashboardFilters;
}) {
  const canonicalFilters = filterKey(filters);
  const viewToken = canonicalFilters;
  const [snapshotState, setSnapshotState] = useState(() => ({
    source: snapshot,
    filters: canonicalFilters,
    value: snapshot,
  }));
  const currentSnapshot =
    snapshotState.source === snapshot && snapshotState.filters === canonicalFilters
      ? snapshotState.value
      : snapshot;
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const [selectedRequestVersion, setSelectedRequestVersion] =
    useState<{
      request: OpportunityBriefDashboardRequest;
      source: OpportunityBriefDashboardSnapshot;
    }>();
  const [pendingState, setPendingState] = useState<{
    action: "status" | "notes" | "link" | "unlink";
    requestId: string;
    view: string;
  }>();
  const [feedbackState, setFeedbackState] = useState<{
    feedback: Exclude<OpportunityBriefFeedback, null>;
    requestId: string;
    view: string;
  }>();
  const [globalFeedbackState, setGlobalFeedbackState] = useState<{
    feedback: Exclude<OpportunityBriefFeedback, null>;
    view: string;
  }>();
  const [conflictResetState, setConflictResetState] = useState<{
    reset: OpportunityBriefConflictEditReset;
    requestId: string;
    view: string;
  }>();
  const [mutationBusy, setMutationBusy] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const activeViewRef = useRef(viewToken);
  const latestSnapshotRef = useRef(snapshot);
  const latestFiltersRef = useRef(canonicalFilters);
  const snapshotRevisionRef = useRef(0);
  const operationSequenceRef = useRef(0);
  const dialogSessionRef = useRef(0);
  const mutationInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshControllerRef = useRef<AbortController | undefined>(undefined);
  const requests = currentSnapshot.requests;
  const selectedRequest =
    requests.find(({ id }) => id === selectedRequestId) ??
    (selectedRequestVersion &&
    selectedRequestVersion.request.id === selectedRequestId &&
    selectedRequestVersion.source === snapshot
      ? selectedRequestVersion.request
      : undefined);
  const pendingAction =
    pendingState && pendingState.requestId === selectedRequestId && pendingState.view === viewToken
      ? pendingState.action
      : null;
  const feedback =
    feedbackState && feedbackState.requestId === selectedRequestId && feedbackState.view === viewToken
      ? feedbackState.feedback
      : null;
  const conflictEditReset =
    conflictResetState &&
    conflictResetState.requestId === selectedRequestId &&
    conflictResetState.view === viewToken
      ? conflictResetState.reset
      : null;
  const globalFeedback =
    globalFeedbackState?.view === viewToken ? globalFeedbackState.feedback : null;
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "page" && Boolean(value));
  const metrics = [
    ["Total requests", currentSnapshot.summary.total],
    ["Submitted today", currentSnapshot.summary.newToday],
    ["Unlinked", currentSnapshot.summary.unlinked],
    ["Acknowledgement pending", currentSnapshot.summary.acknowledgementPending],
    ["Acknowledgement failed", currentSnapshot.summary.acknowledgementFailed],
  ] as const;
  const totalPages = Math.max(1, currentSnapshot.totalPages);
  const currentPage = Math.min(Math.max(1, currentSnapshot.page), totalPages);

  useLayoutEffect(() => {
    if (latestSnapshotRef.current !== snapshot) {
      snapshotRevisionRef.current += 1;
      refreshControllerRef.current?.abort();
      refreshControllerRef.current = undefined;
    }
    latestSnapshotRef.current = snapshot;
    latestFiltersRef.current = canonicalFilters;
  }, [snapshot, canonicalFilters]);

  useEffect(() => {
    activeViewRef.current = viewToken;
    dialogSessionRef.current += 1;
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = undefined;
  }, [viewToken]);

  useEffect(() => () => {
    mountedRef.current = false;
    refreshControllerRef.current?.abort();
  }, []);

  function abortRefresh() {
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = undefined;
  }

  function openRequest(requestId: string, trigger: HTMLButtonElement) {
    abortRefresh();
    dialogSessionRef.current += 1;
    returnFocusRef.current = trigger;
    setPendingState(undefined);
    setFeedbackState(undefined);
    setConflictResetState(undefined);
    const request = requests.find(({ id }) => id === requestId);
    setSelectedRequestVersion(request ? { request, source: snapshot } : undefined);
    setSelectedRequestId(requestId);
  }

  const closeRequest = useCallback(() => {
    dialogSessionRef.current += 1;
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = undefined;
    setSelectedRequestId(undefined);
    setSelectedRequestVersion(undefined);
    setPendingState(undefined);
    setFeedbackState(undefined);
    setConflictResetState(undefined);
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    queueMicrotask(() => trigger?.focus());
  }, []);

  function replaceRequest(
    next: OpportunityBriefDashboardRequest,
    updateDialog: boolean,
  ) {
    const source = latestSnapshotRef.current;
    const filtersKey = latestFiltersRef.current;
    setSnapshotState((current) => {
      const base =
        current.source === source && current.filters === filtersKey
          ? current.value
          : source;
      return {
        source,
        filters: filtersKey,
        value: {
          ...base,
          requests: base.requests.map((item) => (item.id === next.id ? next : item)),
        },
      };
    });
    if (updateDialog) setSelectedRequestVersion({ request: next, source });
  }

  async function mutate(mutation: OpportunityBriefMutation): Promise<boolean> {
    if (!selectedRequest || mutationInFlightRef.current) return false;
    abortRefresh();
    const kind = mutationKind(mutation);
    const operationId = operationSequenceRef.current + 1;
    operationSequenceRef.current = operationId;
    const operationView = viewToken;
    const requestId = selectedRequest.id;
    const dialogSession = dialogSessionRef.current;
    mutationInFlightRef.current = true;
    setMutationBusy(true);
    const isLatestMutation = () => operationSequenceRef.current === operationId;
    const isSameView = () =>
      mountedRef.current && activeViewRef.current === operationView;
    const isCurrentDialog = () =>
      isSameView() && dialogSessionRef.current === dialogSession;
    const showFeedback = (
      dialogFeedback: Exclude<OpportunityBriefFeedback, null>,
      globalMessage = dialogFeedback.message,
    ) => {
      if (isCurrentDialog()) {
        setFeedbackState({ requestId, view: operationView, feedback: dialogFeedback });
      } else if (mountedRef.current) {
        setGlobalFeedbackState({
          view: activeViewRef.current,
          feedback: { kind: "alert", message: globalMessage },
        });
      }
    };
    const finishPatch = () => {
      if (!isLatestMutation() || !mutationInFlightRef.current) return;
      mutationInFlightRef.current = false;
      if (mountedRef.current) setMutationBusy(false);
    };
    setPendingState({ action: kind, requestId, view: operationView });
    setFeedbackState(undefined);
    setGlobalFeedbackState(undefined);
    try {
      const response = await fetch(`/api/admin/opportunity-briefs/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: selectedRequest.updatedAt, ...mutation }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        request?: unknown;
      };
      finishPatch();
      const current = requestFromResponse(result.request);
      if (response.status === 409 && current) {
        if (isSameView()) {
          replaceRequest(current, isCurrentDialog());
          if (isCurrentDialog()) {
            setConflictResetState({
              requestId,
              view: operationView,
              reset: {
                token: operationId,
                status: current.status,
                notes: current.adminNotes ?? "",
                candidateId: current.linkedCandidateId ?? "",
              },
            });
          }
        }
        showFeedback(
          {
            kind: "alert",
            message: "This request changed elsewhere because another administrator changed it. Your local draft was discarded; review the latest values and try again.",
          },
          "This request changed elsewhere. Reload the queue before making another update.",
        );
        return false;
      }
      if (!response.ok) {
        showFeedback(
          {
            kind: "alert",
            message:
              typeof result.error === "string" && result.error.trim()
                ? result.error
                : "The Opportunity Brief request could not be saved.",
          },
          response.status === 409
            ? "The latest request data could not be verified. Reload the queue before retrying."
            : "The Opportunity Brief request could not be saved. Reload the queue before retrying.",
        );
        return false;
      }
      if (!current || current.id !== requestId) {
        showFeedback(
          {
            kind: "alert",
            message: "The Opportunity Brief response could not be verified.",
          },
          "The update response could not be verified. Reload the queue before retrying.",
        );
        return false;
      }
      if (!isSameView()) return true;
      replaceRequest(current, isCurrentDialog());
      if (isCurrentDialog()) {
        setFeedbackState({
          requestId,
          view: operationView,
          feedback: {
            kind: "status",
            message: "Update saved. Refreshing queue totals…",
          },
        });
      }

      refreshControllerRef.current?.abort();
      const refreshController = new AbortController();
      refreshControllerRef.current = refreshController;
      const refreshSnapshotRevision = snapshotRevisionRef.current;
      let refreshed: OpportunityBriefDashboardSnapshot | null = null;
      try {
        const refreshResponse = await fetch(
          snapshotHref(filters, currentPage, currentSnapshot.pageSize),
          {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: refreshController.signal,
          },
        );
        const refreshResult = (await refreshResponse.json().catch(() => ({}))) as {
          snapshot?: unknown;
        };
        if (refreshResponse.ok) {
          refreshed = snapshotFromResponse(refreshResult.snapshot);
        }
      } catch {
        refreshed = null;
      }
      const isCurrentRefresh = () =>
        isSameView() &&
        snapshotRevisionRef.current === refreshSnapshotRevision &&
        refreshControllerRef.current === refreshController;
      if (!isCurrentRefresh()) return true;
      refreshControllerRef.current = undefined;
      if (!refreshed) {
        showFeedback(
          {
            kind: "alert",
            message:
              "Update saved, but the queue summary could not be refreshed. Reload to see current totals.",
          },
          "Update saved, but the queue summary could not be refreshed. Reload the queue to reconcile totals.",
        );
        return true;
      }
      const source = latestSnapshotRef.current;
      const filtersKey = latestFiltersRef.current;
      setSnapshotState({ source, filters: filtersKey, value: refreshed });
      if (isCurrentDialog()) {
        setSelectedRequestVersion({
          request: refreshed.requests.find(({ id }) => id === current.id) ?? current,
          source,
        });
        setFeedbackState({
          requestId,
          view: operationView,
          feedback: { kind: "status", message: successMessages[kind] },
        });
      }
      return true;
    } catch {
      showFeedback(
        {
          kind: "alert",
          message: "The Opportunity Brief request could not be saved.",
        },
        "We could not confirm whether the update was saved. Reload the queue before retrying.",
      );
      return false;
    } finally {
      finishPatch();
      if (isLatestMutation()) {
        setPendingState(undefined);
      }
    }
  }

  return (
    <div className={styles.opportunityDashboard}>
      <dl className={styles.opportunitySummary} role="group" aria-label="Opportunity Brief summary">
        {metrics.map(([term, value]) => (
          <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      {globalFeedback ? (
        <div className={styles.error} role="alert">
          <span>{globalFeedback.message}</span>{" "}
          <Link href="/admin/opportunity-briefs">Reload queue</Link>
        </div>
      ) : null}

      <form key={canonicalFilters} className={styles.opportunityFilters} action="/admin/opportunity-briefs" method="get" role="search" aria-label="Filter Opportunity Brief requests">
        <label><span>Participant type</span><select name="participantType" defaultValue={filters.participantType ?? ""}><option value="">All types</option><option value="company">Company</option><option value="creator">Creator</option></select></label>
        <label><span>Request status</span><select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
        <label><span>Source</span><input name="source" defaultValue={filters.source ?? ""} maxLength={100} /></label>
        <label><span>Candidate link</span><select name="linked" defaultValue={filters.linked ?? ""}><option value="">All</option><option value="linked">Linked</option><option value="unlinked">Unlinked</option></select></label>
        <label><span>Submitted from</span><input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
        <label><span>Submitted through</span><input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        <input type="hidden" name="pageSize" value={filters.pageSize ?? String(currentSnapshot.pageSize)} />
        <div className={styles.opportunityFilterActions}>
          <button className={styles.button} type="submit">Apply filters</button>
          <Link className={styles.opportunityClearFilters} href="/admin/opportunity-briefs">Clear filters</Link>
        </div>
      </form>

      {requests.length === 0 ? (
        <p className={styles.emptyState}>{hasFilters ? "No requests match these filters." : "No Opportunity Brief requests have arrived yet."}</p>
      ) : (
        <>
          <div className={styles.opportunityTableWrap}>
            <table className={styles.opportunityTable} aria-label="Opportunity Brief requests">
              <thead><tr>{["Participant", "Profile", "Contact", "Open to", "Source", "Status", "Submissions", "Last submitted", "Linked", "Acknowledgement", "Actions"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>{label(request.participantType)}</td>
                    <th scope="row"><a href={request.profileUrl} rel="noreferrer" target="_blank">{request.profileUrl}</a></th>
                    <td>{contact(request)}</td>
                    <td>{request.openToText ?? "Not supplied"}</td>
                    <td>{request.source ?? "Not recorded"}</td>
                    <td><span className={styles.discoveryBadge} data-status={request.status}>{label(request.status)}</span></td>
                    <td>{request.submissionCount}</td>
                    <td>{formatTimestamp(request.lastSubmittedAt)}</td>
                    <td>{request.linkedCandidateId ? "Linked" : "Unlinked"}</td>
                    <td>{label(request.acknowledgementStatus)}</td>
                    <td><button className={styles.discoveryDetailButton} type="button" aria-label={`View ${request.participantType} Opportunity Brief details`} onClick={(event) => openRequest(request.id, event.currentTarget)}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.opportunityRecords}>
            {requests.map((request) => (
              <article className={styles.opportunityRecord} key={request.id} aria-label={`${label(request.participantType)} Opportunity Brief record`}>
                <div><strong>{label(request.participantType)}</strong><span className={styles.discoveryBadge} data-status={request.status}>{label(request.status)}</span></div>
                <a href={request.profileUrl} rel="noreferrer" target="_blank">{request.profileUrl}</a>
                <p>{contact(request)}</p>
                <p>{request.source ?? "No source"} · {request.submissionCount} {request.submissionCount === 1 ? "submission" : "submissions"}</p>
                <button className={styles.secondaryButton} type="button" aria-label={`View ${request.participantType} Opportunity Brief details on narrow screens`} onClick={(event) => openRequest(request.id, event.currentTarget)}>Details</button>
              </article>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 ? (
        <nav className={styles.opportunityPagination} aria-label="Opportunity Brief pages">
          {currentPage > 1 ? <Link href={pageHref(filters, currentPage - 1)}>Previous page</Link> : <span />}
          <span>Page {currentPage} of {totalPages}</span>
          {currentPage < totalPages ? <Link href={pageHref(filters, currentPage + 1)}>Next page</Link> : <span />}
        </nav>
      ) : null}

      {selectedRequest ? (
        <OpportunityBriefDetailDialog
          key={`${selectedRequest.id}:${conflictEditReset?.token ?? 0}`}
          request={selectedRequest}
          mutationBusy={mutationBusy}
          pendingAction={pendingAction}
          feedback={feedback}
          conflictEditReset={conflictEditReset}
          onMutate={mutate}
          onClose={closeRequest}
        />
      ) : null}
    </div>
  );
}
