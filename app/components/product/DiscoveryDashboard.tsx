"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  CandidateReviewActions,
  type CandidateReviewStatus,
  type CandidateReviewUpdate,
  type CandidateReviewUpdatedCandidate,
} from "./CandidateReviewActions";
import { DiscoveryResearchContext } from "./DiscoveryResearchContext";
import styles from "./product.module.css";

export type DiscoveryCandidateStatus = CandidateReviewStatus;
export type DiscoveryDashboardCandidate = CandidateReviewUpdatedCandidate;

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
  useEffect(() => {
    if (previousSnapshotRef.current === snapshot) return;
    previousSnapshotRef.current = snapshot;
    closeOpenDialog(drawerRef.current);
    setCandidates(snapshot.candidates.items);
    setSelectedCandidateId(undefined);
    returnFocusRef.current = null;
  }, [snapshot]);

  function openCandidate(candidateId: string, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    setSelectedCandidateId(candidateId);
  }

  function closeCandidate() {
    closeOpenDialog(drawerRef.current);
    setSelectedCandidateId(undefined);
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

  function handleCandidateUpdated(update: CandidateReviewUpdate) {
    if (update.candidate) replaceCandidate(update.candidate);
    setPendingOperation((current) => {
      if (update.pending) {
        return { kind: "candidate", candidateId: update.candidateId };
      }
      return current?.kind === "candidate" &&
        current.candidateId === update.candidateId
        ? undefined
        : current;
    });
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
            <DiscoveryResearchContext
              key={selectedCandidate.id}
              candidateId={selectedCandidate.id}
              candidateName={selectedCandidate.name}
            />
            <div className={styles.discoveryDrawerGroup}>
              <h3>Review status</h3>
              <CandidateReviewActions
                candidateId={selectedCandidate.id}
                candidateName={selectedCandidate.name}
                status={selectedCandidate.status}
                updatedAt={selectedCandidate.updatedAt}
                disabled={pendingOperation !== undefined}
                onUpdated={handleCandidateUpdated}
              />
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
