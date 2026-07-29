import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_ECOSYSTEM_FILTERS,
  parseEcosystemFilters,
  type EcosystemFilters,
} from "../app/domain/ecosystem-intelligence";
import { closeDb, getDb } from "../db/client";
import {
  createEcosystemIntelligenceRepository,
  type EcosystemSnapshot,
} from "../db/repositories/ecosystem-intelligence-repository";
import {
  candidateEcosystemClassifications,
  candidateHeadquarters,
  candidatePublicSignals,
  candidateRelationships,
  candidateResearchVersions,
  discoveryCandidateSources,
  discoveryCandidates,
  discoveryRuns,
  opportunityBriefRequests,
} from "../db/schema";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

const database = getDb();
const repository = createEcosystemIntelligenceRepository(database);
const testId = randomUUID();
const compactTestId = testId.replaceAll("-", "");
const testGeography = `Ecosystem repository ${testId}`;
const now = new Date("2026-07-29T12:00:00.000Z");
const recent = new Date("2026-07-27T12:00:00.000Z");
const stale = new Date("2025-01-01T12:00:00.000Z");
const longSummary = "Public Physical AI systems context and market evidence. ".repeat(3);
const longFindings = "Public evidence describes inputs, transformations, outputs, buyer types, supplier types, and the current systems context without inventing private facts. ".repeat(8);

type FixtureCandidate = Awaited<ReturnType<typeof createCandidate>>;
type CoreFixture = {
  physicalRunId: string;
  generalRunId: string;
  componentMaker: FixtureCandidate;
  unknownCompany: FixtureCandidate;
  rejectedCompany: FixtureCandidate;
  creatorEnabler: FixtureCandidate;
  laterGeneralCompany: FixtureCandidate;
  generalOnlyCompany: FixtureCandidate;
};

let fixture: CoreFixture;

function publicUrl(suffix: string): string {
  return `https://${suffix}-${compactTestId}.example`;
}

async function assertTestDatabase(): Promise<void> {
  const [current] = await database.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (current?.databaseName !== "mewtuals_test") {
    throw new Error(`Refusing Ecosystem repository cleanup in ${current?.databaseName ?? "an unknown database"}.`);
  }
}

async function createRun(
  suffix: string,
  campaignKey: string,
  createdAt: Date,
): Promise<string> {
  const [run] = await database.insert(discoveryRuns).values({
    externalRunKey: `ecosystem-repository-${testId}-${suffix}-${randomUUID()}`,
    campaignKey,
    trigger: "manual",
    status: "succeeded",
    startedAt: createdAt,
    completedAt: createdAt,
    geography: testGeography,
    candidateType: "both",
    sourcesUsed: ["repository-integration"],
    requestedCount: 50,
    companyPercentage: 80,
    foundCount: 1,
    newCount: 1,
    createdAt,
    updatedAt: createdAt,
  }).returning({ id: discoveryRuns.id });
  if (!run) throw new Error("Fixture Discovery run was not created.");
  return run.id;
}

