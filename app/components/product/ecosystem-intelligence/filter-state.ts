import {
  applyEcosystemFilterChanges,
  DEFAULT_ECOSYSTEM_FILTERS,
  filtersFromSearchParams,
  serializeEcosystemFilters,
  type EcosystemFilters,
} from "../../../domain/ecosystem-intelligence";

import type { EcosystemFiltersDto } from "./types";

const asDomainFilters = (filters: EcosystemFiltersDto): EcosystemFilters =>
  filters as EcosystemFilters;

export const DEFAULT_BROWSER_ECOSYSTEM_FILTERS =
  DEFAULT_ECOSYSTEM_FILTERS as EcosystemFiltersDto;

export function filtersFromBrowserQuery(query: string): EcosystemFiltersDto {
  return filtersFromSearchParams(new URLSearchParams(query)) as EcosystemFiltersDto;
}

export function serializeBrowserFilters(filters: EcosystemFiltersDto): string {
  return serializeEcosystemFilters(asDomainFilters(filters));
}

export function applyBrowserFilterChanges(
  current: EcosystemFiltersDto,
  changes: Partial<EcosystemFiltersDto>,
): EcosystemFiltersDto {
  return applyEcosystemFilterChanges(
    asDomainFilters(current),
    changes as Partial<EcosystemFilters>,
  ) as EcosystemFiltersDto;
}

export function ecosystemWorkspaceHref(query: string): string {
  return `/admin/ecosystem-intelligence${query ? `?${query}` : ""}`;
}
