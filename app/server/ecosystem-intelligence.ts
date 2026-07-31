import { createEcosystemIntelligenceRepository } from "../../db/repositories/ecosystem-intelligence-repository";
import { readServerEnvironment } from "./env";
import {
  createEcosystemIntelligenceService,
  type EcosystemIntelligenceService,
} from "./ecosystem-intelligence-service";

let service: EcosystemIntelligenceService | undefined;

export function shouldCacheEcosystemIntelligenceService(runtime: object): boolean {
  return !("Cloudflare" in runtime);
}

export function getEcosystemIntelligenceService(): EcosystemIntelligenceService {
  const shouldCache = shouldCacheEcosystemIntelligenceService(globalThis);
  if (shouldCache && service) return service;

  const environment = readServerEnvironment();
  const nextService = createEcosystemIntelligenceService({
    repository: createEcosystemIntelligenceRepository(),
    adminEmails: environment.adminEmails,
    now: () => new Date(),
  });
  if (shouldCache) service = nextService;
  return nextService;
}