async function createCandidate(input: {
  suffix: string;
  runId: string;
  type?: "company" | "creator";
  name?: string;
  category?: string;
  status?: "discovered" | "shortlisted" | "rejected" | "queued_for_profile";
  score?: number;
  discoveredAt?: Date;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  primarySocialUrl?: string | null;
  research?: boolean;
  researchAt?: Date;
  source?: boolean;
  sourceAt?: Date;
}) {
  const canonicalUrl = publicUrl(input.suffix);
  const type = input.type ?? "company";
  const discoveredAt = input.discoveredAt ?? recent;
  const [candidate] = await database.insert(discoveryCandidates).values({
    type,
    name: input.name ?? `Repository ${input.suffix}`,
    normalizedName: (input.name ?? `Repository ${input.suffix}`).toLowerCase(),
    canonicalIdentityKey: `website_host:${input.suffix}-${compactTestId}.example`,
    canonicalUrl,
    websiteUrl: input.websiteUrl === undefined ? canonicalUrl : input.websiteUrl,
    linkedinUrl: input.linkedinUrl ?? null,
    primarySocialUrl: input.primarySocialUrl ?? null,
    discoveredDescription: "Publicly evidenced Physical AI candidate used by the repository integration contract.",
    category: input.category ?? "unregistered fixture category",
    geography: testGeography,
    firstSourceName: "repository-integration",
    firstSourceUrl: `${canonicalUrl}/first-source`,
    discoveredAt,
    lastSeenAt: input.sourceAt ?? discoveredAt,
    mostRecentRunId: input.runId,
    discoveryScore: input.score ?? 70,
    status: input.status ?? "discovered",
    createdAt: discoveredAt,
    updatedAt: discoveredAt,
  }).returning();
  if (!candidate) throw new Error("Fixture Discovery candidate was not created.");

  if (input.research !== false) {
    await database.insert(candidateResearchVersions).values({
      candidateId: candidate.id,
      discoveryRunId: input.runId,
      summary: longSummary,
      findings: longFindings,
      sourceUrls: [`${canonicalUrl}/research`],
      analysisVersion: "physical-ai-v1",
      createdAt: input.researchAt ?? discoveredAt,
    });
  }
  if (input.source !== false) {
    await database.insert(discoveryCandidateSources).values({
      candidateId: candidate.id,
      discoveryRunId: input.runId,
      sourceName: "repository-integration",
      sourceUrl: `${canonicalUrl}/source`,
      firstSeenAt: input.sourceAt ?? discoveredAt,
      lastSeenAt: input.sourceAt ?? discoveredAt,
      createdAt: input.sourceAt ?? discoveredAt,
    });
  }
  return candidate;
}

