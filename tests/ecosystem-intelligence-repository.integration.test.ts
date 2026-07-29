import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_ECOSYSTEM_FILTERS,
  parseEcosystemFilters,
  type EcosystemFilters,
} from "../app/domain/ecosystem-intelligence";
import { normalizePublicDiscoveryUrl } from "../app/domain/discovery";
import { closeDb, getDb } from "../db/client";
import { publicHttpUrlPredicate } from "../db/repositories/ecosystem-intelligence-query";
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
    {
      sourceCandidateId: componentMaker.id,
      targetCandidateId: generalOnlyCompany.id,
      relationshipType: "supplies_to",
      evidenceUrl: `${componentMaker.canonicalUrl}/filtered-target-evidence`,
      confidence: 82,
      observedAt: recent,
      evidenceKey: `relationship-${testId}-filtered-target`,
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

function populationFingerprint(candidateIds: readonly string[]): string {
  return createHash("md5").update(sorted(candidateIds).join(",")).digest("hex");
}

function assertSharedPopulation(
  snapshot: EcosystemSnapshot,
  expectedCandidateIds: readonly string[],
): void {
  const expected = sorted(expectedCandidateIds);
  expect(snapshot.population.total).toBe(expected.length);
  expect(snapshot.population.fingerprint).toBe(populationFingerprint(expected));
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
  it("keeps the set-based public URL predicate aligned with the domain validator", async () => {
    const urls = [
      "https://example.com/profile",
      " HTTPS://Example.COM/team#founders ",
      "https://xn--mnich-kva.com/profile",
      "http://sub.example.com:8080/path?q=1#evidence",
      "https://bad_host.example/profile",
      "https://8.8.8.8/profile",
      "https://8.8.8.8:65535/profile",
      "https://[2606:4700:4700::1111]/profile",
      "https://[64:ff9b::808:808]/profile",
      "https://[2001:1::1]/profile",
      "https://[2001:1::2]/profile",
      "https://[2001:1::3]/profile",
      "https://[2001:3::1]/profile",
      "https://[2001:4:112::1]/profile",
      "https://[2001:30::1]/profile",
      "not-a-url",
      "ftp://example.com/profile",
      "https://user:secret@example.com/profile",
      "http://localhost/profile",
      "http://intranet/profile",
      "http://service.localhost/profile",
      "http://service.local/profile",
      "http://service.home/profile",
      "http://service.internal/profile",
      "http://service.lan/profile",
      "http://0.1.2.3/profile",
      "http://10.20.30.40/profile",
      "http://100.64.0.1/profile",
      "http://100.127.255.255/profile",
      "http://127.0.0.1/profile",
      "http://169.254.10.1/profile",
      "http://172.16.0.1/profile",
      "http://172.31.255.255/profile",
      "http://192.0.0.1/profile",
      "http://192.0.2.1/profile",
      "http://192.168.1.1/profile",
      "http://198.18.0.1/profile",
      "http://198.19.255.255/profile",
      "http://198.51.100.1/profile",
      "http://203.0.113.1/profile",
      "http://224.0.0.1/profile",
      "http://255.255.255.255/profile",
      "http://999.1.1.1/profile",
      "https://[::]/profile",
      "https://[::1]/profile",
      "https://[::ffff:8.8.8.8]/profile",
      "https://[64:ff9b::a00:1]/profile",
      "https://[64:ff9b:1::1]/profile",
      "https://[100::1]/profile",
      "https://[100:0:0:1::1]/profile",
      "https://[2001::1]/profile",
      "https://[2001:db8::1]/profile",
      "https://[2002::1]/profile",
      "https://[3fff::1]/profile",
      "https://[5f00::1]/profile",
      "https://[fc00::1]/profile",
      "https://[fe80::1]/profile",
      "https://[fec0::1]/profile",
      "https://[ff00::1]/profile",
      "https://example.com:65536/profile",
      "https://example.com:99999/profile",
    ];

    for (const url of urls) {
      let domainValid = true;
      try {
        normalizePublicDiscoveryUrl(url);
      } catch {
        domainValid = false;
      }
      const [row] = await database.execute<{ valid: boolean }>(sql`
        select ${publicHttpUrlPredicate(sql`${url}::text`)} as "valid"
      `);
      expect(row?.valid, url).toBe(domainValid);
    }
  });

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
    }

    const defaultSnapshot = await repository.getSnapshot(DEFAULT_ECOSYSTEM_FILTERS, now);
    expect(defaultSnapshot.population.fingerprint).toBe(populationFingerprint(defaultIds));
    expect(defaultSnapshot.summary.documentedRelationships).toEqual({
      count: 2,
      organisations: { numerator: 2, denominator: 3, percentage: 67 },
    });
    expect(JSON.stringify(defaultSnapshot)).not.toContain(`private-${testId}@example.test`);
    expect(JSON.stringify(defaultSnapshot)).not.toContain("+919999999999");

    const singleFilters = parseEcosystemFilters({ capability: "motion_control", pageSize: "100" });
    const single = await repository.getSnapshot(singleFilters, now);
    assertSharedPopulation(single, [fixture.componentMaker.id]);
    expect(single.geography.states).toEqual([
      expect.objectContaining({ key: "karnataka", count: 1 }),
    ]);
    expect(single.geography.cities).toEqual([
      expect.objectContaining({ key: "bengaluru", stateKey: "karnataka", count: 1 }),
    ]);
    expect(single.geography.unresolvedCount).toBe(0);
    expect(single.explorer.businessStages.flatMap(({ representativeCompanies }) =>
      representativeCompanies.map(({ id }) => id))).toEqual([fixture.componentMaker.id]);
    expect(single.explorer.businessStages.filter(({ count }) => count > 0)).toEqual([
      expect.objectContaining({ key: "component_manufacturing", count: 1 }),
    ]);
    expect(single.explorer.technicalLayers.filter(({ count }) => count > 0)).toEqual([
      expect.objectContaining({ key: "mechanical_and_actuation", count: 1 }),
    ]);
    expect(single.matrices.roleByCapability.cells.filter(({ count }) => count > 0)).toEqual([
      expect.objectContaining({ rowKey: "component_supplier", columnKey: "motion_control", count: 1 }),
    ]);
    expect(single.matrices.stateByRole.cells.filter(({ count }) => count > 0)).toEqual([
      expect.objectContaining({ rowKey: "karnataka", columnKey: "component_supplier", count: 1 }),
    ]);
    expect(single.insights.items).toEqual([]);
    for (const window of single.velocity.windows) {
      expect(window).toMatchObject({ candidateCount: 1 });
      expect(window.byRole).toEqual([
        expect.objectContaining({ key: "component_supplier", count: 1 }),
      ]);
      expect(window.byState).toEqual([
        expect.objectContaining({ key: "karnataka", count: 1 }),
      ]);
      expect(window.byReviewStatus).toEqual([
        expect.objectContaining({ key: "shortlisted", count: 1 }),
      ]);
    }
    expect(single.momentum).toMatchObject({
      ready: false,
      activeSignalCount: 1,
      organisationCount: 1,
      companies: [],
      signals: [],
    });
    expect(single.relationships).toMatchObject({
      ready: false,
      evidencedEdgeCount: 0,
      candidateCount: 0,
      unresolvedTargetCount: 1,
      nodes: [],
      edges: [],
    });
    expect(single.ledger.items.map(({ id }) => id)).toEqual([fixture.componentMaker.id]);
    expect(single.filterOptions.headquartersStates.filter(({ count }) => count > 0)).toEqual([
      expect.objectContaining({ key: "karnataka", count: 1 }),
    ]);
    expect(single.filterOptions.headquartersCities).toEqual([
      expect.objectContaining({ key: "bengaluru", count: 1 }),
    ]);
    expect(single.filterOptions.activeSignalTypes.filter(({ count }) => count > 0)).toEqual([
      expect.objectContaining({ key: "product_launch", count: 1 }),
    ]);

    const sliceFilters = parseEcosystemFilters({
      discoveredAfter: "2026-07-01",
      discoveredBefore: "2026-07-29",
      pageSize: "100",
    });
    const slice = await repository.getSnapshot(sliceFilters, now);
    const sliceIds = [fixture.componentMaker.id, fixture.laterGeneralCompany.id];
    assertSharedPopulation(slice, sliceIds);
    expect(slice.geography.states).toEqual([
      expect.objectContaining({ key: "karnataka", count: 1 }),
    ]);
    expect(slice.geography.unresolvedCount).toBe(1);
    expect(new Set(slice.explorer.businessStages.flatMap(({ representativeCompanies }) =>
      representativeCompanies.map(({ id }) => id)))).toEqual(new Set(sliceIds));
    expect(slice.matrices.roleByCapability.cells.every(({ count }) => count <= 2)).toBe(true);
    expect(slice.insights.items.every(({ supportingFilters }) =>
      supportingFilters.discoveredAfter === sliceFilters.discoveredAfter
      && supportingFilters.discoveredBefore === sliceFilters.discoveredBefore)).toBe(true);
    expect(slice.velocity.windows.every(({ candidateCount }) => candidateCount === 2)).toBe(true);
    expect(slice.momentum).toMatchObject({
      ready: false,
      activeSignalCount: 2,
      organisationCount: 2,
      companies: [],
      signals: [],
    });
    expect(slice.relationships).toMatchObject({
      ready: false,
      evidencedEdgeCount: 1,
      candidateCount: 2,
      unresolvedTargetCount: 1,
      nodes: [],
      edges: [],
    });
    expect(new Set(slice.ledger.items.map(({ id }) => id))).toEqual(new Set(sliceIds));
    expect(slice.filterOptions.headquartersCities).toEqual([
      expect.objectContaining({ key: "bengaluru", count: 1 }),
      expect.objectContaining({ key: "unknown", count: 1 }),
    ]);
  });

  it("returns typed zero-safe aggregates, inference precedence, exact readiness, and stable pagination", async () => {
    const empty = await repository.getSnapshot(
      parseEcosystemFilters({ evidenceFreshness: "unknown" }),
      now,
    );
    expect(empty.summary.companies).toEqual({ numerator: 0, denominator: 0, percentage: 0 });
    for (const metric of [
      empty.dataQuality.resolvedState,
      empty.dataQuality.resolvedCity,
      empty.dataQuality.ecosystemRole,
      empty.dataQuality.capability,
      empty.dataQuality.strongEvidence,
      empty.dataQuality.publicContact,
      empty.dataQuality.organisationsWithActiveSignal,
      empty.dataQuality.systemsContext,
    ]) {
      expect(metric).toEqual({ numerator: 0, denominator: 0, percentage: 0 });
    }
    expect(empty.geography.unresolvedCount).toBe(0);

    const snapshot = await repository.getSnapshot(DEFAULT_ECOSYSTEM_FILTERS, now);
    expect(snapshot.dataQuality).toMatchObject({
      resolvedState: { numerator: 1, denominator: 3, percentage: 33 },
      resolvedCity: { numerator: 1, denominator: 3, percentage: 33 },
      ecosystemRole: { numerator: 2, denominator: 3, percentage: 67 },
      capability: { numerator: 1, denominator: 3, percentage: 33 },
      strongEvidence: { numerator: 1, denominator: 3, percentage: 33 },
      publicContact: { numerator: 2, denominator: 3, percentage: 67 },
      organisationsWithActiveSignal: { numerator: 2, denominator: 3, percentage: 67 },
      systemsContext: { numerator: 3, denominator: 3, percentage: 100 },
    });
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
      evidencedEdgeCount: 1,
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

  it("keeps large populations, momentum, geography, filters, and relationships exact while capping display rows", async () => {
    const capRunId = await createRun("caps", "robotics_hardware_india", recent);
    const capCandidates: FixtureCandidate[] = [];
    for (let index = 0; index < 105; index += 1) {
      const candidate = await createCandidate({
        suffix: `cap-${index.toString().padStart(3, "0")}`,
        runId: capRunId,
        name: `Cap Candidate ${index.toString().padStart(3, "0")}`,
        category: index === 0 ? "  MANUFACTURING   AND   TESTING  " : "manufacturing and testing",
        status: "rejected",
        score: index === 0 ? 100 : index < 5 ? 99 : 70,
        websiteUrl: index === 0 ? "not-a-public-url" : undefined,
        linkedinUrl: index === 0 ? "https://user:secret@example.com/profile" : undefined,
        discoveredAt: recent,
        researchAt: recent,
        sourceAt: recent,
      });
      capCandidates.push(candidate);
    }
    await database.update(discoveryCandidates).set({
      canonicalUrl: "not-a-canonical-url",
    }).where(eq(discoveryCandidates.id, capCandidates[0]!.id));
    await database.insert(candidateEcosystemClassifications).values(capCandidates.slice(1).map((candidate) => ({
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
    await database.insert(candidateHeadquarters).values(capCandidates.slice(0, -1).map((candidate, index) => ({
      candidateId: candidate.id,
      countryCode: "IN",
      stateKey: index === 1 ? "tamil_nadu" : "karnataka",
      stateLabel: index === 1 ? "Tamil Nadu" : "Karnataka",
      cityKey: index < 2
        ? "shared_city"
        : index >= 2 && index < 12
          ? "legacy-invalid-city"
          : `fixture_city_${index.toString().padStart(3, "0")}`,
      cityLabel: index < 2 ? "Shared City" : `Fixture City ${index.toString().padStart(3, "0")}`,
      evidenceState: "evidence_backed",
      confidence: 90,
      sourceUrls: [`${candidate.canonicalUrl}/headquarters`],
      createdAt: recent,
      updatedAt: recent,
    })));
    await database.insert(candidatePublicSignals).values([
      ...capCandidates.slice(0, 25).map((candidate, index) => ({
        candidateId: candidate.id,
        signalType: "facility_expansion",
        title: `Newest active cap signal ${index}`,
        occurredAt: new Date(`2026-07-28T10:${index.toString().padStart(2, "0")}:00.000Z`),
        sourceUrl: `${candidate.canonicalUrl}/newest-signal-${index}`,
        confidence: 90,
        evidenceKey: `cap-signal-${testId}-newest-${index}`,
        createdAt: recent,
        updatedAt: recent,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        candidateId: capCandidates[25]!.id,
        signalType: "product_launch",
        title: `Older high-volume signal ${index}`,
        occurredAt: new Date(`2026-07-10T10:${index.toString().padStart(2, "0")}:00.000Z`),
        sourceUrl: `${capCandidates[25]!.canonicalUrl}/older-signal-${index}`,
        confidence: 90,
        evidenceKey: `cap-signal-${testId}-older-${index}`,
        createdAt: recent,
        updatedAt: recent,
      })),
    ]);
    const edges = Array.from({ length: 70 }, (_, index) => ({
      sourceCandidateId: capCandidates[index]!.id,
      targetCandidateId: capCandidates[index + 1]!.id,
      relationshipType: index % 2 === 0 ? "supplies_to" : "integrates_with",
      evidenceUrl: `${capCandidates[index]!.canonicalUrl}/edge-${index}`,
      confidence: 80,
      observedAt: recent,
      evidenceKey: `cap-relationship-${testId}-${index}`,
      createdAt: recent,
      updatedAt: recent,
    }));
    const unresolvedEdges = Array.from({ length: 8 }, (_, index) => ({
      sourceCandidateId: capCandidates[index % 5]!.id,
      targetPublicName: `Unresolved cap target ${index}`,
      relationshipType: "tests_with",
      evidenceUrl: `${capCandidates[index % 5]!.canonicalUrl}/unresolved-${index}`,
      confidence: 80,
      observedAt: recent,
      evidenceKey: `cap-relationship-${testId}-unresolved-${index}`,
      createdAt: recent,
      updatedAt: recent,
    }));
    await database.insert(candidateRelationships).values([
      ...edges,
      ...unresolvedEdges,
      {
        sourceCandidateId: capCandidates[4]!.id,
        targetCandidateId: capCandidates[0]!.id,
        relationshipType: "integrates_with",
        evidenceUrl: `${capCandidates[4]!.canonicalUrl}/resolved-loop`,
        confidence: 85,
        observedAt: recent,
        evidenceKey: `cap-relationship-${testId}-resolved-loop`,
        createdAt: recent,
        updatedAt: recent,
      },
      {
        sourceCandidateId: capCandidates[0]!.id,
        targetCandidateId: fixture.generalOnlyCompany.id,
        relationshipType: "supplies_to",
        evidenceUrl: `${capCandidates[0]!.canonicalUrl}/outside-filter`,
        confidence: 85,
        observedAt: recent,
        evidenceKey: `cap-relationship-${testId}-outside-filter`,
        createdAt: recent,
        updatedAt: recent,
      },
    ]);

    try {
      const snapshot = await repository.getSnapshot(
        parseEcosystemFilters({ reviewStatus: "rejected", pageSize: "100" }),
        now,
      );
      assertSharedPopulation(snapshot, [fixture.rejectedCompany.id, ...capCandidates.map(({ id }) => id)]);
      expect(snapshot.momentum).toMatchObject({
        ready: true,
        activeSignalCount: 35,
        organisationCount: 26,
      });
      expect(snapshot.momentum.categories).toEqual([
        expect.objectContaining({ key: "facility_expansion", count: 25 }),
        expect.objectContaining({ key: "product_launch", count: 10 }),
      ]);
      expect(snapshot.momentum.companies).toContainEqual(
        expect.objectContaining({ key: capCandidates[25]!.id, count: 10 }),
      );
      expect(snapshot.momentum.signals).toHaveLength(25);
      expect(snapshot.relationships.ready).toBe(true);
      if (!snapshot.relationships.ready) throw new Error("Expected a ready graph.");
      expect(snapshot.relationships.nodes.length).toBeLessThanOrEqual(40);
      expect(snapshot.relationships.edges.length).toBeLessThanOrEqual(60);
      expect(snapshot.relationships.edges.every(({ evidenceUrl }) => evidenceUrl.startsWith("https://"))).toBe(true);
      expect(Math.max(
        ...snapshot.explorer.businessStages.map(({ representativeCompanies }) => representativeCompanies.length),
      )).toBeLessThanOrEqual(5);
      expect(snapshot.ledger.items).toHaveLength(100);
      expect(snapshot.ledger.total).toBe(106);

      const sharedCities = snapshot.geography.cities.filter(({ key }) => key === "shared_city");
      expect(sharedCities).toHaveLength(2);
      expect(sharedCities.map(({ stateKey }) => stateKey).sort()).toEqual(["karnataka", "tamil_nadu"]);
      expect(snapshot.filterOptions.headquartersCities).toHaveLength(50);
      expect(snapshot.filterOptions.headquartersCities[0]).toMatchObject({ key: "shared_city", count: 2 });
      expect(snapshot.filterOptions.headquartersCities.some(({ key }) => key === "legacy-invalid-city"))
        .toBe(false);
      expect(snapshot.filterOptions.headquartersCities).toContainEqual({
        key: "unknown",
        label: "unknown",
        count: 1,
      });
      expect(snapshot.filterOptions.headquartersCities.slice(1).map(({ key }) => key)).toEqual(
        snapshot.filterOptions.headquartersCities.slice(1).map(({ key }) => key).sort(),
      );

      const normalizedInference = await repository.getSnapshot(
        parseEcosystemFilters({
          reviewStatus: "rejected",
          minimumDiscoveryConfidence: "100",
          capability: "testing_and_validation",
        }),
        now,
      );
      assertSharedPopulation(normalizedInference, [capCandidates[0]!.id]);

      const malformedMissing = await repository.getSnapshot(
        parseEcosystemFilters({
          reviewStatus: "rejected",
          minimumDiscoveryConfidence: "100",
          publicContact: "missing",
        }),
        now,
      );
      assertSharedPopulation(malformedMissing, [capCandidates[0]!.id]);
      expect(malformedMissing.ledger.items[0]).toMatchObject({
        websiteUrl: null,
        linkedinUrl: null,
      });
      const malformedDetail = await repository.getCandidateDetail(capCandidates[0]!.id, now);
      expect(malformedDetail?.publicUrls).toMatchObject({
        canonical: null,
        website: null,
        linkedin: null,
      });
      const malformedAvailable = await repository.getSnapshot(
        parseEcosystemFilters({
          reviewStatus: "rejected",
          minimumDiscoveryConfidence: "100",
          publicContact: "available",
        }),
        now,
      );
      assertSharedPopulation(malformedAvailable, []);

      const relationshipPopulation = await repository.getSnapshot(
        parseEcosystemFilters({
          reviewStatus: "rejected",
          minimumDiscoveryConfidence: "99",
          pageSize: "100",
        }),
        now,
      );
      assertSharedPopulation(relationshipPopulation, capCandidates.slice(0, 5).map(({ id }) => id));
      expect(relationshipPopulation.summary.documentedRelationships).toEqual({
        count: 13,
        organisations: { numerator: 5, denominator: 5, percentage: 100 },
      });
      expect(relationshipPopulation.relationships).toMatchObject({
        ready: false,
        evidencedEdgeCount: 5,
        candidateCount: 5,
        unresolvedTargetCount: 8,
      });
      expect(relationshipPopulation.relationships.nodes).toEqual([]);
      expect(relationshipPopulation.relationships.edges).toEqual([]);
      const relationshipCounts = new Map(
        relationshipPopulation.ledger.items.map(({ id, documentedRelationshipCount }) => [
          id,
          documentedRelationshipCount,
        ]),
      );
      expect(capCandidates.slice(0, 5).map(({ id }) => relationshipCounts.get(id))).toEqual([4, 4, 4, 3, 3]);
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
        createdAt: new Date(now.getTime() - (index + 1) * 86_400_000),
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
    const newestGeneralResearchAt = new Date("2026-07-29T11:30:00.000Z");
    await database.insert(candidateResearchVersions).values({
      candidateId: fixture.componentMaker.id,
      discoveryRunId: fixture.generalRunId,
      summary: longSummary,
      findings: longFindings,
      sourceUrls: [`${fixture.componentMaker.canonicalUrl}/general-run-current-research`],
      analysisVersion: "physical-ai-v1",
      createdAt: newestGeneralResearchAt,
    });
    await database.insert(candidatePublicSignals).values(Array.from({ length: 24 }, (_, index) => ({
      candidateId: fixture.componentMaker.id,
      signalType: "product_launch",
      title: `Bounded detail signal ${index}`,
      occurredAt: new Date(now.getTime() - (index + 1) * 60_000),
      sourceUrl: `${fixture.componentMaker.canonicalUrl}/bounded-detail-signal-${index}`,
      confidence: 90,
      evidenceKey: `detail-signal-${testId}-${index}`,
      createdAt: recent,
      updatedAt: recent,
    })));
    await database.insert(candidateRelationships).values(Array.from({ length: 24 }, (_, index) => ({
      sourceCandidateId: index % 2 === 0 ? fixture.componentMaker.id : fixture.laterGeneralCompany.id,
      targetCandidateId: index % 2 === 0 ? fixture.laterGeneralCompany.id : fixture.componentMaker.id,
      relationshipType: index % 2 === 0 ? "supplies_to" : "integrates_with",
      evidenceUrl: `${fixture.componentMaker.canonicalUrl}/bounded-detail-relationship-${index}`,
      confidence: 85,
      observedAt: new Date(now.getTime() - (index + 1) * 60_000),
      evidenceKey: `detail-relationship-${testId}-${index}`,
      createdAt: recent,
      updatedAt: recent,
    })));

    try {
      const detail = await repository.getCandidateDetail(fixture.componentMaker.id, now);
      expect(detail).not.toBeNull();
      expect(detail?.classifications.filter(
        ({ kind, termKey }) => kind === "ecosystem_role" && termKey === "component_supplier",
      )).toEqual([expect.objectContaining({ evidenceState: "evidence_backed" })]);
      expect(detail?.signals.every(({ activeUntil }) => activeUntil.getTime() > now.getTime())).toBe(true);
      expect(detail?.signals).toHaveLength(20);
      expect(detail?.sources.length).toBeLessThanOrEqual(20);
      expect(detail?.relationships).toHaveLength(20);
      const repeatedDetail = await repository.getCandidateDetail(fixture.componentMaker.id, now);
      expect(repeatedDetail?.relationships.map(({ id }) => id)).toEqual(
        detail?.relationships.map(({ id }) => id),
      );
      for (let index = 1; index < (detail?.relationships.length ?? 0); index += 1) {
        const previous = detail?.relationships[index - 1]?.observedAt?.getTime() ?? 0;
        const current = detail?.relationships[index]?.observedAt?.getTime() ?? 0;
        expect(previous).toBeGreaterThanOrEqual(current);
      }
      expect(detail?.research.current).not.toBeNull();
      expect((detail?.research.history.length ?? 0) + (detail?.research.current ? 1 : 0)).toBeLessThanOrEqual(20);
      const snapshot = await repository.getSnapshot(
        parseEcosystemFilters({ pageSize: "100" }),
        now,
      );
      expect(snapshot.ledger.items.find(({ id }) => id === fixture.componentMaker.id)?.latestResearchAt)
        .toEqual(newestGeneralResearchAt);
      expect(JSON.stringify(detail)).not.toContain("rawMetadata");
      expect(JSON.stringify(detail)).not.toContain(`private-${testId}@example.test`);
      expect(JSON.stringify(detail)).not.toContain("+919999999999");
      expect(await repository.getCandidateDetail(fixture.generalOnlyCompany.id, now)).toBeNull();
      expect(await repository.getCandidateDetail(randomUUID(), now)).toBeNull();
    } finally {
      await database.delete(candidateResearchVersions).where(inArray(candidateResearchVersions.discoveryRunId, extraRuns));
      await database.delete(candidateResearchVersions).where(
        sql`${candidateResearchVersions.candidateId} = ${fixture.componentMaker.id} and ${candidateResearchVersions.discoveryRunId} = ${fixture.generalRunId}`,
      );
      await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, extraRuns));
      await database.delete(discoveryCandidateSources).where(
        sql`${discoveryCandidateSources.candidateId} = ${fixture.componentMaker.id} and ${discoveryCandidateSources.sourceName} like 'bounded-source-%'`,
      );
      await database.delete(candidatePublicSignals).where(
        sql`${candidatePublicSignals.evidenceKey} like ${`detail-signal-${testId}-%`}`,
      );
      await database.delete(candidateRelationships).where(
        sql`${candidateRelationships.evidenceKey} like ${`detail-relationship-${testId}-%`}`,
      );
    }
  });

  it("keeps corpus membership versioned while latest research evidence reads all versions", async () => {
    const querySource = await readFile(
      `${process.cwd()}/db/repositories/ecosystem-intelligence-query.ts`,
      "utf8",
    );
    expect(querySource).toMatch(
      /corpus_research[\s\S]+analysis_version = \$\{filters\.analysisVersion\}/,
    );
    expect(querySource).not.toMatch(
      /max\(research\.created_at\)[\s\S]{0,180}research\.analysis_version/,
    );

    const ledgerSource = await readFile(
      `${process.cwd()}/db/repositories/ecosystem-intelligence-ledger-queries.ts`,
      "utf8",
    );
    expect(ledgerSource).not.toMatch(
      /select research\.created_at[\s\S]{0,240}research\.analysis_version/,
    );

    const changeSource = await readFile(
      `${process.cwd()}/db/repositories/ecosystem-intelligence-change-queries.ts`,
      "utf8",
    );
    expect(changeSource).not.toMatch(
      /max\(research\.created_at\)[\s\S]{0,180}research\.analysis_version/,
    );
  });
});
