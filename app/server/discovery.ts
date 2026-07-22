import { createDiscoveryRepository } from "../../db/repositories/discovery-repository";
import { readDiscoveryConfig } from "./discovery-config";
import {
  createDiscoveryService,
  type DiscoveryService,
} from "./discovery-service";
import { readServerEnvironment } from "./env";

let service: DiscoveryService | undefined;

export function shouldCacheDiscoveryService(runtime: object): boolean {
  return !("Cloudflare" in runtime);
}

export function getDiscoveryService(): DiscoveryService {
  const cacheService = shouldCacheDiscoveryService(globalThis);
  if (cacheService && service) return service;

  const environment = readServerEnvironment();
  const config = readDiscoveryConfig();
  if (!config.workerSecret) {
    throw new Error(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required for the worker protocol.",
    );
  }
  const nextService = createDiscoveryService({
    repository: createDiscoveryRepository(),
    adminEmails: environment.adminEmails,
    workerSecret: config.workerSecret,
    config,
  });
  if (cacheService) service = nextService;
  return nextService;
}