async function seedCoreFixture(): Promise<CoreFixture> {
  const physicalRunId = await createRun("physical", "robotics_hardware_india", recent);
  const generalRunId = await createRun("general", "general_discovery", recent);
  const componentMaker = await createCandidate({
    suffix: "component-maker",
    runId: physicalRunId,
    name: "Aster Components",
    category: "components and actuation",
    status: "shortlisted",
    score: 92,
    websiteUrl: publicUrl("component-maker-site"),
    discoveredAt: recent,
    researchAt: recent,
    sourceAt: recent,
  });
  const unknownCompany = await createCandidate({
    suffix: "unknown-company",
    runId: physicalRunId,
    name: "Blank Systems",
    category: "unregistered fixture category",
    score: 45,
    websiteUrl: null,
    discoveredAt: stale,
    researchAt: stale,
    sourceAt: stale,
  });
  const rejectedCompany = await createCandidate({
    suffix: "rejected-company",
    runId: physicalRunId,
    name: "Closed Robotics",
    category: "electronics and compute",
    status: "rejected",
    score: 82,
    websiteUrl: null,
    linkedinUrl: publicUrl("rejected-linkedin"),
    discoveredAt: stale,
    researchAt: stale,
    sourceAt: stale,
  });
  const creatorEnabler = await createCandidate({
    suffix: "creator-enabler",
    runId: physicalRunId,
    type: "creator",
    name: "Deep Robotics Media",
    category: "research and ecosystem support",
    status: "queued_for_profile",
    score: 75,
    websiteUrl: null,
    primarySocialUrl: publicUrl("creator-social"),
    discoveredAt: stale,
    researchAt: stale,
    sourceAt: stale,
  });
  const laterGeneralCompany = await createCandidate({
    suffix: "later-general",
    runId: generalRunId,
    name: "Evergreen Robotics",
    category: "robot makers and integrators",
    status: "queued_for_profile",
    score: 72,
    websiteUrl: publicUrl("later-general-site"),
    discoveredAt: recent,
    research: false,
    sourceAt: recent,
  });
  await database.insert(candidateResearchVersions).values({
    candidateId: laterGeneralCompany.id,
    discoveryRunId: physicalRunId,
    summary: longSummary,
    findings: longFindings,
    sourceUrls: [`${laterGeneralCompany.canonicalUrl}/physical-research`],
    analysisVersion: "physical-ai-v1",
    createdAt: recent,
  });
  await database.update(discoveryCandidateSources).set({
    discoveryRunId: generalRunId,
  }).where(eq(discoveryCandidateSources.candidateId, laterGeneralCompany.id));
  const generalOnlyCompany = await createCandidate({
    suffix: "general-only",
    runId: generalRunId,
    name: "General Only Labs",
    category: "robot makers and integrators",
    research: false,
    discoveredAt: recent,
    sourceAt: recent,
  });

  await database.insert(candidateEcosystemClassifications).values([
    {
      candidateId: componentMaker.id,
      kind: "ecosystem_role",
      termKey: "component_supplier",
      evidenceState: "evidence_backed",
      confidence: 95,
      basis: "The public product catalogue documents supplied components.",
      sourceUrls: [`${componentMaker.canonicalUrl}/catalogue`],
      createdAt: recent,
      updatedAt: recent,
    },
    ...[
      ["ecosystem_domain", "hardware"],
      ["organisation_subtype", "manufacturer"],
      ["business_stage", "component_manufacturing"],
      ["technical_layer", "mechanical_and_actuation"],
      ["capability", "motion_control"],
      ["component_category", "actuators"],
      ["robotics_vertical", "industrial_robotics"],
    ].map(([kind, termKey]) => ({
      candidateId: componentMaker.id,
      kind,
      termKey,
      evidenceState: "evidence_backed",
      confidence: 90,
      basis: `Public evidence supports ${termKey}.`,
      sourceUrls: [`${componentMaker.canonicalUrl}/${termKey}`],
      createdAt: recent,
      updatedAt: recent,
    })),
    {
      candidateId: creatorEnabler.id,
      kind: "organisation_subtype",
      termKey: "ecosystem_enabler",
      evidenceState: "evidence_backed",
      confidence: 90,
      basis: "The public channel supports ecosystem research and education.",
      sourceUrls: [`${creatorEnabler.canonicalUrl}/about`],
      createdAt: stale,
      updatedAt: stale,
    },
  ]);

  await database.insert(candidateHeadquarters).values([
    {
      candidateId: componentMaker.id,
      countryCode: "IN",
      stateKey: "karnataka",
      stateLabel: "Karnataka",
      cityKey: "bengaluru",
      cityLabel: "Bengaluru",
      latitudeMicrodegrees: 12_971_600,
      longitudeMicrodegrees: 77_594_600,
      evidenceState: "evidence_backed",
      confidence: 95,
      sourceUrls: [`${componentMaker.canonicalUrl}/contact`],
      createdAt: recent,
      updatedAt: recent,
    },
    {
      candidateId: rejectedCompany.id,
      countryCode: "IN",
      stateKey: "delhi",
      stateLabel: "Delhi",
      cityKey: "delhi",
      cityLabel: "Delhi",
      evidenceState: "evidence_backed",
      confidence: 85,
      sourceUrls: [`${rejectedCompany.canonicalUrl}/contact`],
      createdAt: stale,
      updatedAt: stale,
    },
  ]);

  await database.insert(candidatePublicSignals).values([
    {
      candidateId: componentMaker.id,
      signalType: "product_launch",
      title: "Current public product launch",
      occurredAt: new Date("2026-07-20T00:00:00.000Z"),
      sourceUrl: `${componentMaker.canonicalUrl}/launch`,
      confidence: 90,
      evidenceKey: `signal-${testId}-active`,
      createdAt: recent,
      updatedAt: recent,
    },
    {
      candidateId: componentMaker.id,
      signalType: "funding",
      title: "Future public funding event",
      occurredAt: new Date("2026-08-01T00:00:00.000Z"),
      sourceUrl: `${componentMaker.canonicalUrl}/future`,
      confidence: 90,
      evidenceKey: `signal-${testId}-future`,
      createdAt: recent,
      updatedAt: recent,
    },
    {
      candidateId: unknownCompany.id,
      signalType: "hiring",
      title: "Expired hiring signal",
      occurredAt: new Date("2025-01-01T00:00:00.000Z"),
      expiresAt: new Date("2025-02-01T00:00:00.000Z"),
      sourceUrl: `${unknownCompany.canonicalUrl}/expired`,
      confidence: 80,
      evidenceKey: `signal-${testId}-expired`,
      createdAt: stale,
      updatedAt: stale,
    },
    {
      candidateId: laterGeneralCompany.id,
      signalType: "partnership",
      title: "Current public partnership",
      occurredAt: new Date("2026-07-15T00:00:00.000Z"),
      sourceUrl: `${laterGeneralCompany.canonicalUrl}/partnership`,
      confidence: 85,
      evidenceKey: `signal-${testId}-partnership`,
      createdAt: recent,
      updatedAt: recent,
    },
  ]);

  await database.insert(candidateRelationships).values([
    {
      sourceCandidateId: componentMaker.id,
      targetCandidateId: laterGeneralCompany.id,
      relationshipType: "supplies_to",
      evidenceUrl: `${componentMaker.canonicalUrl}/supply-evidence`,
      confidence: 88,
      observedAt: recent,
      evidenceKey: `relationship-${testId}-resolved`,
      createdAt: recent,
      updatedAt: recent,
    },
    {
      sourceCandidateId: componentMaker.id,
      targetPublicName: "Unresolved Public Integrator",
      relationshipType: "tests_with",
      evidenceUrl: `${componentMaker.canonicalUrl}/test-evidence`,
      confidence: 80,
      observedAt: recent,
      evidenceKey: `relationship-${testId}-unresolved`,
      createdAt: recent,
      updatedAt: recent,
    },
  ]);

  await database.insert(opportunityBriefRequests).values({
    participantType: "company",
    profileUrl: componentMaker.canonicalUrl,
    normalizedProfileUrl: `${componentMaker.canonicalUrl}/private-${testId}`,
    email: `private-${testId}@example.test`,
    normalizedEmail: `private-${testId}@example.test`,
    phoneNumber: "+919999999999",
    normalizedPhoneNumber: "+919999999999",
    linkedCandidateId: componentMaker.id,
    source: `ecosystem-repository-${testId}`,
    createdAt: recent,
    updatedAt: recent,
    lastSubmittedAt: recent,
  });

  return {
    physicalRunId,
    generalRunId,
    componentMaker,
    unknownCompany,
    rejectedCompany,
    creatorEnabler,
    laterGeneralCompany,
    generalOnlyCompany,
  };
}

