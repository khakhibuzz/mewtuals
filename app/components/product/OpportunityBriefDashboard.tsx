"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import {
  OpportunityBriefDetailDialog,
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
  Record<"participantType" | "status" | "source" | "from" | "to" | "page" | "pageSize", string>
>;

const filterKeys = ["participantType", "status", "source", "from", "to", "pageSize"] as const;
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
  query.set("page", String(page));
  return `/admin/opportunity-briefs?${query.toString()}`;
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
  const [requests, setRequests] = useState(snapshot.requests);
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"status" | "notes" | "link" | "unlink" | null>(null);
  const [feedback, setFeedback] = useState<OpportunityBriefFeedback>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const mutationInFlight = useRef(false);
  const selectedRequest = requests.find(({ id }) => id === selectedRequestId);
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "page" && Boolean(value));
  const metrics = [
    ["Total requests", snapshot.summary.total],
    ["Submitted today", snapshot.summary.newToday],
    ["Unlinked", snapshot.summary.unlinked],
    ["Acknowledgement pending", snapshot.summary.acknowledgementPending],
    ["Acknowledgement failed", snapshot.summary.acknowledgementFailed],
  ] as const;

  function openRequest(requestId: string, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    setFeedback(null);
    setSelectedRequestId(requestId);
  }

  const closeRequest = useCallback(() => {
    setSelectedRequestId(undefined);
    setFeedback(null);
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    queueMicrotask(() => trigger?.focus());
  }, []);

  function replaceRequest(next: OpportunityBriefDashboardRequest) {
    setRequests((current) => current.map((item) => (item.id === next.id ? next : item)));
  }

  async function mutate(mutation: OpportunityBriefMutation) {
    if (!selectedRequest || mutationInFlight.current) return;
    const kind = mutationKind(mutation);
    mutationInFlight.current = true;
    setPendingAction(kind);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/opportunity-briefs/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: selectedRequest.updatedAt, ...mutation }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        request?: unknown;
      };
      const current = requestFromResponse(result.request);
      if (response.status === 409 && current) {
        replaceRequest(current);
        setFeedback({
          kind: "alert",
          message: "This request changed elsewhere. The latest data has been loaded; review it and try again.",
        });
        return;
      }
      if (!response.ok) {
        setFeedback({
          kind: "alert",
          message:
            typeof result.error === "string" && result.error.trim()
              ? result.error
              : "The Opportunity Brief request could not be saved.",
        });
        return;
      }
      if (!current || current.id !== selectedRequest.id) {
        setFeedback({
          kind: "alert",
          message: "The Opportunity Brief response could not be verified.",
        });
        return;
      }
      replaceRequest(current);
      setFeedback({ kind: "status", message: successMessages[kind] });
    } catch {
      setFeedback({
        kind: "alert",
        message: "The Opportunity Brief request could not be saved.",
      });
    } finally {
      mutationInFlight.current = false;
      setPendingAction(null);
    }
  }

  return (
    <div className={styles.opportunityDashboard}>
      <dl className={styles.opportunitySummary} role="group" aria-label="Opportunity Brief summary">
        {metrics.map(([term, value]) => (
          <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <form className={styles.opportunityFilters} action="/admin/opportunity-briefs" method="get" role="search" aria-label="Filter Opportunity Brief requests">
        <label><span>Participant type</span><select name="participantType" defaultValue={filters.participantType ?? ""}><option value="">All types</option><option value="company">Company</option><option value="creator">Creator</option></select></label>
        <label><span>Request status</span><select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
        <label><span>Source</span><input name="source" defaultValue={filters.source ?? ""} maxLength={100} /></label>
        <label><span>Submitted from</span><input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
        <label><span>Submitted through</span><input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        <input type="hidden" name="pageSize" value={filters.pageSize ?? String(snapshot.pageSize)} />
        <div className={styles.opportunityFilterActions}>
          <button className={styles.button} type="submit">Apply filters</button>
          <Link href="/admin/opportunity-briefs">Clear filters</Link>
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

      {snapshot.totalPages > 1 ? (
        <nav className={styles.opportunityPagination} aria-label="Opportunity Brief pages">
          {snapshot.page > 1 ? <Link href={pageHref(filters, snapshot.page - 1)}>Previous page</Link> : <span />}
          <span>Page {snapshot.page} of {snapshot.totalPages}</span>
          {snapshot.page < snapshot.totalPages ? <Link href={pageHref(filters, snapshot.page + 1)}>Next page</Link> : <span />}
        </nav>
      ) : null}

      {selectedRequest ? (
        <OpportunityBriefDetailDialog
          key={`${selectedRequest.id}:${selectedRequest.updatedAt}`}
          request={selectedRequest}
          pendingAction={pendingAction}
          feedback={feedback}
          onMutate={mutate}
          onClose={closeRequest}
        />
      ) : null}
    </div>
  );
}
