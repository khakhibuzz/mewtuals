import {
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { candidateIdentifierForProfileUrl } from "../../app/domain/discovery";
import { isRegisteredTaxonomyKey } from
  "../../app/domain/ecosystem-intelligence-taxonomy";
import {
  deriveRelationshipEvidenceKey,
  deriveSignalEvidenceKey,
  type EcosystemImportCandidate,
  type EcosystemImportDocument,
} from "../../scripts/ecosystem-intelligence-import";
import { getDb, type MewtualsDatabase } from "../client";
import {
  candidateEcosystemClassifications,
  candidateHeadquarters,
  candidatePublicSignals,
  candidateRelationships,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
} from "../schema";

type FactCounts = {
  classifications: number;
  headquarters: number;
  signals: number;
  relationships: number;
};

export type EcosystemImportResult = {
  candidatesResolved: number;
  insertedCounts: FactCounts;
  updatedCounts: FactCounts;
  duplicateCounts: FactCounts;
  unresolvedCount: number;
};

export class EcosystemImportRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EcosystemImportRepositoryError";
  }
}

export type EcosystemIntelligenceImportRepository = {
  importDocument(
    document: EcosystemImportDocument,
    now: Date,
  ): Promise<EcosystemImportResult>;
};

type CandidateIdentity = Pick<EcosystemImportCandidate, "candidateId" | "canonicalUrl">;
type ResolvedRelationship = Omit<
  EcosystemImportCandidate["relationships"][number],
  "targetCandidateId" | "targetCanonicalUrl" | "targetPublicName"
> & {
  targetCandidateId: string | null;
  targetPublicName: string | null;
  evidenceKey: string;
};
type PreparedCandidate = EcosystemImportCandidate & {
  resolvedCandidateId: string;
  resolvedRelationships: ResolvedRelationship[];
};

const zeroCounts = (): FactCounts => ({
  classifications: 0,
  headquarters: 0,
  signals: 0,
  relationships: 0,
});

function normalizedIdentity(identity: CandidateIdentity): {
  id?: string;
  normalizedValue?: string;
  canonicalIdentityKey?: string;
  canonicalUrl?: string;
} {
  if (identity.candidateId) return { id: identity.candidateId };
  if (!identity.canonicalUrl) {
    throw new EcosystemImportRepositoryError("invalid_candidate_identity");
  }
  const identifier = candidateIdentifierForProfileUrl(identity.canonicalUrl);
  return {
    normalizedValue: identifier.value,
    canonicalIdentityKey: `${identifier.kind}:${identifier.value}`,
    canonicalUrl: identity.canonicalUrl,
  };
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function latitudeMicrodegrees(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value * 1_000_000);
}

function ensureRegisteredTaxonomy(document: EcosystemImportDocument): void {
  for (const candidate of document.candidates) {
    for (const classification of candidate.classifications) {
      if (!isRegisteredTaxonomyKey(classification.kind, classification.termKey)) {
        throw new EcosystemImportRepositoryError("unregistered_taxonomy_key");
      }
    }
  }
}

function assertUnique(keys: readonly string[], code: string): void {
  if (new Set(keys).size !== keys.length) {
    throw new EcosystemImportRepositoryError(code);
  }
}