async function cleanup(): Promise<void> {
  await assertTestDatabase();
  await database.delete(opportunityBriefRequests).where(
    eq(opportunityBriefRequests.source, `ecosystem-repository-${testId}`),
  );
  const candidates = await database.select({
    id: discoveryCandidates.id,
    runId: discoveryCandidates.mostRecentRunId,
  }).from(discoveryCandidates).where(eq(discoveryCandidates.geography, testGeography));
  if (candidates.length > 0) {
    await database.delete(discoveryCandidates).where(
      inArray(discoveryCandidates.id, candidates.map(({ id }) => id)),
    );
  }
  const runs = await database.select({ id: discoveryRuns.id }).from(discoveryRuns).where(
    sql`${discoveryRuns.externalRunKey} like ${`ecosystem-repository-${testId}-%`}`,
  );
  if (runs.length > 0) {
    await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, runs.map(({ id }) => id)));
  }
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function assertSharedPopulation(
  snapshot: EcosystemSnapshot,
  expectedCandidateIds: readonly string[],
): void {
  const expected = sorted(expectedCandidateIds);
  expect(sorted(snapshot.population.candidateIds)).toEqual(expected);
  expect(snapshot.population.total).toBe(expected.length);
  expect(snapshot.summary.organisations.count).toBe(expected.length);
  expect(snapshot.geography.denominator).toBe(expected.length);
  expect(snapshot.explorer.denominator).toBe(expected.length);
  expect(snapshot.matrices.denominator).toBe(expected.length);
  expect(snapshot.insights.denominator).toBe(expected.length);
  expect(snapshot.velocity.denominator).toBe(expected.length);
  expect(snapshot.momentum.denominator).toBe(expected.length);
  expect(snapshot.relationships.denominator).toBe(expected.length);
  expect(snapshot.ledger.total).toBe(expected.length);
  expect(snapshot.filterOptions.denominator).toBe(expected.length);
}

