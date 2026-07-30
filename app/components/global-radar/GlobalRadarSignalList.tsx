import Link from "next/link";

import { GlobalRadarMetrics } from "./GlobalRadarMetrics";
import type {
  GlobalRadarSignalListItem,
  GlobalRadarSignalListSnapshot,
} from "./types";
import styles from "./global-radar.module.css";

type SignalListProps = {
  action: string;
  canonicalListPath: string;
  filters: Readonly<Record<string, string>>;
  snapshot: GlobalRadarSignalListSnapshot;
};

function displayLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b(?:india|rfp)\b/gi, (match) => match.toUpperCase())
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function detailHref(item: GlobalRadarSignalListItem, canonicalListPath: string) {
  return `/admin/global-demand-radar/signals/${item.id}?returnTo=${encodeURIComponent(canonicalListPath)}`;
}

function paginationHref(canonicalListPath: string, page: number) {
  const url = new URL(canonicalListPath, "https://radar.invalid");
  if (page === 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

function SignalDetails({ item }: { item: GlobalRadarSignalListItem }) {
  return (
    <>
      <p className={styles.signalEntity}>
        {item.entity?.canonicalName ?? "Direction-level signal"}
      </p>
      <p>{item.factualSummary}</p>
      <dl className={styles.signalFacts}>
        <div><dt>Status</dt><dd>{displayLabel(item.status)}</dd></div>
        <div><dt>Score</dt><dd>{item.score ?? "Not scored"}</dd></div>
        <div><dt>Country</dt><dd>{item.sourceCountry}</dd></div>
        <div><dt>India relevance</dt><dd>{displayLabel(item.indiaRelevanceType)}</dd></div>
        <div><dt>Observed</dt><dd>{formatDate(item.observedAt)}</dd></div>
        <div><dt>Expiry or re-observation</dt><dd>{formatDate(item.expiresAt ?? item.reobserveBy)}</dd></div>
      </dl>
    </>
  );
}

function FilterFields({
  filters,
  classLabel,
}: {
  filters: Readonly<Record<string, string>>;
  classLabel: string;
}) {
  return (
    <>
      <label><span>Status</span><select defaultValue={filters.status ?? ""} name="status"><option value="">All statuses</option><option value="newly_discovered">Newly discovered</option><option value="needs_review">Needs review</option><option value="monitoring">Monitoring</option><option value="qualified">Qualified</option><option value="dismissed">Dismissed</option><option value="expired">Expired</option><option value="promoted">Promoted</option></select></label>
      <label><span>Country</span><input defaultValue={filters.country ?? ""} maxLength={200} name="country" /></label>
      <label><span>India relevance</span><input defaultValue={filters.indiaRelevance ?? ""} maxLength={200} name="indiaRelevance" /></label>
      <label><span>Demand domain</span><input defaultValue={filters.demandDomain ?? ""} maxLength={200} name="demandDomain" /></label>
      <label><span>Capability</span><input defaultValue={filters.capability ?? ""} maxLength={200} name="capability" /></label>
      <label><span>Observed from</span><input defaultValue={filters.observedFrom ?? ""} name="observedFrom" type="date" /></label>
      <label><span>Observed through</span><input defaultValue={filters.observedTo ?? ""} name="observedTo" type="date" /></label>
      {classLabel === "Direct Demand" ? <label><span>Expires before</span><input defaultValue={filters.expiresBefore ?? ""} name="expiresBefore" type="date" /></label> : null}
      {classLabel === "Demand Precursors" ? <label><span>Time horizon</span><select defaultValue={filters.horizon ?? ""} name="horizon"><option value="">All horizons</option><option value="within_30_days">Within 30 days</option><option value="days_31_to_90">31 to 90 days</option><option value="days_91_to_180">91 to 180 days</option><option value="days_181_to_365">181 to 365 days</option><option value="unknown">Unknown</option></select></label> : null}
      {classLabel === "Momentum" ? <label><span>Theme</span><input defaultValue={filters.theme ?? ""} maxLength={200} name="theme" /></label> : null}
    </>
  );
}

export function GlobalRadarSignalList({
  action,
  canonicalListPath,
  filters,
  snapshot,
}: SignalListProps) {
  const totalPages = Math.max(1, Math.ceil(snapshot.total / snapshot.pageSize));
  return (
    <div className={styles.listLayout}>
      <GlobalRadarMetrics label={snapshot.classLabel} metrics={snapshot.metrics} />
      <form
        action={action}
        aria-label={`Filter ${snapshot.classLabel} signals`}
        className={styles.filters}
        method="get"
        role="search"
      >
        <FilterFields classLabel={snapshot.classLabel} filters={filters} />
        <div className={styles.filterActions}>
          <button type="submit">Apply filters</button>
          <Link href={action}>Clear filters</Link>
        </div>
      </form>
      {snapshot.items.length === 0 ? (
        <p className={styles.emptyState}>
          {snapshot.hasAnySignals
            ? `No ${snapshot.classLabel} signals match these filters.`
            : `No ${snapshot.classLabel} signals have been recorded yet.`}
        </p>
      ) : (
        <>
          <div className={styles.tableFrame}>
            <table aria-label={`${snapshot.classLabel} signals`} className={styles.signalTable}>
              <thead><tr><th scope="col">Signal</th><th scope="col">Organisation</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Observed</th><th scope="col">Review</th></tr></thead>
              <tbody>
                {snapshot.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><span>{item.demandDomain}</span></td>
                    <td>{item.entity?.canonicalName ?? "Direction-level signal"}</td>
                    <td>{displayLabel(item.status)}</td>
                    <td>{item.score ?? "—"}</td>
                    <td><time dateTime={item.observedAt}>{formatDate(item.observedAt)}</time></td>
                    <td><Link href={detailHref(item, canonicalListPath)}>Review {item.title}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul aria-label={`${snapshot.classLabel} signal cards`} className={styles.signalCards}>
            {snapshot.items.map((item) => (
              <li className={styles.signalCard} key={item.id}>
                <h2>{item.title}</h2>
                <SignalDetails item={item} />
                <Link href={detailHref(item, canonicalListPath)}>Review {item.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {totalPages > 1 ? (
        <nav aria-label={`${snapshot.classLabel} pagination`} className={styles.pagination}>
          {snapshot.page > 1 ? <Link href={paginationHref(canonicalListPath, snapshot.page - 1)}>Previous page</Link> : <span />}
          <span>Page {snapshot.page} of {totalPages}</span>
          {snapshot.page < totalPages ? <Link href={paginationHref(canonicalListPath, snapshot.page + 1)}>Next page</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
