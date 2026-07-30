"use client";

import { applyBrowserFilterChanges, ecosystemWorkspaceHref, serializeBrowserFilters } from "./filter-state";
import { readableKey, taxonomyLabel } from "./labels";
import styles from "./ecosystem-intelligence.module.css";
import type {
  EcosystemFiltersDto,
  EcosystemLedgerRowDto,
  EcosystemSnapshotDto,
} from "./types";

type EcosystemCandidateLedgerProps = {
  ledger: EcosystemSnapshotDto["ledger"];
  filters: EcosystemFiltersDto;
  onOpenCandidate: (candidateId: string, trigger: HTMLButtonElement) => void;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

function filterHref(
  filters: EcosystemFiltersDto,
  changes: Partial<EcosystemFiltersDto>,
): string {
  const next = applyBrowserFilterChanges(filters, changes);
  return ecosystemWorkspaceHref(serializeBrowserFilters(next));
}

function primaryClassification(candidate: EcosystemLedgerRowDto, kind: "ecosystem_role" | "technical_layer") {
  return candidate.classifications.find((classification) => classification.kind === kind);
}

function PublicLinks({ candidate }: { candidate: EcosystemLedgerRowDto }) {
  const links = [
    candidate.websiteUrl ? { href: candidate.websiteUrl, label: `${candidate.name} website`, text: "Website" } : null,
    candidate.linkedinUrl ? { href: candidate.linkedinUrl, label: `${candidate.name} LinkedIn`, text: "LinkedIn" } : null,
    candidate.type === "creator" && candidate.primarySocialUrl
      ? { href: candidate.primarySocialUrl, label: `${candidate.name} primary social profile`, text: "Primary social" }
      : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);
  return links.length ? (
    <div className={styles.ledgerLinks}>
      {links.map((link) => (
        <a key={link.href} href={link.href} aria-label={link.label} target="_blank" rel="noreferrer">
          {link.text}
        </a>
      ))}
    </div>
  ) : <span>Unknown</span>;
}

function CandidateFacts({ candidate }: { candidate: EcosystemLedgerRowDto }) {
  const role = primaryClassification(candidate, "ecosystem_role");
  const layer = primaryClassification(candidate, "technical_layer");
  return (
    <>
      <span>{candidate.category}</span>
      <span>{role ? taxonomyLabel("ecosystem_role", role.termKey) : "Unknown role"}</span>
      <span>{layer ? taxonomyLabel("technical_layer", layer.termKey) : "Unknown layer"}</span>
    </>
  );
}

export function EcosystemCandidateLedger({
  ledger,
  filters,
  onOpenCandidate,
}: EcosystemCandidateLedgerProps) {
  const nameDirection = filters.sort === "name" && filters.direction === "asc" ? "desc" : "asc";
  const nameSortState = filters.sort === "name"
    ? filters.direction === "asc" ? "ascending" : "descending"
    : "none";
  return (
    <section className={styles.analysisSection} aria-labelledby="candidate-ledger-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Evidence ledger</p>
          <h2 id="candidate-ledger-heading" tabIndex={-1}>The companies behind this view</h2>
        </div>
        <p>{ledger.total} filtered organisations; page {ledger.page} of {Math.max(ledger.totalPages, 1)}.</p>
      </div>
      {ledger.items.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>No organisations match this ledger view.</strong>
          <p>Keep the active filters visible or reset the workspace to widen the sample.</p>
        </div>
      ) : (
        <>
          <div className={styles.ledgerTableWrap}>
            <table className={styles.ledgerTable} aria-label="Ecosystem candidate evidence ledger">
              <thead>
                <tr>
                  <th scope="col" aria-sort={nameSortState}>
                    <a
                      href={filterHref(filters, { sort: "name", direction: nameDirection, page: 1 })}
                      aria-label={`Sort candidates by name ${nameDirection === "asc" ? "ascending" : "descending"}`}
                    >
                      Candidate{filters.sort === "name" ? filters.direction === "asc" ? " ↑" : " ↓" : ""}
                    </a>
                  </th>
                  <th scope="col">Classification</th>
                  <th scope="col">Headquarters</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Public reachability</th>
                  <th scope="col">Last evidence</th>
                  <th scope="col">Review</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((candidate) => (
                  <tr key={candidate.id}>
                    <th scope="row">
                      <strong>{candidate.name}</strong>
                      <span>{readableKey(candidate.type)}</span>
                    </th>
                    <td className={styles.ledgerFacts}><CandidateFacts candidate={candidate} /></td>
                    <td>{candidate.headquarters ? `${candidate.headquarters.cityLabel}, ${candidate.headquarters.stateLabel}` : "Location not yet resolved"}</td>
                    <td>
                      <strong>{candidate.evidenceCoverage.score} / 100</strong>
                      <span>{readableKey(candidate.evidenceFreshness)}</span>
                    </td>
                    <td><PublicLinks candidate={candidate} /></td>
                    <td>
                      {candidate.latestSourceUrl ? (
                        <a href={candidate.latestSourceUrl} aria-label={`Latest public evidence for ${candidate.name}`} target="_blank" rel="noreferrer">
                          {candidate.latestSourceAt ? DATE_FORMATTER.format(new Date(candidate.latestSourceAt)) : "Public source"}
                        </a>
                      ) : candidate.latestResearchAt
                        ? `Research ${DATE_FORMATTER.format(new Date(candidate.latestResearchAt))}`
                        : "Unknown"}
                    </td>
                    <td>{readableKey(candidate.status)}</td>
                    <td>
                      <button
                        type="button"
                        data-ecosystem-candidate-id={candidate.id}
                        onClick={(event) => onOpenCandidate(candidate.id, event.currentTarget)}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.ledgerRecords}>
            {ledger.items.map((candidate) => (
              <article key={candidate.id} aria-label={`${candidate.name} ecosystem record`}>
                <div className={styles.ledgerRecordHeading}>
                  <div><h3>{candidate.name}</h3><p>{candidate.category}</p></div>
                  <span>{candidate.evidenceCoverage.score} / 100</span>
                </div>
                <dl>
                  <div><dt>Headquarters</dt><dd>{candidate.headquarters ? `${candidate.headquarters.cityLabel}, ${candidate.headquarters.stateLabel}` : "Location not yet resolved"}</dd></div>
                  <div><dt>Role and layer</dt><dd className={styles.ledgerFacts}><CandidateFacts candidate={candidate} /></dd></div>
                  <div><dt>Evidence freshness</dt><dd>{readableKey(candidate.evidenceFreshness)}</dd></div>
                  <div><dt>Review</dt><dd>{readableKey(candidate.status)}</dd></div>
                </dl>
                <PublicLinks candidate={candidate} />
                {candidate.latestSourceUrl ? <a href={candidate.latestSourceUrl} target="_blank" rel="noreferrer">Latest public evidence</a> : null}
                <button
                  type="button"
                  data-ecosystem-candidate-id={candidate.id}
                  onClick={(event) => onOpenCandidate(candidate.id, event.currentTarget)}
                >
                  View details
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {ledger.totalPages > 1 ? (
        <nav className={styles.ledgerPagination} aria-label="Ecosystem candidate pages">
          {ledger.page > 1 ? <a href={filterHref(filters, { page: ledger.page - 1 })}>Previous page</a> : <span />}
          <span>Page {ledger.page} of {ledger.totalPages}</span>
          {ledger.page < ledger.totalPages ? <a href={filterHref(filters, { page: ledger.page + 1 })}>Next page</a> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