beforeAll(async () => {
  await cleanup();
  fixture = await seedCoreFixture();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("Ecosystem Intelligence analytical repository", () => {
  it("uses durable Physical AI research membership and one shared population for every supported filter", async () => {
    const defaultIds = [
      fixture.componentMaker.id,
      fixture.unknownCompany.id,
      fixture.laterGeneralCompany.id,
    ];
    const cases: Array<{
      label: string;
      filters: EcosystemFilters;
      expected: readonly string[];
    }> = [
      { label: "default", filters: DEFAULT_ECOSYSTEM_FILTERS, expected: defaultIds },
      { label: "creator", filters: parseEcosystemFilters({ participantType: "creator" }), expected: [fixture.creatorEnabler.id] },
      { label: "enablers", filters: parseEcosystemFilters({ includeEnablers: "true" }), expected: [...defaultIds, fixture.creatorEnabler.id] },
      { label: "domain", filters: parseEcosystemFilters({ ecosystemDomain: "hardware" }), expected: [fixture.componentMaker.id] },
      { label: "subtype", filters: parseEcosystemFilters({ organisationSubtype: "manufacturer" }), expected: [fixture.componentMaker.id] },
      { label: "role", filters: parseEcosystemFilters({ ecosystemRole: "component_supplier" }), expected: [fixture.componentMaker.id] },
      { label: "stage", filters: parseEcosystemFilters({ businessStage: "component_manufacturing" }), expected: [fixture.componentMaker.id] },
      { label: "layer", filters: parseEcosystemFilters({ technicalLayer: "mechanical_and_actuation" }), expected: [fixture.componentMaker.id] },
      { label: "capability", filters: parseEcosystemFilters({ capability: "motion_control" }), expected: [fixture.componentMaker.id] },
      { label: "component", filters: parseEcosystemFilters({ componentCategory: "actuators" }), expected: [fixture.componentMaker.id] },
      { label: "vertical", filters: parseEcosystemFilters({ roboticsVertical: "industrial_robotics" }), expected: [fixture.componentMaker.id] },
      { label: "unknown taxonomy", filters: parseEcosystemFilters({ ecosystemDomain: "unknown" }), expected: [fixture.unknownCompany.id] },
      { label: "state", filters: parseEcosystemFilters({ headquartersState: "karnataka" }), expected: [fixture.componentMaker.id] },
      { label: "city", filters: parseEcosystemFilters({ headquartersCity: "bengaluru" }), expected: [fixture.componentMaker.id] },
      { label: "unknown headquarters", filters: parseEcosystemFilters({ headquartersState: "unknown" }), expected: [fixture.unknownCompany.id, fixture.laterGeneralCompany.id] },
      { label: "active signal", filters: parseEcosystemFilters({ activeSignalType: "product_launch" }), expected: [fixture.componentMaker.id] },
      { label: "unknown active signal", filters: parseEcosystemFilters({ activeSignalType: "unknown" }), expected: [fixture.unknownCompany.id] },
      { label: "public contact", filters: parseEcosystemFilters({ publicContact: "available" }), expected: [fixture.componentMaker.id, fixture.laterGeneralCompany.id] },
      { label: "missing contact", filters: parseEcosystemFilters({ publicContact: "missing" }), expected: [fixture.unknownCompany.id] },
      { label: "strong evidence", filters: parseEcosystemFilters({ evidenceCoverageBand: "strong" }), expected: [fixture.componentMaker.id] },
      { label: "partial evidence", filters: parseEcosystemFilters({ evidenceCoverageBand: "partial" }), expected: [fixture.laterGeneralCompany.id] },
      { label: "limited evidence", filters: parseEcosystemFilters({ evidenceCoverageBand: "limited" }), expected: [fixture.unknownCompany.id] },
      { label: "unknown evidence", filters: parseEcosystemFilters({ evidenceCoverageBand: "unknown" }), expected: [] },
      { label: "current evidence", filters: parseEcosystemFilters({ evidenceFreshness: "current" }), expected: [fixture.componentMaker.id, fixture.laterGeneralCompany.id] },
      { label: "stale evidence", filters: parseEcosystemFilters({ evidenceFreshness: "stale" }), expected: [fixture.unknownCompany.id] },
      { label: "unknown freshness", filters: parseEcosystemFilters({ evidenceFreshness: "unknown" }), expected: [] },
      { label: "minimum confidence", filters: parseEcosystemFilters({ minimumDiscoveryConfidence: "90" }), expected: [fixture.componentMaker.id] },
      { label: "discovery range", filters: parseEcosystemFilters({ discoveredAfter: "2026-07-01", discoveredBefore: "2026-07-29" }), expected: [fixture.componentMaker.id, fixture.laterGeneralCompany.id] },
      { label: "explicit rejected", filters: parseEcosystemFilters({ reviewStatus: "rejected" }), expected: [fixture.rejectedCompany.id] },
    ];

    for (const testCase of cases) {
      const snapshot = await repository.getSnapshot(testCase.filters, now);
      try {
        assertSharedPopulation(snapshot, testCase.expected);
      } catch (error) {
        throw new Error(`Shared population failed for ${testCase.label}.`, { cause: error });
      }
      expect(snapshot.population.candidateIds).not.toContain(fixture.generalOnlyCompany.id);
    }

    const defaultSnapshot = await repository.getSnapshot(DEFAULT_ECOSYSTEM_FILTERS, now);
    expect(defaultSnapshot.population.candidateIds).toContain(fixture.laterGeneralCompany.id);
    expect(JSON.stringify(defaultSnapshot)).not.toContain(`private-${testId}@example.test`);
    expect(JSON.stringify(defaultSnapshot)).not.toContain("+919999999999");
  });

  it("returns typed zero-safe aggregates, inference precedence, exact readiness, and stable pagination", async () => {
    const empty = await repository.getSnapshot(
      parseEcosystemFilters({ evidenceFreshness: "unknown" }),
      now,
    );
    expect(empty.summary.companies).toEqual({ numerator: 0, denominator: 0, percentage: 0 });
    expect(empty.dataQuality.evidenceCoverage.denominator).toBe(0);
    expect(empty.geography.unresolvedCount).toBe(0);

    const snapshot = await repository.getSnapshot(DEFAULT_ECOSYSTEM_FILTERS, now);
    const componentRole = snapshot.matrices.roleByCapability.cells.find(
      (cell) => cell.rowKey === "component_supplier" && cell.columnKey === "motion_control",
    );
    expect(componentRole).toMatchObject({ count: 1, evidence: { numerator: 1, denominator: 1 } });
    expect(snapshot.explorer.businessStages.find(({ key }) => key === "component_manufacturing"))
      .toMatchObject({ count: 1, strongEvidence: { numerator: 1, denominator: 1 } });
    expect(snapshot.explorer.businessStages.flatMap(({ representativeCompanies }) => representativeCompanies))
      .toHaveLength(snapshot.explorer.businessStages.flatMap(({ representativeCompanies }) => representativeCompanies).length);
    expect(snapshot.momentum).toMatchObject({
      ready: false,
      activeSignalCount: 2,
      organisationCount: 2,
      message: "Not enough evidence-backed signals to establish ecosystem momentum yet.",
    });
    expect(snapshot.relationships).toMatchObject({
      ready: false,
      evidencedEdgeCount: 2,
      unresolvedTargetCount: 1,
      message: "More verified relationship evidence is needed before showing the graph.",
    });
    expect(snapshot.velocity.kind).toBe("discovery_research_activity");
    expect(JSON.stringify(snapshot.velocity)).not.toContain("product_launch");

    const first = await repository.getSnapshot(
      parseEcosystemFilters({ pageSize: "1", sort: "name", direction: "asc", page: "1" }),
      now,
    );
    const second = await repository.getSnapshot(
      parseEcosystemFilters({ pageSize: "1", sort: "name", direction: "asc", page: "2" }),
      now,
    );
    expect(first.ledger.items).toHaveLength(1);
    expect(second.ledger.items).toHaveLength(1);
    expect(first.ledger.items[0]?.id).not.toBe(second.ledger.items[0]?.id);
    expect(first.ledger.items[0]?.name.localeCompare(second.ledger.items[0]?.name ?? "")).toBeLessThan(0);
  });

  it("caps representatives and an evidence-only ready relationship graph", async () => {
    const capRunId = await createRun("caps", "robotics_hardware_india", recent);
    const capCandidates: FixtureCandidate[] = [];
    for (let index = 0; index < 46; index += 1) {
      const candidate = await createCandidate({
        suffix: `cap-${index.toString().padStart(2, "0")}`,
        runId: capRunId,
        name: `Cap Candidate ${index.toString().padStart(2, "0")}`,
        category: "manufacturing and testing",
        status: "rejected",
        discoveredAt: recent,
        researchAt: recent,
        sourceAt: recent,
      });
      capCandidates.push(candidate);
    }
    await database.insert(candidateEcosystemClassifications).values(capCandidates.map((candidate) => ({
      candidateId: candidate.id,
      kind: "ecosystem_role",
      termKey: "manufacturer",
      evidenceState: "evidence_backed",
      confidence: 90,
      basis: "Public evidence identifies manufacturing capability.",
      sourceUrls: [`${candidate.canonicalUrl}/manufacturing`],
      createdAt: recent,
      updatedAt: recent,
    })));
    await database.insert(candidatePublicSignals).values(capCandidates.slice(0, 3).flatMap((candidate, candidateIndex) =>
      [0, 1].map((signalIndex) => ({
        candidateId: candidate.id,
        signalType: signalIndex === 0 ? "facility_expansion" : "contract_award",
        title: `Active cap signal ${candidateIndex}-${signalIndex}`,
        occurredAt: recent,
        sourceUrl: `${candidate.canonicalUrl}/signal-${signalIndex}`,
        confidence: 90,
        evidenceKey: `cap-signal-${testId}-${candidateIndex}-${signalIndex}`,
        createdAt: recent,
        updatedAt: recent,
      })),
    ));
    const edges = Array.from({ length: 70 }, (_, index) => ({
      sourceCandidateId: capCandidates[index % capCandidates.length]!.id,
      targetCandidateId: capCandidates[(index + 1) % capCandidates.length]!.id,
      relationshipType: index % 2 === 0 ? "supplies_to" : "integrates_with",
      evidenceUrl: `${capCandidates[index % capCandidates.length]!.canonicalUrl}/edge-${index}`,
      confidence: 80,
      observedAt: recent,
      evidenceKey: `cap-relationship-${testId}-${index}`,
      createdAt: recent,
      updatedAt: recent,
    }));
    await database.insert(candidateRelationships).values(edges);

    try {
      const snapshot = await repository.getSnapshot(
        parseEcosystemFilters({ reviewStatus: "rejected", pageSize: "100" }),
        now,
      );
      expect(snapshot.momentum).toMatchObject({
        ready: true,
        activeSignalCount: 6,
        organisationCount: 3,
      });
      expect(snapshot.relationships.ready).toBe(true);
      if (!snapshot.relationships.ready) throw new Error("Expected a ready graph.");
      expect(snapshot.relationships.nodes.length).toBeLessThanOrEqual(40);
      expect(snapshot.relationships.edges.length).toBeLessThanOrEqual(60);
      expect(snapshot.relationships.edges.every(({ evidenceUrl }) => evidenceUrl.startsWith("https://"))).toBe(true);
      expect(Math.max(
        ...snapshot.explorer.businessStages.map(({ representativeCompanies }) => representativeCompanies.length),
      )).toBeLessThanOrEqual(5);
      expect(snapshot.ledger.items).toHaveLength(47);
    } finally {
      await database.delete(discoveryCandidates).where(
        inArray(discoveryCandidates.id, capCandidates.map(({ id }) => id)),
      );
      await database.delete(discoveryRuns).where(eq(discoveryRuns.id, capRunId));
    }
  });

  it("returns a bounded safe candidate detail and null outside the Physical AI corpus", async () => {
    const extraRuns: string[] = [];
    for (let index = 0; index < 22; index += 1) {
      const runId = await createRun(`history-${index}`, "robotics_hardware_india", new Date(now.getTime() - index * 86_400_000));
      extraRuns.push(runId);
      await database.insert(candidateResearchVersions).values({
        candidateId: fixture.componentMaker.id,
        discoveryRunId: runId,
        summary: longSummary,
        findings: longFindings,
        sourceUrls: [`${fixture.componentMaker.canonicalUrl}/history-${index}`],
        analysisVersion: "physical-ai-v1",
        createdAt: new Date(now.getTime() - index * 86_400_000),
      });
    }
    await database.insert(discoveryCandidateSources).values(Array.from({ length: 28 }, (_, index) => ({
      candidateId: fixture.componentMaker.id,
      discoveryRunId: fixture.physicalRunId,
      sourceName: `bounded-source-${index}`,
      sourceUrl: `${fixture.componentMaker.canonicalUrl}/bounded-source-${index}`,
      firstSeenAt: recent,
      lastSeenAt: recent,
      createdAt: recent,
    })));

    try {
      const detail = await repository.getCandidateDetail(fixture.componentMaker.id, now);
      expect(detail).not.toBeNull();
      expect(detail?.classifications.filter(
        ({ kind, termKey }) => kind === "ecosystem_role" && termKey === "component_supplier",
      )).toEqual([expect.objectContaining({ evidenceState: "evidence_backed" })]);
      expect(detail?.signals.every(({ activeUntil }) => activeUntil.getTime() > now.getTime())).toBe(true);
      expect(detail?.sources.length).toBeLessThanOrEqual(25);
      expect(detail?.research.current).not.toBeNull();
      expect(detail?.research.history.length).toBeLessThanOrEqual(19);
      expect(JSON.stringify(detail)).not.toContain("rawMetadata");
      expect(JSON.stringify(detail)).not.toContain(`private-${testId}@example.test`);
      expect(JSON.stringify(detail)).not.toContain("+919999999999");
      expect(await repository.getCandidateDetail(fixture.generalOnlyCompany.id, now)).toBeNull();
      expect(await repository.getCandidateDetail(randomUUID(), now)).toBeNull();
    } finally {
      await database.delete(candidateResearchVersions).where(inArray(candidateResearchVersions.discoveryRunId, extraRuns));
      await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, extraRuns));
      await database.delete(discoveryCandidateSources).where(
        sql`${discoveryCandidateSources.candidateId} = ${fixture.componentMaker.id} and ${discoveryCandidateSources.sourceName} like 'bounded-source-%'`,
      );
    }
  });
});
