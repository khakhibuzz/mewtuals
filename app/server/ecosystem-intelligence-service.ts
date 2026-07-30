import { z } from "zod";

import {
  filtersFromSearchParams,
  type EcosystemFilters,
} from "../domain/ecosystem-intelligence";
import type {
  EcosystemCandidateDetail,
  EcosystemIntelligenceRepository,
  EcosystemSnapshot,
} from "../../db/repositories/ecosystem-intelligence-repository";

export type EcosystemIntelligenceActor = {
  userId: string;
  email: string;
};

export type EcosystemFilterInput =
  | URLSearchParams
  | Record<string, string | readonly string[] | undefined>;

export type EcosystemIntelligenceFailure = {
  ok: false;
  status: 400 | 403 | 404 | 500;
  error: string;
};

type Dependencies = {
  repository: EcosystemIntelligenceRepository;
  adminEmails: readonly string[];
  now?: () => Date;
};

const candidateIdSchema = z.uuid();
const researchOffsetSchema = z.coerce.number().int().min(0).max(100_000);

const administratorFailure = (): EcosystemIntelligenceFailure => ({
  ok: false,
  status: 403,
  error: "Administrator access is required.",
});

const unexpectedFailure = (): EcosystemIntelligenceFailure => ({
  ok: false,
  status: 500,
  error: "We could not load Ecosystem Intelligence. Please try again.",
});

export function createEcosystemIntelligenceService(dependencies: Dependencies) {
  const currentTime = dependencies.now ?? (() => new Date());
  const administrators = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );

  function isAdministrator(actor: EcosystemIntelligenceActor): boolean {
    return administrators.has(actor.email.trim().toLowerCase());
  }

  function parseFilters(input: EcosystemFilterInput):
    | { ok: true; filters: EcosystemFilters }
    | EcosystemIntelligenceFailure {
    try {
      return { ok: true, filters: filtersFromSearchParams(input) };
    } catch {
      return {
        ok: false,
        status: 400,
        error: "Review the Ecosystem Intelligence filters.",
      };
    }
  }

  return {
    isAdministrator,

    async getSnapshot(
      actor: EcosystemIntelligenceActor,
      input: EcosystemFilterInput,
    ): Promise<
      | { ok: true; filters: EcosystemFilters; snapshot: EcosystemSnapshot }
      | EcosystemIntelligenceFailure
    > {
      if (!isAdministrator(actor)) return administratorFailure();
      const parsed = parseFilters(input);
      if (!parsed.ok) return parsed;
      try {
        const snapshot = await dependencies.repository.getSnapshot(
          parsed.filters,
          currentTime(),
        );
        return { ok: true, filters: parsed.filters, snapshot };
      } catch {
        return unexpectedFailure();
      }
    },

    async getCandidateDetail(
      actor: EcosystemIntelligenceActor,
      candidateId: string,
      researchOffsetInput: string | number | undefined = 0,
    ): Promise<
      | { ok: true; candidate: EcosystemCandidateDetail }
      | EcosystemIntelligenceFailure
    > {
      if (!isAdministrator(actor)) return administratorFailure();
      const parsedId = candidateIdSchema.safeParse(candidateId);
      if (!parsedId.success) {
        return {
          ok: false,
          status: 400,
          error: "Submit a valid candidate id.",
        };
      }
      const parsedOffset = researchOffsetSchema.safeParse(researchOffsetInput);
      if (!parsedOffset.success) {
        return {
          ok: false,
          status: 400,
          error: "Submit a valid research history offset.",
        };
      }
      try {
        const candidate = await dependencies.repository.getCandidateDetail(
          parsedId.data,
          currentTime(),
          parsedOffset.data,
        );
        return candidate
          ? { ok: true, candidate }
          : {
              ok: false,
              status: 404,
              error: "Ecosystem Intelligence candidate was not found.",
            };
      } catch {
        return unexpectedFailure();
      }
    },
  };
}

export type EcosystemIntelligenceService = ReturnType<
  typeof createEcosystemIntelligenceService
>;
