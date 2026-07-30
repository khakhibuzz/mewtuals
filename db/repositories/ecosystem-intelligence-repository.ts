import { getDb, type MewtualsDatabase } from "../client";
import {
  loadCandidateDetail,
  loadEcosystemActivity,
} from "./ecosystem-intelligence-activity-queries";
import { loadEcosystemOverview } from "./ecosystem-intelligence-overview-queries";
import {
  loadValidPublicContactCandidateIds,
  loadValidPublicRelationshipEvidenceIds,
  loadValidPublicSignalEvidenceIds,
} from "./ecosystem-intelligence-query";
import type { EcosystemIntelligenceRepository } from "./ecosystem-intelligence-types";

export type {
  CountMetric,
  CountOption,
  EcosystemCandidateDetail,
  EcosystemClassificationDto,
  EcosystemHeadquartersDto,
  EcosystemIntelligenceRepository,
  EcosystemLedgerRow,
  EcosystemRelationshipDto,
  EcosystemResearchVersionDto,
  EcosystemSignalDto,
  EcosystemSnapshot,
  ExplorerGroup,
  MatrixCell,
  RatioMetric,
} from "./ecosystem-intelligence-types";

function ensureValidNow(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Ecosystem Intelligence query clock must be a valid Date.");
  }
}

export function createEcosystemIntelligenceRepository(
  database: MewtualsDatabase = getDb(),
): EcosystemIntelligenceRepository {
  return {
    async getSnapshot(filters, now) {
      ensureValidNow(now);
      return database.transaction(async (transaction) => {
        const validPublicContactCandidateIds = await loadValidPublicContactCandidateIds(
          transaction,
          filters.analysisVersion,
        );
        const validPublicRelationshipEvidenceIds = await loadValidPublicRelationshipEvidenceIds(
          transaction,
        );
        const validPublicSignalEvidenceIds = await loadValidPublicSignalEvidenceIds(transaction);
        const overview = await loadEcosystemOverview(
          transaction,
          filters,
          now,
          validPublicContactCandidateIds,
          validPublicRelationshipEvidenceIds,
          validPublicSignalEvidenceIds,
        );
        const activity = await loadEcosystemActivity(
          transaction,
          filters,
          now,
          validPublicContactCandidateIds,
          validPublicRelationshipEvidenceIds,
          validPublicSignalEvidenceIds,
          overview.population.total,
        );

        return {
          generatedAt: new Date(now),
          filters,
          ...overview,
          ...activity,
        };
      }, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },

    async getCandidateDetail(candidateId, now, researchOffset = 0) {
      ensureValidNow(now);
      if (!Number.isInteger(researchOffset) || researchOffset < 0) {
        throw new Error("Research history offset must be a non-negative integer.");
      }
      return database.transaction(async (transaction) => {
        const validPublicRelationshipEvidenceIds = await loadValidPublicRelationshipEvidenceIds(
          transaction,
          candidateId,
        );
        const validPublicSignalEvidenceIds = await loadValidPublicSignalEvidenceIds(
          transaction,
          candidateId,
        );
        return loadCandidateDetail(
          transaction,
          candidateId,
          now,
          validPublicRelationshipEvidenceIds,
          validPublicSignalEvidenceIds,
          researchOffset,
        );
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
  };
}
