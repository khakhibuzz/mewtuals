"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "./product.module.css";

export type DiscoveryCandidateStatus =
  | "discovered"
  | "shortlisted"
  | "rejected"
  | "queued_for_profile";

export type DiscoveryDashboardCandidate = {
  id: string;
  type: "company" | "creator";
  name: string;
  canonicalUrl: string;
  websiteUrl: string | null;
  primarySocialUrl: string | null;
  linkedinUrl: string | null;
  discoveredDescription: string;
  category: string;
  subcategory: string | null;
  geography: string;
  firstSourceName: string;
  firstSourceUrl: string;
  discoveredAt: string;
  lastSeenAt: string;
  updatedAt: string;
  discoveryScore: number;
  status: DiscoveryCandidateStatus;
};

export type DiscoveryDashboardRun = {
  id: string;
  trigger: "scheduled" | "manual" | "trial";
  status: "queued" | "running" | "succeeded" | "partial" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  geography: string;
  candidateType: "company" | "creator" | "both";
  sourcesUsed: string[];
  requestedCount: number;
  foundCount: number;
  newCount: number;
  duplicateCount: number;
  notice: string | null;
};

export type DiscoveryDashboardEvidence = {
  id: string;
  candidateId: string;
  sourceName: string;
  sourceUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type DiscoveryDashboardSnapshot = {
  summary: {
    totalCompanies: number;
    totalCreators: number;
    discoveredToday: number;
    latestRunStatus: DiscoveryDashboardRun["status"] | null;
    latestRunCompletedAt: string | null;
    latestRunDuplicateCount: number;
  };
  candidates: {
    items: DiscoveryDashboardCandidate[];
    total: number;
    page: number;
    pageSize: number;
  };
  runs: DiscoveryDashboardRun[];
  evidence: DiscoveryDashboardEvidence[];
};

export type DiscoveryDashboardFilters = Partial<
  Record<
    | "type"
    | "geography"
    | "category"
    | "source"
    | "status"
    | "discoveredFrom"
    | "discoveredTo"
    | "page",
    string
  >
>;

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

function formatTimestamp(value: string | null): string {
  if (!value) return "Not completed";
  const timestamp = new Date(value);
  const day = String(timestamp.getUTCDate()).padStart(2, "0");
  const month = monthLabels[timestamp.getUTCMonth()];
  const year = timestamp.getUTCFullYear();
  const hours = String(timestamp.getUTCHours()).padStart(2, "0");
  const minutes = String(timestamp.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

function label(value: string | null): string {
  if (!value) return "No runs yet";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const filterKeys = [
  "type",
  "geography",
  "category",
  "source",
  "status",
  "discoveredFrom",
  "discoveredTo",
] as const;

function pageHref(filters: DiscoveryDashboardFilters, page: number): string {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  query.set("page", String(page));
  return `/admin/discovery?${query.toString()}`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function candidateFromResponse(value: unknown): DiscoveryDashboardCandidate | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const status = value.status;
  if (
    (type !== "company" && type !== "creator") ||
    typeof status !== "string" ||
    !["discovered", "shortlisted", "rejected", "queued_for_profile"].includes(
      status,
    ) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.canonicalUrl !== "string" ||
    !nullableString(value.websiteUrl) ||
    !nullableString(value.primarySocialUrl) ||
    !nullableString(value.linkedinUrl) ||
    typeof value.discoveredDescription !== "string" ||
    typeof value.category !== "string" ||
    !nullableString(value.subcategory) ||
    typeof value.geography !== "string" ||
    typeof value.firstSourceName !== "string" ||
    typeof value.firstSourceUrl !== "string" ||
    typeof value.discoveredAt !== "string" ||
    typeof value.lastSeenAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.discoveryScore !== "number" ||
    !Number.isInteger(value.discoveryScore) ||
    value.discoveryScore < 0 ||
    value.discoveryScore > 100
  ) {
    return null;
  }
  return {
    id: value.id,
    type,
    name: value.name,
    canonicalUrl: value.canonicalUrl,
    websiteUrl: value.websiteUrl,
    primarySocialUrl: value.primarySocialUrl,
    linkedinUrl: value.linkedinUrl,
    discoveredDescription: value.discoveredDescription,
    category: value.category,
    subcategory: value.subcategory,
    geography: value.geography,
    firstSourceName: value.firstSourceName,
    firstSourceUrl: value.firstSourceUrl,
    discoveredAt: value.discoveredAt,
    lastSeenAt: value.lastSeenAt,
    updatedAt: value.updatedAt,
    discoveryScore: value.discoveryScore,
    status: status as DiscoveryCandidateStatus,
  };
}

function CandidateLinks({ candidate }: { candidate: DiscoveryDashboardCandidate }) {
  const proposedLinks = [
    {
      href: candidate.canonicalUrl,
      label: `${candidate.name} canonical profile`,
      text: "Canonical profile",
    },
    candidate.websiteUrl
      ? { href: candidate.websiteUrl, label: `${candidate.name} website`, text: "Website" }
      : null,
    candidate.primarySocialUrl
      ? {
          href: candidate.primarySocialUrl,
          label: `${candidate.name} social profile`,
          text: "Social",
        }
      : null,
    candidate.linkedinUrl
      ? {
          href: candidate.linkedinUrl,
          label: `${candidate.name} LinkedIn`,
          text: "LinkedIn",
        }
      : null,
    {
      href: candidate.firstSourceUrl,
      label: `${candidate.name} source`,
      text: "Source",
    },
  ].filter((link): link is NonNullable<typeof link> => link !== null);
  const seenHrefs = new Set<string>();
  const links = proposedLinks.filter(({ href }) => {
    if (seenHrefs.has(href)) return false;
    seenHrefs.add(href);
    return true;
  });
  return (
    <div className={styles.discoveryLinks}>
      {links.map((link) => (
        <a
          href={link.href}
          key={`${link.label}:${link.href}`}
          aria-label={link.label}
          rel="noreferrer"
          target="_blank"
        >
          {link.text}
        </a>
      ))}
    </div>
  );
}

function closeOpenDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog?.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function MutationFeedback({
  feedback,
}: {
  feedback: MutationFeedbackState;
}) {
  return (
    <p
      className={feedback.kind === "alert" ? styles.error : styles.status}
      role={feedback.kind}
    >
      {feedback.message}
    </p>
  );
}

type MutationFeedbackState = {
  kind: "status" | "alert";
  message: string;
};

type PendingOperation =
  | { kind: "queue" }
  | { kind: "candidate"; candidateId: string };

type CandidateFeedback = MutationFeedbackState & { candidateId: string };

function responseError(error: unknown, fallback: string): string {
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function DiscoveryDashboard({
  snapshot,
  filters,
}: {
  snapshot: DiscoveryDashboardSnapshot;
  filters: DiscoveryDashboardFilters;
}) {
  const [candidates, setCandidates] = useState(snapshot.candidates.items);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>();
  const [pendingOperation, setPendingOperation] =
    useState<PendingOperation>();
  const [queueFeedback, setQueueFeedback] =
    useState<MutationFeedbackState>();
  const [candidateFeedback, setCandidateFeedback] =
    useState<CandidateFeedback>();
  const mutationInFlight = useRef(false);
  const previousSnapshotRef = useRef(snapshot);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const closeDrawerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDialogElement | null>(null);
  const summary = [
    ["Companies", String(snapshot.summary.totalCompanies)],
    ["Creators", String(snapshot.summary.totalCreators)],
    ["Discovered today", String(snapshot.summary.discoveredToday)],
    ["Latest run", label(snapshot.summary.latestRunStatus)],
    [
      "Latest completion",
      formatTimestamp(snapshot.summary.latestRunCompletedAt),
    ],
    ["Duplicates skipped", String(snapshot.summary.latestRunDuplicateCount)],
  ] as const;
  const hasCandidateFilters = Object.entries(filters).some(
    ([key, value]) => key !== "page" && Boolean(value),
  );
  const selectedCandidate = candidates.find(
    ({ id }) => id === selectedCandidateId,
  );
  const selectedEvidence = snapshot.evidence.filter(
    ({ candidateId }) => candidateId === selectedCandidateId,
  );
  const selectedCandidateFeedback =
    candidateFeedback?.candidateId === selectedCandidateId
      ? candidateFeedback
      : undefined;

  useEffect(() => {
    if (previousSnapshotRef.current === snapshot) return;
    previousSnapshotRef.current = snapshot;
    closeOpenDialog(drawerRef.current);
    setCandidates(snapshot.candidates.items);
    setSelectedCandidateId(undefined);
    returnFocusRef.current = null;
    setCandidateFeedback(undefined);
  }, [snapshot]);

  function openCandidate(candidateId: string, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    setCandidateFeedback(undefined);
    setSelectedCandidateId(candidateId);
  }

  function closeCandidate() {
    closeOpenDialog(drawerRef.current);
    setSelectedCandidateId(undefined);
    setCandidateFeedback(undefined);
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    returnFocus?.focus();
  }

  async function queueDiscovery() {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setPendingOperation({ kind: "queue" });
    setQueueFeedback(undefined);
    try {
      const response = await fetch("/api/admin/discovery/runs", {
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
      };
      if (!response.ok) {
        setQueueFeedback({
          kind: "alert",
          message: responseError(
            result.error,
            "The discovery run could not be queued.",
          ),
        });
        return;
      }
      setQueueFeedback({
        kind: "status",
        message: "Discovery run queued. Waiting for the Codex worker.",
      });
    } catch {
      setQueueFeedback({
        kind: "alert",
        message: "The discovery run could not be queued.",
      });
    } finally {
      mutationInFlight.current = false;
      setPendingOperation(undefined);
    }
  }

  function replaceCandidate(candidate: DiscoveryDashboardCandidate) {
    setCandidates((current) =>
      current.map((item) => (item.id === candidate.id ? candidate : item)),
    );
  }

  async function updateCandidateStatus(
    candidate: DiscoveryDashboardCandidate,
    status: DiscoveryCandidateStatus,
  ) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setPendingOperation({ kind: "candidate", candidateId: candidate.id });
    setCandidateFeedback(undefined);
    try {
      const response = await fetch(
        `/api/admin/discovery/candidates/${candidate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            expectedUpdatedAt: candidate.updatedAt,
          }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        candidate?: unknown;
      };
      const latest = candidateFromResponse(result.candidate);
      if (response.status === 409 && latest) {
        replaceCandidate(latest);
        setCandidateFeedback({
          candidateId: candidate.id,
          kind: "alert",
          message: `${candidate.name} changed elsewhere. Latest status is ${label(latest.status).toLowerCase()}. Review and try again.`,
        });
        return;
      }
      if (!response.ok) {
        setCandidateFeedback({
          candidateId: candidate.id,
          kind: "alert",
          message: responseError(
            result.error,
            "The candidate status could not be saved.",
          ),
        });
        return;
      }
      if (!latest || latest.id !== candidate.id) {
        setCandidateFeedback({
          candidateId: candidate.id,
          kind: "alert",
          message: "The candidate status response could not be verified.",
        });
        return;
      }
      replaceCandidate(latest);
      setCandidateFeedback({
        candidateId: candidate.id,
        kind: "status",
        message: `${latest.name} is now ${label(latest.status).toLowerCase()}.`,
      });
    } catch {
      setCandidateFeedback({
        candidateId: candidate.id,
        kind: "alert",
        message: "The candidate status could not be saved.",
      });
    } finally {
      mutationInFlight.current = false;
      setPendingOperation(undefined);
    }
  }

  useEffect(() => {
    if (!selectedCandidateId) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    if (drawer && !drawer.open) {
      if (typeof drawer.showModal === "function") {
        drawer.showModal();
      } else {
        drawer.setAttribute("open", "");
      }
    }
    closeDrawerRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCandidate();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = priorOverflow;
      closeOpenDialog(drawer);
    };
  }, [selectedCandidateId]);

  return (
    <div className={styles.discoveryDashboard}>
      <dl className={styles.discoverySummary} aria-label="Discovery summary">
        {summary.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section className={styles.discoverySection} aria-labelledby="discovery-candidates-title">
        <div className={styles.sectionHeadingRow}>
          <div>
            <p className={styles.statusMarker}>Candidate review</p>
            <h2 className={styles.sectionTitle} id="discovery-candidates-title">
              Candidates
            </h2>
          </div>
        </div>
        <form
          className={styles.discoveryFilters}
          action="/admin/discovery"
          method="get"
          role="search"
          aria-label="Filter discovery candidates"
        >
          <label className={styles.discoveryFilterField}>
            <span>Candidate type</span>
            <select name="type" defaultValue={filters.type ?? ""}>
              <option value="">All types</option>
              <option value="company">Company</option>
              <option value="creator">Creator</option>
            </select>
          </label>
          <label className={styles.discoveryFilterField}>
            <span>Geography</span>
            <input name="geography" defaultValue={filters.geography ?? ""} />
          </label>
          <label className={styles.discoveryFilterField}>
            <span>Category</span>
            <input name="category" defaultValue={filters.category ?? ""} />
          </label>
          <label className={styles.discoveryFilterField}>
            <span>Source</span>
            <input name="source" defaultValue={filters.source ?? ""} />
          </label>
          <label className={styles.discoveryFilterField}>
            <span>Candidate status</span>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">All statuses</option>
              <option value="discovered">Discovered</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
              <option value="queued_for_profile">Queued for profile</option>
            </select>
          </label>
          <label className={styles.discoveryFilterField}>
            <span>Discovered from</span>
            <input
              name="discoveredFrom"
              type="date"
              defaultValue={filters.discoveredFrom ?? ""}
            />
          </label>
          <label className={styles.discoveryFilterField}>
            <span>Discovered before</span>
            <input
              name="discoveredTo"
              type="date"
              defaultValue={filters.discoveredTo ?? ""}
            />
          </label>
          <div className={styles.discoveryFilterActions}>
            <button className={styles.button} type="submit">
              Apply filters
            </button>
            <Link className={styles.discoveryTextLink} href="/admin/discovery">
              Clear filters
            </Link>
          </div>
        </form>
        {candidates.length === 0 ? (
          <p className={styles.emptyState}>
            {hasCandidateFilters
              ? "No candidates match these filters."
              : "No candidates have been discovered yet."}
          </p>
        ) : (
          <>
            <div className={styles.discoveryTableWrap}>
              <table className={styles.discoveryTable} aria-label="Discovered candidates">
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Type",
                      "Category",
                      "Geography",
                      "Source",
                      "Discovered",
                      "Confidence",
                      "Status",
                      "Links",
                      "Actions",
                    ].map((heading) => (
                      <th key={heading} scope="col">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.id}>
                      <th scope="row">{candidate.name}</th>
                      <td>{label(candidate.type)}</td>
                      <td>{candidate.category}</td>
                      <td>{candidate.geography}</td>
                      <td>{candidate.firstSourceName}</td>
                      <td>{formatTimestamp(candidate.discoveredAt)}</td>
                      <td>{candidate.discoveryScore} / 100</td>
                      <td>
                        <span className={styles.discoveryBadge} data-status={candidate.status}>
                          {label(candidate.status)}
                        </span>
                      </td>
                      <td>
                        <CandidateLinks candidate={candidate} />
                      </td>
                      <td>
                        <button
                          className={styles.discoveryDetailButton}
                          type="button"
                          aria-label={`View ${candidate.name} details`}
                          onClick={(event) => openCandidate(candidate.id, event.currentTarget)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.discoveryRecords}>
              {candidates.map((candidate) => (
                <article
                  className={styles.discoveryRecord}
                  key={candidate.id}
                  aria-label={`${candidate.name} candidate record`}
                >
                  <div className={styles.discoveryRecordHeading}>
                    <h3>{candidate.name}</h3>
                    <span className={styles.discoveryBadge} data-status={candidate.status}>
                      {label(candidate.status)}
                    </span>
                  </div>
                  <dl>
                    <div><dt>Type</dt><dd>{label(candidate.type)}</dd></div>
                    <div><dt>Category</dt><dd>{candidate.category}</dd></div>
                    <div><dt>Geography</dt><dd>{candidate.geography}</dd></div>
                    <div><dt>Source</dt><dd>{candidate.firstSourceName}</dd></div>
                    <div><dt>Discovered</dt><dd>{formatTimestamp(candidate.discoveredAt)}</dd></div>
                    <div><dt>Confidence</dt><dd>{candidate.discoveryScore} / 100</dd></div>
                    <div><dt>Status</dt><dd>{label(candidate.status)}</dd></div>
                  </dl>
                  <CandidateLinks candidate={candidate} />
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    aria-label={`View ${candidate.name} details on narrow screens`}
                    onClick={(event) => openCandidate(candidate.id, event.currentTarget)}
                  >
                    Details
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
        {snapshot.candidates.total > snapshot.candidates.pageSize ? (
          <nav className={styles.discoveryPagination} aria-label="Candidate pages">
            {snapshot.candidates.page > 1 ? (
              <Link href={pageHref(filters, snapshot.candidates.page - 1)}>
                Previous page
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {snapshot.candidates.page} of{" "}
              {Math.ceil(snapshot.candidates.total / snapshot.candidates.pageSize)}
            </span>
            {snapshot.candidates.page <
            Math.ceil(snapshot.candidates.total / snapshot.candidates.pageSize) ? (
              <Link href={pageHref(filters, snapshot.candidates.page + 1)}>
                Next page
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
      {selectedCandidate ? (
        <div className={styles.discoveryDrawerBackdrop}>
          <dialog
            className={styles.discoveryDrawer}
            aria-labelledby="discovery-drawer-title"
            ref={drawerRef}
            onCancel={(event) => {
              event.preventDefault();
              closeCandidate();
            }}
          >
            <div className={styles.discoveryDrawerHeader}>
              <div>
                <p className={styles.statusMarker}>Candidate evidence</p>
                <h2 id="discovery-drawer-title">{selectedCandidate.name}</h2>
              </div>
              <button
                className={styles.discoveryDetailButton}
                type="button"
                aria-label={`Close ${selectedCandidate.name} details`}
                onClick={closeCandidate}
                ref={closeDrawerRef}
              >
                Close
              </button>
            </div>
            <p className={styles.discoveryDescription}>
              {selectedCandidate.discoveredDescription}
            </p>
            <dl className={styles.discoveryDrawerDetails}>
              <div><dt>Type</dt><dd>{label(selectedCandidate.type)}</dd></div>
              <div><dt>Category</dt><dd>{selectedCandidate.category}</dd></div>
              <div><dt>Subcategory</dt><dd>{selectedCandidate.subcategory ?? "Not supplied"}</dd></div>
              <div><dt>Geography</dt><dd>{selectedCandidate.geography}</dd></div>
              <div><dt>Confidence</dt><dd>{selectedCandidate.discoveryScore} / 100</dd></div>
              <div><dt>Status</dt><dd>{label(selectedCandidate.status)}</dd></div>
              <div><dt>Discovered</dt><dd>{formatTimestamp(selectedCandidate.discoveredAt)}</dd></div>
              <div><dt>Last seen</dt><dd>{formatTimestamp(selectedCandidate.lastSeenAt)}</dd></div>
            </dl>
            <label className={styles.field}>
              <span className={styles.label}>Candidate UUID</span>
              <input
                readOnly
                value={selectedCandidate.id}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <div className={styles.discoveryDrawerGroup}>
              <h3>Public profiles</h3>
              <CandidateLinks candidate={selectedCandidate} />
            </div>
            <div className={styles.discoveryDrawerGroup}>
              <h3>Evidence</h3>
              {selectedEvidence.length > 0 ? (
                <ul className={styles.discoveryEvidenceList}>
                  {selectedEvidence.map((source) => (
                    <li key={source.id}>
                      <a
                        href={source.sourceUrl}
                        aria-label={`${source.sourceName} evidence`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.sourceName}
                      </a>
                      <span>Last seen {formatTimestamp(source.lastSeenAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.status}>No additional evidence was recorded.</p>
              )}
            </div>
            <div className={styles.discoveryDrawerGroup}>
              <h3>Review status</h3>
              {selectedCandidateFeedback ? (
                <MutationFeedback feedback={selectedCandidateFeedback} />
              ) : null}
              <div className={styles.discoveryStatusActions}>
                {[
                  { status: "shortlisted" as const, text: "Shortlist", label: `Shortlist ${selectedCandidate.name}` },
                  { status: "rejected" as const, text: "Reject", label: `Reject ${selectedCandidate.name}` },
                  {
                    status: "queued_for_profile" as const,
                    text: "Queue for profile",
                    label: `Queue ${selectedCandidate.name} for profile`,
                  },
                ].map((action) => (
                  <button
                    className={
                      action.status === "shortlisted"
                        ? styles.button
                        : styles.secondaryButton
                    }
                    type="button"
                    key={action.status}
                    aria-label={action.label}
                    disabled={
                      pendingOperation !== undefined ||
                      selectedCandidate.status === action.status
                    }
                    onClick={() => updateCandidateStatus(selectedCandidate, action.status)}
                  >
                    {action.text}
                  </button>
                ))}
              </div>
            </div>
          </dialog>
        </div>
      ) : null}
      <section className={styles.discoverySection} aria-labelledby="discovery-runs-title">
        <div className={styles.sectionHeadingRow}>
          <div>
            <p className={styles.statusMarker}>Worker operations</p>
            <h2 className={styles.sectionTitle} id="discovery-runs-title">
              Recent runs
            </h2>
          </div>
          <button
            className={styles.button}
            type="button"
            disabled={pendingOperation !== undefined}
            onClick={queueDiscovery}
          >
            {pendingOperation?.kind === "queue"
              ? "Queuing Discovery…"
              : "Run Discovery"}
          </button>
        </div>
        {queueFeedback ? <MutationFeedback feedback={queueFeedback} /> : null}
        {snapshot.runs.length === 0 ? (
          <p className={styles.status}>No discovery runs have been queued yet.</p>
        ) : (
          <ol className={styles.discoveryRunList} aria-label="Recent discovery runs">
            {snapshot.runs.map((run) => (
              <li key={run.id}>
                <div className={styles.discoveryRunHeading}>
                  <p>{label(run.trigger)}</p>
                  <span className={styles.discoveryBadge} data-status={run.status}>
                    {label(run.status)}
                  </span>
                </div>
                <p className={styles.discoveryRunMeta}>
                  {run.status === "queued"
                    ? "Waiting for the Codex worker"
                    : [
                        `${run.foundCount} found`,
                        `${run.newCount} new`,
                        countLabel(run.duplicateCount, "duplicate"),
                      ].join(" · ")}
                </p>
                <p className={styles.discoveryRunTime}>
                  {run.completedAt
                    ? `Completed ${formatTimestamp(run.completedAt)}`
                    : `Queued ${formatTimestamp(run.createdAt)}`}
                </p>
                {run.notice ? <p className={styles.discoveryRunNotice}>{run.notice}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