export function createEcosystemIntelligenceImportRepository(
  database: MewtualsDatabase = getDb(),
): EcosystemIntelligenceImportRepository {
  return {
    async importDocument(document, now) {
      ensureRegisteredTaxonomy(document);

      return database.transaction(async (transaction) => {
        const sourceIdentities = document.candidates.map((candidate) =>
          normalizedIdentity(candidate),
        );
        const targetIdentities = document.candidates.flatMap((candidate) =>
          candidate.relationships.flatMap((relationship) => {
            if (relationship.targetPublicName) return [];
            return [normalizedIdentity({
              candidateId: relationship.targetCandidateId,
              canonicalUrl: relationship.targetCanonicalUrl,
            })];
          }),
        );
        const identities = [...sourceIdentities, ...targetIdentities];
        const explicitIds = [
          ...new Set(identities.flatMap(({ id }) => id ? [id] : [])),
        ];
        const normalizedValues = [
          ...new Set(
            identities.flatMap(({ normalizedValue }) =>
              normalizedValue ? [normalizedValue] : [],
            ),
          ),
        ];
        const canonicalIdentityKeys = [
          ...new Set(
            identities.flatMap(({ canonicalIdentityKey }) =>
              canonicalIdentityKey ? [canonicalIdentityKey] : [],
            ),
          ),
        ];
        const canonicalUrls = [
          ...new Set(
            identities.flatMap(({ canonicalUrl }) =>
              canonicalUrl ? [canonicalUrl] : [],
            ),
          ),
        ];

        const identifierMatches = normalizedValues.length === 0
          ? []
          : await transaction
              .select({
                candidateId: discoveryCandidateIdentifiers.candidateId,
                normalizedValue: discoveryCandidateIdentifiers.normalizedValue,
              })
              .from(discoveryCandidateIdentifiers)
              .where(inArray(discoveryCandidateIdentifiers.normalizedValue, normalizedValues));
        const canonicalMatches = canonicalIdentityKeys.length === 0 && canonicalUrls.length === 0
          ? []
          : await transaction
              .select({
                candidateId: discoveryCandidates.id,
                canonicalIdentityKey: discoveryCandidates.canonicalIdentityKey,
                canonicalUrl: discoveryCandidates.canonicalUrl,
              })
              .from(discoveryCandidates)
              .where(or(
                ...(canonicalIdentityKeys.length > 0
                  ? [inArray(discoveryCandidates.canonicalIdentityKey, canonicalIdentityKeys)]
                  : []),
                ...(canonicalUrls.length > 0
                  ? [inArray(discoveryCandidates.canonicalUrl, canonicalUrls)]
                  : []),
              ));
        const matchedCandidateIds = [
          ...new Set([
            ...explicitIds,
            ...identifierMatches.map(({ candidateId }) => candidateId),
            ...canonicalMatches.map(({ candidateId }) => candidateId),
          ]),
        ].sort();
        const lockedCandidates = matchedCandidateIds.length === 0
          ? []
          : await transaction
              .select({ id: discoveryCandidates.id })
              .from(discoveryCandidates)
              .where(inArray(discoveryCandidates.id, matchedCandidateIds))
              .orderBy(discoveryCandidates.id)
              .for("update");
        const existingCandidateIds = new Set(lockedCandidates.map(({ id }) => id));
        const matchesByNormalizedValue = new Map<string, Set<string>>();
        for (const match of identifierMatches) {
          const matches = matchesByNormalizedValue.get(match.normalizedValue) ?? new Set<string>();
          matches.add(match.candidateId);
          matchesByNormalizedValue.set(match.normalizedValue, matches);
        }
        for (const match of canonicalMatches) {
          const separator = match.canonicalIdentityKey.indexOf(":");
          const normalizedValue = separator < 0
            ? match.canonicalIdentityKey
            : match.canonicalIdentityKey.slice(separator + 1);
          const matches = matchesByNormalizedValue.get(normalizedValue) ?? new Set<string>();
          matches.add(match.candidateId);
          matchesByNormalizedValue.set(normalizedValue, matches);
          const urlMatches = matchesByNormalizedValue.get(match.canonicalUrl) ?? new Set<string>();
          urlMatches.add(match.candidateId);
          matchesByNormalizedValue.set(match.canonicalUrl, urlMatches);
        }

        const resolveIdentity = (identity: ReturnType<typeof normalizedIdentity>): string => {
          if (identity.id) {
            if (!existingCandidateIds.has(identity.id)) {
              throw new EcosystemImportRepositoryError("identity_not_found");
            }
            return identity.id;
          }
          const matches = [
            ...(matchesByNormalizedValue.get(identity.normalizedValue ?? "") ?? []),
          ].filter((candidateId) => existingCandidateIds.has(candidateId));
          if (matches.length === 0) {
            throw new EcosystemImportRepositoryError("identity_not_found");
          }
          if (matches.length > 1) {
            throw new EcosystemImportRepositoryError("identity_ambiguous");
          }
          return matches[0]!;
        };

        const resolvedSourceCandidateIds = sourceIdentities.map(resolveIdentity);
        assertUnique(resolvedSourceCandidateIds, "repeated_candidate_identity");

        let targetIdentityIndex = 0;
        const prepared: PreparedCandidate[] = document.candidates.map(
          (candidate, candidateIndex) => {
            const resolvedCandidateId = resolvedSourceCandidateIds[candidateIndex]!;
            const resolvedRelationships = candidate.relationships.map((relationship) => {
              const targetCandidateId = relationship.targetPublicName
                ? null
                : resolveIdentity(targetIdentities[targetIdentityIndex++]!);
              if (targetCandidateId === resolvedCandidateId) {
                throw new EcosystemImportRepositoryError("self_relationship");
              }
              const targetPublicName = targetCandidateId
                ? null
                : relationship.targetPublicName ?? null;
              const evidenceKey = deriveRelationshipEvidenceKey({
                sourceCandidateId: resolvedCandidateId,
                relationshipType: relationship.relationshipType,
                ...(targetCandidateId
                  ? { targetCandidateId }
                  : { targetPublicName: targetPublicName! }),
                evidenceUrl: relationship.evidenceUrl,
                observedAt: relationship.observedAt,
              });
              return {
                ...relationship,
                targetCandidateId,
                targetPublicName,
                evidenceKey,
              };
            });
            return { ...candidate, resolvedCandidateId, resolvedRelationships };
          },
        );
        assertUnique(
          prepared.flatMap((candidate) =>
            candidate.resolvedRelationships.map(({ evidenceKey }) => evidenceKey),
          ),
          "duplicate_relationship_fact",
        );
        assertUnique(
          prepared.flatMap((candidate) =>
            candidate.signals.map((signal) =>
              deriveSignalEvidenceKey({
                candidateId: candidate.resolvedCandidateId,
                signalType: signal.signalType,
                occurredAt: signal.occurredAt,
                sourceUrl: signal.sourceUrl,
              }),
            ),
          ),
          "duplicate_signal_fact",
        );

        const candidateIds = prepared.map(({ resolvedCandidateId }) => resolvedCandidateId);
        const [
          existingClassifications,
          existingHeadquarters,
          existingSignals,
          existingRelationships,
        ] = await Promise.all([
          transaction.select().from(candidateEcosystemClassifications).where(
            inArray(candidateEcosystemClassifications.candidateId, candidateIds),
          ),
          transaction.select().from(candidateHeadquarters).where(
            inArray(candidateHeadquarters.candidateId, candidateIds),
          ),
          transaction.select().from(candidatePublicSignals).where(
            inArray(candidatePublicSignals.candidateId, candidateIds),
          ),
          transaction.select().from(candidateRelationships).where(
            inArray(candidateRelationships.sourceCandidateId, candidateIds),
          ),
        ]);

        const insertedCounts = zeroCounts();
        const updatedCounts = zeroCounts();
        const duplicateCounts = zeroCounts();
        const classificationByKey = new Map(
          existingClassifications.map((row) => [
            `${row.candidateId}\n${row.kind}\n${row.termKey}`,
            row,
          ]),
        );
        const headquartersByCandidate = new Map(
          existingHeadquarters.map((row) => [row.candidateId, row]),
        );
        const signalByKey = new Map(
          existingSignals.map((row) => [row.evidenceKey, row]),
        );
        const relationshipByKey = new Map(
          existingRelationships.map((row) => [row.evidenceKey, row]),
        );

        const classificationRows = prepared.flatMap((candidate) =>
          candidate.classifications.flatMap((classification) => {
            const row = {
              candidateId: candidate.resolvedCandidateId,
              kind: classification.kind,
              termKey: classification.termKey,
              evidenceState: classification.evidenceState,
              confidence: classification.confidence,
              basis: classification.basis,
              sourceUrls: [...classification.sourceUrls],
              createdAt: now,
              updatedAt: now,
            };
            const existing = classificationByKey.get(
              `${row.candidateId}\n${row.kind}\n${row.termKey}`,
            );
            if (!existing) insertedCounts.classifications += 1;
            else if (
              existing.evidenceState === row.evidenceState &&
              existing.confidence === row.confidence &&
              existing.basis === row.basis &&
              sameStrings(existing.sourceUrls, row.sourceUrls)
            ) {
              duplicateCounts.classifications += 1;
              return [];
            } else updatedCounts.classifications += 1;
            return [row];
          }),
        );
        if (classificationRows.length > 0) {
          await transaction.insert(candidateEcosystemClassifications)
            .values(classificationRows)
            .onConflictDoUpdate({
              target: [
                candidateEcosystemClassifications.candidateId,
                candidateEcosystemClassifications.kind,
                candidateEcosystemClassifications.termKey,
              ],
              set: {
                evidenceState: sql`excluded.evidence_state`,
                confidence: sql`excluded.confidence`,
                basis: sql`excluded.basis`,
                sourceUrls: sql`excluded.source_urls`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }

        const headquartersRows = prepared.flatMap((candidate) => {
          const headquarters = candidate.headquarters;
          if (!headquarters) return [];
          const row = {
            candidateId: candidate.resolvedCandidateId,
            countryCode: headquarters.countryCode,
            stateKey: headquarters.stateKey,
            stateLabel: headquarters.stateLabel,
            cityKey: headquarters.cityKey,
            cityLabel: headquarters.cityLabel,
            latitudeMicrodegrees: latitudeMicrodegrees(headquarters.latitude),
            longitudeMicrodegrees: latitudeMicrodegrees(headquarters.longitude),
            evidenceState: headquarters.evidenceState,
            confidence: headquarters.confidence,
            sourceUrls: [...headquarters.sourceUrls],
            createdAt: now,
            updatedAt: now,
          };
          const existing = headquartersByCandidate.get(row.candidateId);
          if (!existing) insertedCounts.headquarters += 1;
          else if (
            existing.countryCode === row.countryCode &&
            existing.stateKey === row.stateKey &&
            existing.stateLabel === row.stateLabel &&
            existing.cityKey === row.cityKey &&
            existing.cityLabel === row.cityLabel &&
            existing.latitudeMicrodegrees === row.latitudeMicrodegrees &&
            existing.longitudeMicrodegrees === row.longitudeMicrodegrees &&
            existing.evidenceState === row.evidenceState &&
            existing.confidence === row.confidence &&
            sameStrings(existing.sourceUrls, row.sourceUrls)
          ) {
            duplicateCounts.headquarters += 1;
            return [];
          } else updatedCounts.headquarters += 1;
          return [row];
        });
        if (headquartersRows.length > 0) {
          await transaction.insert(candidateHeadquarters).values(headquartersRows)
            .onConflictDoUpdate({
              target: candidateHeadquarters.candidateId,
              set: {
                countryCode: sql`excluded.country_code`,
                stateKey: sql`excluded.state_key`,
                stateLabel: sql`excluded.state_label`,
                cityKey: sql`excluded.city_key`,
                cityLabel: sql`excluded.city_label`,
                latitudeMicrodegrees: sql`excluded.latitude_microdegrees`,
                longitudeMicrodegrees: sql`excluded.longitude_microdegrees`,
                evidenceState: sql`excluded.evidence_state`,
                confidence: sql`excluded.confidence`,
                sourceUrls: sql`excluded.source_urls`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }

        const signalRows = prepared.flatMap((candidate) =>
          candidate.signals.flatMap((signal) => {
            const row = {
              candidateId: candidate.resolvedCandidateId,
              signalType: signal.signalType,
              title: signal.title,
              occurredAt: new Date(signal.occurredAt),
              expiresAt: signal.expiresAt ? new Date(signal.expiresAt) : null,
              sourceUrl: signal.sourceUrl,
              confidence: signal.confidence,
              evidenceKey: deriveSignalEvidenceKey({
                candidateId: candidate.resolvedCandidateId,
                signalType: signal.signalType,
                occurredAt: signal.occurredAt,
                sourceUrl: signal.sourceUrl,
              }),
              createdAt: now,
              updatedAt: now,
            };
            const existing = signalByKey.get(row.evidenceKey);
            if (!existing) insertedCounts.signals += 1;
            else if (
              existing.candidateId === row.candidateId &&
              existing.signalType === row.signalType &&
              existing.title === row.title &&
              sameDate(existing.occurredAt, row.occurredAt) &&
              sameDate(existing.expiresAt, row.expiresAt) &&
              existing.sourceUrl === row.sourceUrl &&
              existing.confidence === row.confidence
            ) {
              duplicateCounts.signals += 1;
              return [];
            } else updatedCounts.signals += 1;
            return [row];
          }),
        );
        if (signalRows.length > 0) {
          await transaction.insert(candidatePublicSignals).values(signalRows)
            .onConflictDoUpdate({
              target: candidatePublicSignals.evidenceKey,
              set: {
                candidateId: sql`excluded.candidate_id`,
                signalType: sql`excluded.signal_type`,
                title: sql`excluded.title`,
                occurredAt: sql`excluded.occurred_at`,
                expiresAt: sql`excluded.expires_at`,
                sourceUrl: sql`excluded.source_url`,
                confidence: sql`excluded.confidence`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }

        const relationshipRows = prepared.flatMap((candidate) =>
          candidate.resolvedRelationships.flatMap((relationship) => {
            const row = {
              sourceCandidateId: candidate.resolvedCandidateId,
              targetCandidateId: relationship.targetCandidateId,
              targetPublicName: relationship.targetPublicName,
              relationshipType: relationship.relationshipType,
              evidenceUrl: relationship.evidenceUrl,
              confidence: relationship.confidence,
              observedAt: relationship.observedAt
                ? new Date(relationship.observedAt)
                : null,
              evidenceKey: relationship.evidenceKey,
              createdAt: now,
              updatedAt: now,
            };
            const existing = relationshipByKey.get(row.evidenceKey);
            if (!existing) insertedCounts.relationships += 1;
            else if (
              existing.sourceCandidateId === row.sourceCandidateId &&
              existing.targetCandidateId === row.targetCandidateId &&
              existing.targetPublicName === row.targetPublicName &&
              existing.relationshipType === row.relationshipType &&
              existing.evidenceUrl === row.evidenceUrl &&
              existing.confidence === row.confidence &&
              sameDate(existing.observedAt, row.observedAt)
            ) {
              duplicateCounts.relationships += 1;
              return [];
            } else updatedCounts.relationships += 1;
            return [row];
          }),
        );
        if (relationshipRows.length > 0) {
          await transaction.insert(candidateRelationships).values(relationshipRows)
            .onConflictDoUpdate({
              target: candidateRelationships.evidenceKey,
              set: {
                sourceCandidateId: sql`excluded.source_candidate_id`,
                targetCandidateId: sql`excluded.target_candidate_id`,
                targetPublicName: sql`excluded.target_public_name`,
                relationshipType: sql`excluded.relationship_type`,
                evidenceUrl: sql`excluded.evidence_url`,
                confidence: sql`excluded.confidence`,
                observedAt: sql`excluded.observed_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }

        return {
          candidatesResolved: prepared.length,
          insertedCounts,
          updatedCounts,
          duplicateCounts,
          unresolvedCount: prepared.reduce(
            (count, candidate) =>
              count + candidate.resolvedRelationships.filter(
                ({ targetCandidateId }) => targetCandidateId === null,
              ).length,
            0,
          ),
        };
      });
    },
  };
}
