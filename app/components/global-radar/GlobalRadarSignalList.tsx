"use client";

import Link from "next/link";
import { useState } from "react";

import {
  globalRadarDemandFamilies,
  globalRadarLeafIdentifiers,
  globalRadarThemes,
  indiaRelevanceTypes,
  signalStatuses,
} from "../../domain/global-radar";
import { GlobalRadarMetrics } from "./GlobalRadarMetrics";
import type {
  GlobalRadarClassSummary,
  GlobalRadarSignalClass,
  GlobalRadarSignalListItem,
} from "./types";
import styles from "./global-radar.module.css";

type SignalListProps = {
  action: string;
  canonicalListPath: string;
  filters: Readonly<Record<string, string>>;
  signalClass: GlobalRadarSignalClass;
  snapshot: GlobalRadarClassSummary;
};

const classLabels: Record<GlobalRadarSignalClass, string> = {
  direct_demand: "Direct Demand",
  demand_precursor: "Demand Precursors",
  ecosystem_momentum: "Momentum",
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
    timeZone: "Asia/Kolkata",
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
        {item.organisation?.canonicalName ?? "Direction-level signal"}
      </p>
      <p>{item.factualSummary}</p>
      <dl className={styles.signalFacts}>
        <div><dt>Theme</dt><dd>{displayLabel(item.theme)}</dd></div>
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

type FilterValues = Record<string, string>;

function FilterFields({
  values,
  setValue,
  signalClass,
}: {
  values: FilterValues;
  setValue(key: string, value: string): void;
  signalClass: GlobalRadarSignalClass;
}) {
  const field = (key: string) => ({
    name: values[key] ? key : undefined,
    value: values[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValue(key, event.target.value),
  });
  return (
    <>
      <label>
        <span>Status</span>
        <select {...field("status")}>
          <option value="">All statuses</option>
          {signalStatuses.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}
        </select>
      </label>
      <label><span>Country</span><input {...field("country")} maxLength={200} /></label>
      <label>
        <span>India relevance</span>
        <select {...field("indiaRelevance")}>
          <option value="">All relevance types</option>
          {indiaRelevanceTypes.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}
        </select>
      </label>
      <label>
        <span>Demand domain</span>
        <select {...field("demandDomain")}>
          <option value="">All demand domains</option>
          {globalRadarDemandFamilies.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}
        </select>
      </label>
      <label>
        <span>Capability</span>
        <input {...field("capability")} list="global-radar-capabilities" maxLength={200} />
        <datalist id="global-radar-capabilities">
          {globalRadarLeafIdentifiers.map((value) => <option key={value} value={value} />)}
        </datalist>
      </label>
      <label><span>Observed from</span><input {...field("observedFrom")} type="date" /></label>
      <label><span>Observed through</span><input {...field("observedTo")} type="date" /></label>
      {signalClass === "direct_demand" ? (
        <label><span>Expires before</span><input {...field("expiresBefore")} type="date" /></label>
      ) : null}
      {signalClass === "demand_precursor" ? (
        <label>
          <span>Time horizon</span>
          <select {...field("horizon")}>
            <option value="">All horizons</option>
            <option value="within_30_days">Within 30 days</option>
            <option value="days_31_to_90">31 to 90 days</option>
            <option value="days_91_to_180">91 to 180 days</option>
            <option value="days_181_to_365">181 to 365 days</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      ) : null}
      {signalClass === "ecosystem_momentum" ? (
        <label>
          <span>Theme</span>
          <select {...field("theme")}>
            <option value="">All themes</option>
            {globalRadarThemes.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}
          </select>
        </label>
      ) : null}
    </>
  );
}

export function GlobalRadarSignalList({
  action,
  canonicalListPath,
  filters,
  signalClass,
  snapshot,
}: SignalListProps) {
  const [filterValues, setFilterValues] = useState<FilterValues>({ ...filters });
  const classLabel = classLabels[signalClass];
  const totalPages = Math.max(1, Math.ceil(snapshot.total / snapshot.pageSize));
  return (
    <div className={styles.listLayout}>
      <GlobalRadarMetrics signalClass={signalClass} metrics={snapshot.metrics} />
      <form
        action={action}
        aria-label={`Filter ${classLabel} signals`}
        className={styles.filters}
        method="get"
        role="search"
      >
        <FilterFields
          setValue={(key, value) => setFilterValues((current) => ({ ...current, [key]: value }))}
          signalClass={signalClass}
          values={filterValues}
        />
        <div className={styles.filterActions}>
          <button type="submit">Apply filters</button>
          <Link href={action} prefetch={false}>Clear filters</Link>
        </div>
      </form>
      {snapshot.items.length === 0 ? (
        <p className={styles.emptyState}>
          {snapshot.hasAnySignals
            ? `No ${classLabel} signals match these filters.`
            : `No ${classLabel} signals have been recorded yet.`}
        </p>
      ) : (
        <>
          <div className={styles.tableFrame}>
            <table aria-label={`${classLabel} signals`} className={styles.signalTable}>
              <thead><tr><th scope="col">Signal</th><th scope="col">Organisation</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Observed</th><th scope="col">Review</th></tr></thead>
              <tbody>
                {snapshot.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><span>{displayLabel(item.theme)} · {displayLabel(item.demandDomain)}</span></td>
                    <td>{item.organisation?.canonicalName ?? "Direction-level signal"}</td>
                    <td>{displayLabel(item.status)}</td>
                    <td>{item.score ?? "—"}</td>
                    <td><time dateTime={item.observedAt}>{formatDate(item.observedAt)}</time></td>
                    <td><Link href={detailHref(item, canonicalListPath)} prefetch={false}>Review {item.title}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul aria-label={`${classLabel} signal cards`} className={styles.signalCards}>
            {snapshot.items.map((item) => (
              <li className={styles.signalCard} key={item.id}>
                <h2>{item.title}</h2>
                <SignalDetails item={item} />
                <Link href={detailHref(item, canonicalListPath)} prefetch={false}>Review {item.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {totalPages > 1 ? (
        <nav aria-label={`${classLabel} pagination`} className={styles.pagination}>
          {snapshot.page > 1 ? <Link href={paginationHref(canonicalListPath, snapshot.page - 1)} prefetch={false}>Previous page</Link> : <span />}
          <span>Page {snapshot.page} of {totalPages}</span>
          {snapshot.page < totalPages ? <Link href={paginationHref(canonicalListPath, snapshot.page + 1)} prefetch={false}>Next page</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
