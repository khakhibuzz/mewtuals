import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDiscoveryService } from "../app/server/discovery";
import { getEcosystemIntelligenceService } from "../app/server/ecosystem-intelligence";
import { getOpportunityBriefService } from "../app/server/opportunity-brief";
import { getCurrentSession } from "../app/server/session";
import { getVerificationService } from "../app/server/verification";
import { createAuthRepository } from "../db/repositories/auth-repository";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import { createEcosystemIntelligenceRepository } from "../db/repositories/ecosystem-intelligence-repository";
import { createOpportunityBriefRepository } from "../db/repositories/opportunity-brief-repository";
import { createVerificationRepository } from "../db/repositories/verification-repository";

const mocks = vi.hoisted(() => ({
  createAuthService: vi.fn(() => ({ getSession: vi.fn(async () => null) })),
  createDiscoveryService: vi.fn((dependencies: unknown) => ({ dependencies })),
  createEcosystemIntelligenceService: vi.fn((dependencies: unknown) => ({ dependencies })),
  createOpportunityBriefService: vi.fn((dependencies: unknown) => ({ dependencies })),
  createVerificationService: vi.fn((dependencies: unknown) => ({ dependencies })),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../db/repositories/auth-repository", () => ({
  createAuthRepository: vi.fn(() => ({ kind: "auth-repository" })),
}));
vi.mock("../db/repositories/discovery-repository", () => ({
  createDiscoveryRepository: vi.fn(() => ({ kind: "discovery-repository" })),
}));
vi.mock("../db/repositories/ecosystem-intelligence-repository", () => ({
  createEcosystemIntelligenceRepository: vi.fn(() => ({ kind: "ecosystem-repository" })),
}));
vi.mock("../db/repositories/opportunity-brief-repository", () => ({
  createOpportunityBriefRepository: vi.fn(() => ({ kind: "opportunity-repository" })),
}));
vi.mock("../db/repositories/verification-repository", () => ({
  createVerificationRepository: vi.fn(() => ({ kind: "verification-repository" })),
}));
vi.mock("../app/server/auth-service", () => ({
  createAuthService: mocks.createAuthService,
}));
vi.mock("../app/server/discovery-service", () => ({
  createDiscoveryService: mocks.createDiscoveryService,
}));
vi.mock("../app/server/ecosystem-intelligence-service", () => ({
  createEcosystemIntelligenceService: mocks.createEcosystemIntelligenceService,
}));
vi.mock("../app/server/opportunity-brief-service", () => ({
  createOpportunityBriefService: mocks.createOpportunityBriefService,
}));
vi.mock("../app/server/verification-service", () => ({
  createVerificationService: mocks.createVerificationService,
}));
vi.mock("../app/server/discovery-config", () => ({
  readDiscoveryConfig: vi.fn(() => ({ workerSecret: "discovery-worker-secret" })),
}));
vi.mock("../app/server/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("../app/server/env")>(),
  readServerEnvironment: vi.fn(() => ({
    environment: "test",
    sessionSecret: "test-session-secret-that-is-longer-than-32-characters",
    adminEmails: ["admin@example.com"],
    developmentAuthEnabled: false,
  })),
}));
vi.mock("../app/server/email", () => ({
  createEmailSender: vi.fn(),
  createOpportunityBriefAcknowledgementSender: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("administrator service database composition", () => {
  it("passes an explicit database to the session repository", async () => {
    const database = { service: "session" } as never;
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(() => ({ value: "session-token" })),
    } as never);

    await getCurrentSession(database);

    expect(createAuthRepository).toHaveBeenCalledWith(database);
  });

  it("passes an explicit database to the verification repository", () => {
    const database = { service: "verification" } as never;

    getVerificationService(database);

    expect(createVerificationRepository).toHaveBeenCalledWith(database);
  });

  it("bypasses a cached Discovery service for an explicit database", () => {
    const cached = getDiscoveryService();
    const database = { service: "discovery" } as never;

    const explicit = getDiscoveryService(database);

    expect(explicit).not.toBe(cached);
    expect(createDiscoveryRepository).toHaveBeenLastCalledWith(database);
    expect(getDiscoveryService()).toBe(cached);
  });

  it("bypasses a cached Ecosystem Intelligence service for an explicit database", () => {
    const cached = getEcosystemIntelligenceService();
    const database = { service: "ecosystem" } as never;

    const explicit = getEcosystemIntelligenceService(database);

    expect(explicit).not.toBe(cached);
    expect(createEcosystemIntelligenceRepository).toHaveBeenLastCalledWith(database);
    expect(getEcosystemIntelligenceService()).toBe(cached);
  });

  it("passes an explicit database to the Opportunity Brief repository", () => {
    const database = { service: "opportunity" } as never;

    getOpportunityBriefService(database);

    expect(createOpportunityBriefRepository).toHaveBeenCalledWith(database);
  });
});
