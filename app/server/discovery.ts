import { createDiscoveryRepository } from "../../db/repositories/discovery-repository";
import { readDiscoveryConfig } from "./discovery-config";
import {
  createDiscoveryService,
  type DiscoveryService,
} from "./discovery-service";
import { readServerEnvironment } from "./env";

let service: DiscoveryService | undefined;

export function getDiscoveryService(): DiscoveryService {
  if (service) return service;

  const environment = readServerEnvironment();
  const config = readDiscoveryConfig();
  if (!config.workerSecret) {
    throw new Error(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required for the worker protocol.",
    );
  }
  service = createDiscoveryService({
    repository: createDiscoveryRepository(),
    adminEmails: environment.adminEmails,
    workerSecret: config.workerSecret,
    config,
  });
  return service;
}
