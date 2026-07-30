import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import {
  candidateIdentifiers,
  type DiscoveryBatchCandidate,
  type DiscoveryCandidate as DomainDiscoveryCandidate,
} from "../../app/domain/discovery";
import type { MewtualsDatabase } from "../client";
import {
  candidateResearchVersions,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
} from "../schema";
import type { DiscoveryCandidate as StoredDiscoveryCandidate } from "../types";

export type DiscoveryTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

export type WriteDiscoveryCandidatesInput = Readonly<{
  runId: string;
  now: Date;
  candidates: readonly DiscoveryBatchCandidate[];
}>;

export type DiscoveryCandidateIdentityConflict = Readonly<{
  candidateType: DomainDiscoveryCandidate["type"];
  identifiers: string[];
  candidateIds: string[];
}>;

export type WrittenDiscoveryCandidate = Readonly<{
  candidateIndex: number;
  candidateId: string;
  created: boolean;
}>;

export type WriteDiscoveryCandidatesResult =
  | Readonly<{
      outcome: "written";
      candidates: WrittenDiscoveryCandidate[];
      newCount: number;
      duplicateCount: number;
      identityConflicts: DiscoveryCandidateIdentityConflict[];
    }>
  | Readonly<{
      outcome: "conflict";
      reason: "duplicate_candidate_in_batch";
      candidateIndexes: readonly [number, number];
    }>;

export type DiscoveryCandidateSourceWrite = Readonly<{
  candidateId: string;
  sourceName: string;
  sourceUrl: string;
  rawMetadata: Record<string, unknown>;
}>;

type PreparedCandidate = Readonly<{
  candidate: DiscoveryBatchCandidate;
  candidateIndex: number;
  identifiers: ReturnType<typeof candidateIdentifiers>;
  primaryIdentifier: ReturnType<typeof candidateIdentifiers>[number];
}>;

type ResolvedCandidate = PreparedCandidate & {
  candidateId: string | null;
  existing: StoredDiscoveryCandidate | null;
  newCandidateGroupIndex: number | null;
};

const DISCOVERY_IDENTITY_LOCK_NAMESPACE =
  "discovery:candidate-identity:v1:" as const;

function normalizedCandidateName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function canonicalIdentityKey(
  identifier: ReturnType<typeof candidateIdentifiers>[number],
): string {
  return `${identifier.kind}:${identifier.value}`;
}

function displayCanonicalUrl(
  candidate: DomainDiscoveryCandidate,
  primaryKind: ReturnType<typeof candidateIdentifiers>[number]["kind"],
): string {
  if (primaryKind === "website_host") {
    return candidate.websiteUrl ?? candidate.canonicalUrl;
  }
  if (primaryKind === "linkedin_url") {
    return candidate.linkedinUrl ?? candidate.canonicalUrl;
  }
  if (primaryKind === "social_url") {
    return candidate.primarySocialUrl ?? candidate.canonicalUrl;
  }
  return candidate.canonicalUrl;
}

function identifierRank(
  candidateType: DomainDiscoveryCandidate["type"],
  kind: ReturnType<typeof candidateIdentifiers>[number]["kind"],
): number {
  const priorities =
    candidateType === "company"
      ? ["website_host", "linkedin_url", "social_url", "canonical"]
      : ["social_url", "canonical", "linkedin_url", "website_host"];
  return priorities.indexOf(kind);
}

function prepareCandidates(
  candidates: readonly DiscoveryBatchCandidate[],
): PreparedCandidate[] {
  return candidates.map((candidate, candidateIndex) => {
    const identifiers = candidateIdentifiers(candidate);
    const primaryIdentifier = identifiers[0];
    if (!primaryIdentifier) {
      throw new Error("Discovery candidate has no stable identifier.");
    }
    return { candidate, candidateIndex, identifiers, primaryIdentifier };
  });
}

function identityLockKeys(prepared: readonly PreparedCandidate[]): string[] {
  return [
    ...new Set(
      prepared.flatMap(({ candidate, identifiers }) =>
        identifiers.map(
          ({ value }) =>
            `${DISCOVERY_IDENTITY_LOCK_NAMESPACE}${candidate.type}:${value}`,
        ),
      ),
    ),
  ].sort();
}

