import { ECOSYSTEM_TAXONOMY } from "../../../domain/ecosystem-intelligence-taxonomy";

import styles from "./ecosystem-intelligence.module.css";
import type {
  CountOptionDto,
  EcosystemFilterArrayKey,
  EcosystemFiltersDto,
  EcosystemSnapshotDto,
} from "./types";

type FilterBarProps = {
  filters: EcosystemFiltersDto;
  options: EcosystemSnapshotDto["filterOptions"];
  onChange: (changes: Partial<EcosystemFiltersDto>) => void;
};

type MultiFilter = {
  key: EcosystemFilterArrayKey;
  label: string;
  options: CountOptionDto[];
};

const FILTER_TAXONOMY_KIND: Partial<Record<EcosystemFilterArrayKey, string>> = {
  ecosystemDomains: "ecosystem_domain",
  organisationSubtypes: "organisation_subtype",
  ecosystemRoles: "ecosystem_role",
  businessStages: "business_stage",
  technicalLayers: "technical_layer",
  capabilities: "capability",
  componentCategories: "component_category",
  roboticsVerticals: "robotics_vertical",
  activeSignalTypes: "signal_type",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  queued_for_profile: "Queued for profile",
};

function humanize(value: string): string {
  if (value === "unknown") return "Unknown";
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function taxonomyLabel(kind: string, key: string): string | undefined {
  const terms = ECOSYSTEM_TAXONOMY.termsByKind[
    kind as keyof typeof ECOSYSTEM_TAXONOMY.termsByKind
  ] as readonly { key: string; label: string }[];
  return terms?.find((term) => term.key === key)?.label;
}

function optionLabel(
  arrayKey: EcosystemFilterArrayKey,
  key: string,
  options: readonly CountOptionDto[],
): string {
  if (arrayKey === "reviewStatuses") return REVIEW_STATUS_LABELS[key] ?? humanize(key);
  const kind = FILTER_TAXONOMY_KIND[arrayKey];
  return options.find((option) => option.key === key)?.label
    ?? (kind ? taxonomyLabel(kind, key) : undefined)
    ?? humanize(key);
}

function allOptions(
  arrayKey: EcosystemFilterArrayKey,
  current: readonly string[],
  supplied: readonly CountOptionDto[],
): CountOptionDto[] {
  const byKey = new Map(supplied.map((option) => [option.key, option]));
  const kind = FILTER_TAXONOMY_KIND[arrayKey];
  if (kind) {
    const terms = ECOSYSTEM_TAXONOMY.termsByKind[
      kind as keyof typeof ECOSYSTEM_TAXONOMY.termsByKind
    ] as readonly { key: string; label: string }[];
    for (const term of terms) {
      if (!byKey.has(term.key)) byKey.set(term.key, { ...term, count: 0 });
    }
  }
  for (const key of current) {
    if (!byKey.has(key)) {
      byKey.set(key, { key, label: optionLabel(arrayKey, key, supplied), count: 0 });
    }
  }
  if (arrayKey !== "reviewStatuses" && !byKey.has("unknown")) {
    byKey.set("unknown", { key: "unknown", label: "Unknown", count: 0 });
  }
  return [...byKey.values()];
}

function MultiValueSelect({
  filter,
  filters,
  onChange,
}: {
  filter: MultiFilter;
  filters: EcosystemFiltersDto;
  onChange: FilterBarProps["onChange"];
}) {
  const current = filters[filter.key] as readonly string[];
  return (
    <label className={styles.field}>
      <span>{filter.label}</span>
      <select
        aria-label={filter.label}
        className={styles.select}
        value=""
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value && !current.includes(value)) {
            onChange({ [filter.key]: [...current, value] });
          }
        }}
      >
        <option value="">Add a filter</option>
        {allOptions(filter.key, current, filter.options).map((option) => (
          <option key={option.key} value={option.key} disabled={current.includes(option.key)}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function EcosystemFilterBar({ filters, options, onChange }: FilterBarProps) {
  const multiFilters: MultiFilter[] = [
    { key: "ecosystemDomains", label: "Ecosystem domains", options: options.taxonomy.ecosystem_domain ?? [] },
    { key: "organisationSubtypes", label: "Organisation subtypes", options: options.taxonomy.organisation_subtype ?? [] },
    { key: "ecosystemRoles", label: "Ecosystem roles", options: options.taxonomy.ecosystem_role ?? [] },
    { key: "businessStages", label: "Business stages", options: options.taxonomy.business_stage ?? [] },
    { key: "technicalLayers", label: "Technical layers", options: options.taxonomy.technical_layer ?? [] },
    { key: "capabilities", label: "Capabilities", options: options.taxonomy.capability ?? [] },
    { key: "componentCategories", label: "Component categories", options: options.taxonomy.component_category ?? [] },
    { key: "roboticsVerticals", label: "Robotics verticals", options: options.taxonomy.robotics_vertical ?? [] },
    { key: "headquartersStates", label: "Headquarters states", options: options.headquartersStates },
    { key: "headquartersCities", label: "Headquarters cities", options: options.headquartersCities },
    { key: "activeSignalTypes", label: "Active signal types", options: options.activeSignalTypes },
    { key: "reviewStatuses", label: "Review statuses", options: options.reviewStatuses },
  ];
  const chips = multiFilters.flatMap((filter) =>
    (filters[filter.key] as readonly string[]).map((value) => ({
      arrayKey: filter.key,
      value,
      label: optionLabel(filter.key, value, filter.options),
    })),
  ).filter(({ arrayKey, value }) =>
    arrayKey !== "reviewStatuses"
      || !["discovered", "shortlisted", "queued_for_profile"].includes(value)
      || filters.reviewStatuses.length !== 3,
  );
  const scalarChips: Array<{
    key: "publicContactAvailability" | "evidenceCoverageBand" | "evidenceFreshness" | "minimumDiscoveryConfidence" | "discoveredAfter" | "discoveredBefore";
    label: string;
  }> = [
    ...(filters.publicContactAvailability ? [{ key: "publicContactAvailability" as const, label: `Public contact: ${humanize(filters.publicContactAvailability)}` }] : []),
    ...(filters.evidenceCoverageBand ? [{ key: "evidenceCoverageBand" as const, label: `Evidence: ${humanize(filters.evidenceCoverageBand)}` }] : []),
    ...(filters.evidenceFreshness ? [{ key: "evidenceFreshness" as const, label: `Freshness: ${humanize(filters.evidenceFreshness)}` }] : []),
    ...(filters.minimumDiscoveryConfidence !== undefined ? [{ key: "minimumDiscoveryConfidence" as const, label: `Discovery confidence: ${filters.minimumDiscoveryConfidence}+` }] : []),
    ...(filters.discoveredAfter ? [{ key: "discoveredAfter" as const, label: `Discovered after: ${filters.discoveredAfter}` }] : []),
    ...(filters.discoveredBefore ? [{ key: "discoveredBefore" as const, label: `Discovered before: ${filters.discoveredBefore}` }] : []),
  ];

  return (
    <section className={styles.filterBar} aria-labelledby="ecosystem-filter-title">
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <a href="/admin/discovery">Admin</a><span aria-hidden="true">/</span>
        <span aria-current="page">Ecosystem intelligence</span>
      </nav>
      <div className={styles.filterHeading}>
        <div>
          <p className={styles.kicker}>One evidence map</p>
          <h2 id="ecosystem-filter-title">Current Physical AI view</h2>
        </div>
        <button className={styles.textButton} type="button" onClick={() => onChange({
          participantType: "company",
          includeEnablers: false,
          ecosystemDomains: [],
          organisationSubtypes: [],
          ecosystemRoles: [],
          businessStages: [],
          technicalLayers: [],
          capabilities: [],
          componentCategories: [],
          roboticsVerticals: [],
          headquartersStates: [],
          headquartersCities: [],
          activeSignalTypes: [],
          reviewStatuses: ["discovered", "shortlisted", "queued_for_profile"],
          publicContactAvailability: undefined,
          evidenceCoverageBand: undefined,
          evidenceFreshness: undefined,
          minimumDiscoveryConfidence: undefined,
          discoveredAfter: undefined,
          discoveredBefore: undefined,
          pageSize: 25,
          sort: "discovered_at",
          direction: "desc",
          page: 1,
        })}>Reset view</button>
      </div>

      <div className={styles.primaryFilters}>
        <fieldset className={styles.segmented}>
          <legend>Participant type</legend>
          <label>
            <input type="radio" name="participant-type" checked={filters.participantType === "company"} onChange={() => onChange({ participantType: "company" })} />
            <span>Companies</span>
          </label>
          <label>
            <input type="radio" name="participant-type" checked={filters.participantType === "creator"} onChange={() => onChange({ participantType: "creator" })} />
            <span>Creators and media</span>
          </label>
        </fieldset>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={filters.includeEnablers} onChange={(event) => onChange({ includeEnablers: event.currentTarget.checked })} />
          <span>Include ecosystem enablers</span>
        </label>
      </div>

      <details className={styles.advancedFilters}>
        <summary>Advanced filters</summary>
        <div className={styles.advancedGrid}>
          {multiFilters.map((filter) => (
            <MultiValueSelect key={filter.key} filter={filter} filters={filters} onChange={onChange} />
          ))}
          <label className={styles.field}>
            <span>Public contact</span>
            <select className={styles.select} value={filters.publicContactAvailability ?? ""} onChange={(event) => onChange({ publicContactAvailability: event.currentTarget.value ? event.currentTarget.value as EcosystemFiltersDto["publicContactAvailability"] : undefined })}>
              <option value="">Any</option><option value="available">Available</option><option value="missing">Missing</option><option value="unknown">Unknown</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Evidence coverage</span>
            <select className={styles.select} value={filters.evidenceCoverageBand ?? ""} onChange={(event) => onChange({ evidenceCoverageBand: event.currentTarget.value ? event.currentTarget.value as EcosystemFiltersDto["evidenceCoverageBand"] : undefined })}>
              <option value="">Any</option><option value="strong">Strong</option><option value="partial">Partial</option><option value="limited">Limited</option><option value="unknown">Unknown</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Evidence freshness</span>
            <select className={styles.select} value={filters.evidenceFreshness ?? ""} onChange={(event) => onChange({ evidenceFreshness: event.currentTarget.value ? event.currentTarget.value as EcosystemFiltersDto["evidenceFreshness"] : undefined })}>
              <option value="">Any</option><option value="current">Current</option><option value="stale">Stale</option><option value="unknown">Unknown</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Minimum discovery confidence</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              max="100"
              step="1"
              value={filters.minimumDiscoveryConfidence ?? ""}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                if (raw === "") {
                  onChange({ minimumDiscoveryConfidence: undefined });
                  return;
                }
                const value = Number(raw);
                if (Number.isInteger(value) && value >= 0 && value <= 100) {
                  onChange({ minimumDiscoveryConfidence: value });
                }
              }}
            />
          </label>
          <label className={styles.field}>
            <span>Discovered after</span>
            <input
              className={styles.input}
              type="date"
              value={filters.discoveredAfter ?? ""}
              onChange={(event) => {
                const discoveredAfter = event.currentTarget.value || undefined;
                onChange({
                  discoveredAfter,
                  ...(discoveredAfter && filters.discoveredBefore && discoveredAfter > filters.discoveredBefore
                    ? { discoveredBefore: undefined }
                    : {}),
                });
              }}
            />
          </label>
          <label className={styles.field}>
            <span>Discovered before</span>
            <input
              className={styles.input}
              type="date"
              value={filters.discoveredBefore ?? ""}
              onChange={(event) => {
                const discoveredBefore = event.currentTarget.value || undefined;
                onChange({
                  discoveredBefore,
                  ...(discoveredBefore && filters.discoveredAfter && discoveredBefore < filters.discoveredAfter
                    ? { discoveredAfter: undefined }
                    : {}),
                });
              }}
            />
          </label>
        </div>
      </details>

      {chips.length > 0 || scalarChips.length > 0 || filters.includeEnablers || filters.participantType !== "company" ? (
        <div className={styles.activeFilters} aria-label="Active filters">
          <span>Active</span>
          {filters.participantType !== "company" ? <button type="button" onClick={() => onChange({ participantType: "company" })}>Creators and media <span aria-hidden="true">×</span><span className={styles.srOnly}>Remove Creators and media</span></button> : null}
          {filters.includeEnablers ? <button type="button" onClick={() => onChange({ includeEnablers: false })}>Ecosystem enablers <span aria-hidden="true">×</span><span className={styles.srOnly}>Remove Ecosystem enablers</span></button> : null}
          {chips.map((chip) => (
            <button
              key={`${chip.arrayKey}:${chip.value}`}
              type="button"
              aria-label={`Remove ${chip.label}`}
              onClick={() => onChange({
                [chip.arrayKey]: (filters[chip.arrayKey] as readonly string[]).filter((value) => value !== chip.value),
              })}
            >
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          {scalarChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-label={`Remove ${chip.label}`}
              onClick={() => onChange({ [chip.key]: undefined })}
            >
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
