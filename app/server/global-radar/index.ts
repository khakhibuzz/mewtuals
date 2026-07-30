import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getDb, type MewtualsDatabase } from "../../../db";
import { createGlobalRadarAdminRepository } from "../../../db/repositories/global-radar-admin-repository";
import { createGlobalRadarPromotionRepository } from "../../../db/repositories/global-radar-promotion-repository";
import { createGlobalRadarRepository } from "../../../db/repositories/global-radar-repository";
import {
  GLOBAL_RADAR_SCORE_VERSION,
  globalRadarValidationProposalSchema,
  validateGlobalRadarBatch,
} from "../../domain/global-radar";
import { readServerEnvironment } from "../env";
import {
  createGlobalRadarAdminService,
  type GlobalRadarAdminRepositoryPort,
} from "./admin-service";
import {
  readGlobalRadarConfig,
  type GlobalRadarConfig,
} from "./config";
import {
  createGlobalRadarPromotionService,
  type GlobalRadarPromotionRepositoryPort,
} from "./promotion-service";
import {
  createGlobalRadarRunService,
  type GlobalRadarBatchValidatorPort,
  type GlobalRadarPlanningContext,
  type GlobalRadarRunRepositoryPort,
} from "./run-service";
import { hashGlobalRadarLeaseToken } from "./worker-auth";

export type GlobalRadarApplicationDependencies = Readonly<{
  config: GlobalRadarConfig;
  adminEmails: readonly string[];
  runRepository: GlobalRadarRunRepositoryPort;
  adminRepository: GlobalRadarAdminRepositoryPort;
  promotionRepository: GlobalRadarPromotionRepositoryPort;
  validateBatch: GlobalRadarBatchValidatorPort;
  workerOutputSchema: Readonly<Record<string, unknown>>;
  loadPlanningContext(input: {
    now: Date;
    scanMode: "daily" | "thematic" | "watchlist_refresh" | "manual";
  }): Promise<GlobalRadarPlanningContext>;
  now?: () => Date;
}>;

export function createGlobalRadarApplication(
  dependencies: GlobalRadarApplicationDependencies,
) {
  const promotion = createGlobalRadarPromotionService({
    repository: dependencies.promotionRepository,
    adminEmails: dependencies.adminEmails,
    thresholds: dependencies.config.thresholds,
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    now: dependencies.now,
  });
  const run = createGlobalRadarRunService({
    repository: dependencies.runRepository,
    config: dependencies.config,
    adminEmails: dependencies.adminEmails,
    validateBatch: dependencies.validateBatch,
    workerOutputSchema: dependencies.workerOutputSchema,
    loadPlanningContext: dependencies.loadPlanningContext,
    now: dependencies.now,
  });
  const admin = createGlobalRadarAdminService({
    repository: dependencies.adminRepository,
    adminEmails: dependencies.adminEmails,
    queueManualRun: ({ actor, input }) => run.queueManual(actor, input),
    promote: ({ actor, input }) => promotion.promote(actor, input),
    reversePromotion: ({ actor, input }) =>
      promotion.reversePromotion(actor, input),
    now: dependencies.now,
  });
  return Object.freeze({ run, admin, promotion });
}

export type GlobalRadarApplication = ReturnType<
  typeof createGlobalRadarApplication
>;

export function shouldCacheGlobalRadarApplication(runtime: object): boolean {
  return !("Cloudflare" in runtime);
}

let cachedApplication: GlobalRadarApplication | undefined;

function createConcreteRunRepository(
  database: MewtualsDatabase,
  config: GlobalRadarConfig,
  issueLeaseToken: () => string,
) {
  return createGlobalRadarRepository(database, {
    issueLeaseToken,
    hashLeaseToken: (token) =>
      hashGlobalRadarLeaseToken(config.workerSecret, token),
  });
}

function concreteAdminPort(
  database: MewtualsDatabase,
  config: GlobalRadarConfig,
): GlobalRadarAdminRepositoryPort {
  const repository = createGlobalRadarAdminRepository(database, {
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    thresholds: config.thresholds,
  });
  repository satisfies GlobalRadarAdminRepositoryPort;
  return repository;
}

function deepFreezeJson<Value>(value: Value): Value {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreezeJson);
  }
  return value;
}

export const GLOBAL_RADAR_WORKER_OUTPUT_SCHEMA = deepFreezeJson(
  z.toJSONSchema(globalRadarValidationProposalSchema, {
    io: "input",
  }) as Record<string, unknown>,
);

export type GlobalRadarApplicationCompositionOptions = Readonly<{
  database: MewtualsDatabase;
  config: GlobalRadarConfig;
  adminEmails: readonly string[];
  now?: () => Date;
  issueLeaseToken?: () => string;
}>;

export function createGlobalRadarApplicationDependencies(
  options: GlobalRadarApplicationCompositionOptions,
): GlobalRadarApplicationDependencies {
  const runRepository = createConcreteRunRepository(
    options.database,
    options.config,
    options.issueLeaseToken ?? (() => randomBytes(32).toString("hex")),
  );
  const validateBatch: GlobalRadarBatchValidatorPort = (batch, context) =>
    validateGlobalRadarBatch(batch, {
      clock: { now: () => new Date(context.now.getTime()) },
      expectedRunId: context.runId,
      qualificationThresholds: {
        directDemand: context.config.thresholds.direct_demand,
        precursor: context.config.thresholds.demand_precursor,
        momentum: context.config.thresholds.ecosystem_momentum,
      },
    });
  return Object.freeze({
    config: options.config,
    adminEmails: [...options.adminEmails],
    runRepository,
    adminRepository: concreteAdminPort(options.database, options.config),
    promotionRepository: createGlobalRadarPromotionRepository(
      options.database,
      {
        scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
        thresholds: options.config.thresholds,
      },
    ),
    validateBatch,
    workerOutputSchema: GLOBAL_RADAR_WORKER_OUTPUT_SCHEMA,
    loadPlanningContext: (input) =>
      runRepository.loadPlanningContext(input),
    now: options.now,
  });
}

export type GlobalRadarApplicationRuntimeOptions = Readonly<{
  database?: MewtualsDatabase;
  config?: GlobalRadarConfig;
  adminEmails?: readonly string[];
  now?: () => Date;
  issueLeaseToken?: () => string;
}>;

export function getGlobalRadarApplication(
  options: GlobalRadarApplicationRuntimeOptions = {},
): GlobalRadarApplication {
  const cache = shouldCacheGlobalRadarApplication(globalThis);
  if (cache && cachedApplication) return cachedApplication;
  const config = options.config ?? readGlobalRadarConfig();
  const database = options.database ?? getDb();
  const dependencies = createGlobalRadarApplicationDependencies({
    database,
    config,
    adminEmails: options.adminEmails ?? readServerEnvironment().adminEmails,
    now: options.now,
    issueLeaseToken: options.issueLeaseToken,
  });
  const next = createGlobalRadarApplication(dependencies);
  if (cache) cachedApplication = next;
  return next;
}