export async function lockDiscoveryCandidateIdentities(
  transaction: DiscoveryTransaction,
  candidates: readonly DiscoveryBatchCandidate[],
): Promise<void> {
  const prepared = prepareCandidates(candidates);
  for (const lockKey of identityLockKeys(prepared)) {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
}

async function matchedCandidateIdentifiers(
  transaction: DiscoveryTransaction,
  prepared: readonly PreparedCandidate[],
) {
  const identifierValuesByType = new Map<
    DomainDiscoveryCandidate["type"],
    Set<string>
  >();
  for (const { candidate, identifiers } of prepared) {
    const values =
      identifierValuesByType.get(candidate.type) ?? new Set<string>();
    for (const { value } of identifiers) values.add(value);
    identifierValuesByType.set(candidate.type, values);
  }
  const selectors = [...identifierValuesByType.entries()].map(
    ([candidateType, values]) =>
      and(
        eq(discoveryCandidateIdentifiers.candidateType, candidateType),
        inArray(discoveryCandidateIdentifiers.normalizedValue, [...values]),
      ),
  );
  return selectors.length === 0
    ? []
    : transaction
        .select({
          candidateId: discoveryCandidateIdentifiers.candidateId,
          candidateType: discoveryCandidateIdentifiers.candidateType,
          kind: discoveryCandidateIdentifiers.kind,
          normalizedValue: discoveryCandidateIdentifiers.normalizedValue,
        })
        .from(discoveryCandidateIdentifiers)
        .where(or(...selectors));
}

export async function findDiscoveryCandidateIdentityConflict(
  transaction: DiscoveryTransaction,
  candidate: DiscoveryBatchCandidate,
): Promise<DiscoveryCandidateIdentityConflict | null> {
  const prepared = prepareCandidates([candidate]);
  await lockDiscoveryCandidateIdentities(transaction, [candidate]);
  const matched = await matchedCandidateIdentifiers(transaction, prepared);
  const candidateIds = [
    ...new Set(matched.map(({ candidateId }) => candidateId)),
  ].sort();
  const lockedCandidates =
    candidateIds.length === 0
      ? []
      : await transaction
          .select({ id: discoveryCandidates.id })
          .from(discoveryCandidates)
          .where(inArray(discoveryCandidates.id, candidateIds))
          .orderBy(asc(discoveryCandidates.id))
          .for("update");
  if (lockedCandidates.length !== candidateIds.length) {
    throw new Error("Discovery identifier owner could not be read.");
  }
  if (candidateIds.length <= 1) return null;
  return {
    candidateType: candidate.type,
    identifiers: prepared[0]!.identifiers
      .map(({ value }) => value.slice(0, 512))
      .slice(0, 4),
    candidateIds: candidateIds.slice(0, 4),
  };
}

export async function inspectDiscoveryCandidateIdentityConflict(
  transaction: DiscoveryTransaction,
  candidate: DiscoveryBatchCandidate,
): Promise<DiscoveryCandidateIdentityConflict | null> {
  const prepared = prepareCandidates([candidate]);
  const matched = await matchedCandidateIdentifiers(transaction, prepared);
  const candidateIds = [
    ...new Set(matched.map(({ candidateId }) => candidateId)),
  ].sort();
  return candidateIds.length > 1
    ? {
        candidateType: candidate.type,
        identifiers: prepared[0]!.identifiers
          .map(({ value }) => value.slice(0, 512))
          .slice(0, 4),
        candidateIds: candidateIds.slice(0, 4),
      }
    : null;
}

export async function upsertDiscoveryCandidateSources(
  transaction: DiscoveryTransaction,
  input: Readonly<{
    runId: string;
    now: Date;
    sources: readonly DiscoveryCandidateSourceWrite[];
  }>,
): Promise<void> {
  if (input.sources.length === 0) return;
  await transaction
    .insert(discoveryCandidateSources)
    .values(
      input.sources.map((source) => ({
        candidateId: source.candidateId,
        discoveryRunId: input.runId,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        firstSeenAt: input.now,
        lastSeenAt: input.now,
        rawMetadata: source.rawMetadata,
        createdAt: input.now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        discoveryCandidateSources.candidateId,
        discoveryCandidateSources.sourceName,
        discoveryCandidateSources.sourceUrl,
      ],
      set: {
        discoveryRunId: sql`excluded.discovery_run_id`,
        lastSeenAt: sql`excluded.last_seen_at`,
        rawMetadata: sql`excluded.raw_metadata`,
      },
    });
}

export async function writeDiscoveryCandidates(
  transaction: DiscoveryTransaction,
  input: WriteDiscoveryCandidatesInput,
): Promise<WriteDiscoveryCandidatesResult> {
  const preparedCandidates = prepareCandidates(input.candidates);
  await lockDiscoveryCandidateIdentities(transaction, input.candidates);

  const matchedIdentifiers = await matchedCandidateIdentifiers(
    transaction,
    preparedCandidates,
  );
  const candidateIdByIdentifier = new Map(
    matchedIdentifiers.map((identifier) => [
      `${identifier.candidateType}:${identifier.normalizedValue}`,
      identifier.candidateId,
    ]),
  );
  const matchedCandidateIds = [
    ...new Set(matchedIdentifiers.map(({ candidateId }) => candidateId)),
  ].sort();
  const lockedCandidates =
    matchedCandidateIds.length === 0
      ? []
      : await transaction
          .select()
          .from(discoveryCandidates)
          .where(inArray(discoveryCandidates.id, matchedCandidateIds))
          .orderBy(asc(discoveryCandidates.id))
          .for("update");
  if (lockedCandidates.length !== matchedCandidateIds.length) {
    throw new Error("Discovery identifier owner could not be read.");
  }
  const lockedCandidateById = new Map(
    lockedCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const storedIdentifierKinds =
    matchedCandidateIds.length === 0
      ? []
      : await transaction
          .select({
            candidateId: discoveryCandidateIdentifiers.candidateId,
            kind: discoveryCandidateIdentifiers.kind,
          })
          .from(discoveryCandidateIdentifiers)
          .where(
            inArray(
              discoveryCandidateIdentifiers.candidateId,
              matchedCandidateIds,
            ),
          );
  const storedKindsByCandidateId = new Map<
    string,
    Array<(typeof storedIdentifierKinds)[number]["kind"]>
  >();
  for (const identifier of storedIdentifierKinds) {
    const kinds = storedKindsByCandidateId.get(identifier.candidateId) ?? [];
    kinds.push(identifier.kind);
    storedKindsByCandidateId.set(identifier.candidateId, kinds);
  }

  const identityConflicts: DiscoveryCandidateIdentityConflict[] = [];
  const resolutions: ResolvedCandidate[] = [];
  const strictDuplicateCandidates = input.candidates.some(
    (candidate) => "research" in candidate,
  );
  const firstCandidateIndexByStoredId = new Map<string, number>();
  const firstNewCandidateGroupByIdentifier = new Map<string, number>();
  for (const prepared of preparedCandidates) {
    const identifierKeys = prepared.identifiers.map(
      ({ value }) => `${prepared.candidate.type}:${value}`,
    );
    const resolvedCandidateIds = [
      ...new Set(
        identifierKeys
          .map((identifierKey) => candidateIdByIdentifier.get(identifierKey))
          .filter((candidateId): candidateId is string => Boolean(candidateId)),
      ),
    ].sort();
    const newCandidateGroupIndexes = [
      ...new Set(
        identifierKeys
          .map((identifierKey) =>
            firstNewCandidateGroupByIdentifier.get(identifierKey),
          )
          .filter(
            (candidateIndex): candidateIndex is number =>
              candidateIndex !== undefined,
          ),
      ),
    ].sort((left, right) => left - right);
    if (
      resolvedCandidateIds.length > 1 ||
      (resolvedCandidateIds.length > 0 && newCandidateGroupIndexes.length > 0)
    ) {
      if (identityConflicts.length < 20) {
        identityConflicts.push({
          candidateType: prepared.candidate.type,
          identifiers: prepared.identifiers
            .map(({ value }) => value.slice(0, 512))
            .slice(0, 4),
          candidateIds: resolvedCandidateIds.slice(0, 4),
        });
      }
      continue;
    }

    const candidateId = resolvedCandidateIds[0] ?? null;
    if (candidateId) {
      const firstCandidateIndex = firstCandidateIndexByStoredId.get(candidateId);
      if (firstCandidateIndex !== undefined) {
        if (strictDuplicateCandidates) {
          return {
            outcome: "conflict",
            reason: "duplicate_candidate_in_batch",
            candidateIndexes: [firstCandidateIndex, prepared.candidateIndex],
          };
        }
      } else {
        firstCandidateIndexByStoredId.set(candidateId, prepared.candidateIndex);
      }
    }

    if (!candidateId && newCandidateGroupIndexes.length > 1) {
      if (identityConflicts.length < 20) {
        identityConflicts.push({
          candidateType: prepared.candidate.type,
          identifiers: prepared.identifiers
            .map(({ value }) => value.slice(0, 512))
            .slice(0, 4),
          candidateIds: [],
        });
      }
      continue;
    }

    const newCandidateGroupIndex = candidateId
      ? null
      : (newCandidateGroupIndexes[0] ?? prepared.candidateIndex);
    if (
      !candidateId &&
      newCandidateGroupIndexes.length === 1 &&
      strictDuplicateCandidates
    ) {
      return {
        outcome: "conflict",
        reason: "duplicate_candidate_in_batch",
        candidateIndexes: [
          newCandidateGroupIndexes[0]!,
          prepared.candidateIndex,
        ],
      };
    }
    if (newCandidateGroupIndex !== null) {
      for (const identifierKey of identifierKeys) {
        firstNewCandidateGroupByIdentifier.set(
          identifierKey,
          newCandidateGroupIndex,
        );
      }
    }
    resolutions.push({
      ...prepared,
      candidateId,
      existing: candidateId
        ? (lockedCandidateById.get(candidateId) ?? null)
        : null,
      newCandidateGroupIndex,
    });
  }

  const newResolutions = resolutions.filter(
    (resolution) =>
      resolution.candidateId === null &&
      resolution.newCandidateGroupIndex === resolution.candidateIndex,
  );
  const createdCandidates =
    newResolutions.length === 0
      ? []
      : await transaction
          .insert(discoveryCandidates)
          .values(
            newResolutions.map(({ candidate, primaryIdentifier }) => ({
              type: candidate.type,
              name: candidate.name,
              normalizedName: normalizedCandidateName(candidate.name),
              canonicalIdentityKey: canonicalIdentityKey(primaryIdentifier),
              canonicalUrl: displayCanonicalUrl(
                candidate,
                primaryIdentifier.kind,
              ),
              websiteUrl: candidate.websiteUrl ?? null,
              primarySocialUrl: candidate.primarySocialUrl ?? null,
              linkedinUrl: candidate.linkedinUrl ?? null,
              discoveredDescription: candidate.discoveredDescription,
              category: candidate.category,
              subcategory: candidate.subcategory ?? null,
              geography: candidate.geography,
              firstSourceName: candidate.sourceName,
              firstSourceUrl: candidate.sourceUrl,
              discoveredAt: input.now,
              lastSeenAt: input.now,
              createdAt: input.now,
              updatedAt: input.now,
              mostRecentRunId: input.runId,
              discoveryScore: candidate.discoveryScore,
              status: "discovered" as const,
              rawMetadata: candidate.rawMetadata,
            })),
          )
          .returning({
            id: discoveryCandidates.id,
            type: discoveryCandidates.type,
            canonicalIdentityKey: discoveryCandidates.canonicalIdentityKey,
          });
  const createdCandidateIdByKey = new Map(
    createdCandidates.map((candidate) => [
      `${candidate.type}:${candidate.canonicalIdentityKey}`,
      candidate.id,
    ]),
  );
  const createdCandidateIdByGroupIndex = new Map<number, string>();
  for (const resolution of newResolutions) {
    const createdId = createdCandidateIdByKey.get(
      `${resolution.candidate.type}:${canonicalIdentityKey(resolution.primaryIdentifier)}`,
    );
    if (!createdId) throw new Error("Discovery candidate was not created.");
    createdCandidateIdByGroupIndex.set(resolution.candidateIndex, createdId);
  }
  for (const resolution of resolutions) {
    if (resolution.candidateId) continue;
    const createdId = createdCandidateIdByGroupIndex.get(
      resolution.newCandidateGroupIndex!,
    );
    if (!createdId) {
      throw new Error("Discovery candidate group was not created.");
    }
    resolution.candidateId = createdId;
  }

  const existingResolutions = resolutions.filter(
    (
      resolution,
    ): resolution is ResolvedCandidate & {
      candidateId: string;
      existing: StoredDiscoveryCandidate;
    } => Boolean(resolution.candidateId && resolution.existing),
  );
  for (const {
    candidate,
    candidateId,
    existing,
    primaryIdentifier,
  } of existingResolutions) {
    const storedKinds = storedKindsByCandidateId.get(candidateId) ?? [];
    const currentBestRank = Math.min(
      ...storedKinds.map((kind) => identifierRank(candidate.type, kind)),
    );
    const incomingRank = identifierRank(candidate.type, primaryIdentifier.kind);
    await transaction
      .update(discoveryCandidates)
      .set({
        name: candidate.name,
        normalizedName: normalizedCandidateName(candidate.name),
        canonicalUrl:
          incomingRank < currentBestRank
            ? displayCanonicalUrl(candidate, primaryIdentifier.kind)
            : existing.canonicalUrl,
        websiteUrl: candidate.websiteUrl ?? existing.websiteUrl,
        primarySocialUrl:
          candidate.primarySocialUrl ?? existing.primarySocialUrl,
        linkedinUrl: candidate.linkedinUrl ?? existing.linkedinUrl,
        discoveredDescription: candidate.discoveredDescription,
        category: candidate.category,
        subcategory: candidate.subcategory ?? existing.subcategory,
        geography: candidate.geography,
        lastSeenAt: input.now,
        updatedAt: input.now,
        mostRecentRunId: input.runId,
        discoveryScore: Math.max(
          existing.discoveryScore,
          candidate.discoveryScore,
        ),
        rawMetadata: candidate.rawMetadata,
      })
      .where(eq(discoveryCandidates.id, candidateId));
  }

  const persistedResolutions = resolutions.map((resolution) => {
    if (!resolution.candidateId) {
      throw new Error("Discovery candidate identity was not resolved.");
    }
    return { ...resolution, candidateId: resolution.candidateId };
  });
  const identifierRows = persistedResolutions.flatMap(
    ({ candidate, candidateId, identifiers }) =>
      identifiers.map((identifier) => ({
        candidateId,
        candidateType: candidate.type,
        kind: identifier.kind,
        normalizedValue: identifier.value,
        createdAt: input.now,
      })),
  );
  if (identifierRows.length > 0) {
    await transaction
      .insert(discoveryCandidateIdentifiers)
      .values(identifierRows)
      .onConflictDoNothing({
        target: [
          discoveryCandidateIdentifiers.candidateType,
          discoveryCandidateIdentifiers.normalizedValue,
        ],
      });
  }
  await upsertDiscoveryCandidateSources(transaction, {
    runId: input.runId,
    now: input.now,
    sources: persistedResolutions.map(({ candidate, candidateId }) => ({
      candidateId,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      rawMetadata: candidate.rawMetadata,
    })),
  });
  const researchRows = persistedResolutions.flatMap(
    ({ candidate, candidateId }) =>
      "research" in candidate
        ? [
            {
              candidateId,
              discoveryRunId: input.runId,
              summary: candidate.research.summary,
              findings: candidate.research.findings,
              sourceUrls: candidate.research.sourceUrls,
              analysisVersion: candidate.research.analysisVersion,
              createdAt: input.now,
            },
          ]
        : [],
  );
  if (researchRows.length > 0) {
    await transaction.insert(candidateResearchVersions).values(researchRows);
  }

  const newCandidateGroupIndexes = new Set(
    newResolutions.map(({ candidateIndex }) => candidateIndex),
  );
  const writtenCandidates = persistedResolutions.map((resolution) => ({
    candidateIndex: resolution.candidateIndex,
    candidateId: resolution.candidateId,
    created: newCandidateGroupIndexes.has(resolution.candidateIndex),
  }));
  const newCount = newResolutions.length;
  return {
    outcome: "written",
    candidates: writtenCandidates,
    newCount,
    duplicateCount: persistedResolutions.length - newCount,
    identityConflicts,
  };
}
