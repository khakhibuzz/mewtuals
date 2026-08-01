import { redirect } from "next/navigation";

import {
  DiscoveryDashboard,
  type DiscoveryDashboardSnapshot,
} from "../../components/product/DiscoveryDashboard";
import { AdminShell } from "../../components/product/AdminShell";
import { loadAdminPageContext } from "../../server/admin-page-context";
import { getDiscoveryService } from "../../server/discovery";
import type { DiscoveryAdminSnapshot } from "../../../db/repositories/discovery-repository";

type DiscoveryAdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const discoveryFilterKeys = [
  "type",
  "geography",
  "category",
  "source",
  "status",
  "discoveredFrom",
  "discoveredTo",
  "page",
] as const;

function discoveryFilters(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of discoveryFilterKeys) {
    const value = searchParams?.[key];
    const selected = Array.isArray(value) ? value[0] : value;
    const normalized = selected?.trim();
    if (normalized) filters[key] = normalized;
  }
  return filters;
}

function optionalTimestamp(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function timestamp(value: Date): string {
  return value.toISOString();
}

function runNotice(errorSummary: Record<string, unknown>): string | null {
  const sourceErrors = Array.isArray(errorSummary.sourceErrors)
    ? errorSummary.sourceErrors.length
    : 0;
  const identityConflicts = Array.isArray(errorSummary.identityConflicts)
    ? errorSummary.identityConflicts.length
    : 0;
  const notices = [
    sourceErrors > 0
      ? `${sourceErrors} source ${sourceErrors === 1 ? "error" : "errors"}`
      : null,
    identityConflicts > 0
      ? `${identityConflicts} identity ${identityConflicts === 1 ? "conflict" : "conflicts"}`
      : null,
    errorSummary.failure && sourceErrors === 0 && identityConflicts === 0
      ? "Worker failure"
      : null,
  ].filter((notice): notice is string => notice !== null);
  return notices.length > 0 ? notices.join(" · ") : null;
}

export function serializeDiscoverySnapshot(
  snapshot: DiscoveryAdminSnapshot,
): DiscoveryDashboardSnapshot {
  return {
    summary: {
      ...snapshot.summary,
      latestRunCompletedAt: optionalTimestamp(
        snapshot.summary.latestRunCompletedAt,
      ),
    },
    candidates: {
      total: snapshot.candidates.total,
      page: snapshot.candidates.page,
      pageSize: snapshot.candidates.pageSize,
      items: snapshot.candidates.items.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
        canonicalUrl: candidate.canonicalUrl,
        websiteUrl: candidate.websiteUrl,
        primarySocialUrl: candidate.primarySocialUrl,
        linkedinUrl: candidate.linkedinUrl,
        discoveredDescription: candidate.discoveredDescription,
        category: candidate.category,
        subcategory: candidate.subcategory,
        geography: candidate.geography,
        firstSourceName: candidate.firstSourceName,
        firstSourceUrl: candidate.firstSourceUrl,
        discoveredAt: timestamp(candidate.discoveredAt),
        lastSeenAt: timestamp(candidate.lastSeenAt),
        updatedAt: timestamp(candidate.updatedAt),
        discoveryScore: candidate.discoveryScore,
        status: candidate.status,
      })),
    },
    runs: snapshot.runs.map((run) => ({
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      startedAt: optionalTimestamp(run.startedAt),
      completedAt: optionalTimestamp(run.completedAt),
      createdAt: timestamp(run.createdAt),
      geography: run.geography,
      candidateType: run.candidateType,
      sourcesUsed: run.sourcesUsed,
      requestedCount: run.requestedCount,
      foundCount: run.foundCount,
      newCount: run.newCount,
      duplicateCount: run.duplicateCount,
      notice: runNotice(run.errorSummary),
    })),
    evidence: snapshot.evidence.map((source) => ({
      id: source.id,
      candidateId: source.candidateId,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      firstSeenAt: timestamp(source.firstSeenAt),
      lastSeenAt: timestamp(source.lastSeenAt),
    })),
  };
}

export default async function DiscoveryAdminPage({
  searchParams,
}: DiscoveryAdminPageProps) {
  const { database, session } = await loadAdminPageContext();
  if (!session) redirect("/login");

  const filters = discoveryFilters(await searchParams);
  const result = await getDiscoveryService(database).getAdminSummary(
    { userId: session.user.id, email: session.user.email },
    filters,
  );
  if (!result.ok) redirect("/dashboard");

  return (
    <AdminShell
      current="india-discovery"
      eyebrow="Discovery network"
      title="Discovery operations."
      intro="Review source-supported companies and creators before they enter the profile pipeline."
    >
      <DiscoveryDashboard
        snapshot={serializeDiscoverySnapshot(result.snapshot)}
        filters={filters}
      />
    </AdminShell>
  );
}
