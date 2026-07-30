import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { hashToken } from "../../app/server/tokens";
import { closeDb, getDb } from "../../db/client";
import {
  candidateEcosystemClassifications,
  candidateHeadquarters,
  candidatePublicSignals,
  candidateRelationships,
  candidateResearchVersions,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  magicLinks,
  opportunityBriefRequests,
  users,
} from "../../db/schema";
import { loadLocalEnvironment } from "../../scripts/load-local-env.mjs";
import {
  acceptanceToken,
  requireLocalAppDatabaseUrl,
  requireLoopbackBaseUrl,
} from "../support/acceptance-environment";

const ADMIN_EMAIL = "mewtuals-mobile-e2e@example.test";
const BASE_URL = requireLoopbackBaseUrl(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4000",
);
const VIEWPORTS = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 767, height: 900 },
  { width: 1440, height: 1100 },
] as const;

loadLocalEnvironment();
requireLocalAppDatabaseUrl(process.env.DATABASE_URL);
requireDedicatedAdminAllowlist(process.env.ADMIN_EMAILS);

const database = getDb();
let fixture: EcosystemBrowserFixture | undefined;

type EcosystemBrowserFixture = {
  candidateIds: string[];
  runIds: string[];
  opportunityBriefId: string;
  rawMetadataMarker: string;
  privateEmail: string;
  privatePhone: string;
};

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(async () => {
  await removeDisposableAccount();
  fixture = await seedEcosystemFixture(randomUUID());
});

test.afterAll(async () => {
  await cleanupEcosystemFixture();
  await removeDisposableAccount();
  await closeDb();
});

test("Ecosystem Intelligence preserves one evidence population across its admin journey", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  if (!fixture) throw new Error("Ecosystem browser fixture is unavailable.");
  const admin = await authenticateDedicatedAdmin(browser, fixture.runIds[0]);
  const responsePayloads: string[] = [];
  admin.page.on("response", async (response) => {
    if (!response.url().includes("/api/admin/ecosystem-intelligence")) return;
    responsePayloads.push(await response.text().catch(() => ""));
  });

  try {
    await admin.page.goto(
      "/admin/ecosystem-intelligence?pageSize=2&sort=name&direction=asc",
    );
    await waitForProductHydration(admin.page);
    await expect(
      admin.page.getByRole("heading", { name: "Ecosystem intelligence." }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", {
        name: "Coverage, with its limits visible",
      }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", { name: "Where India is building" }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", {
        name: "How the ecosystem fits together",
      }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", {
        name: "What the mapped ecosystem can currently do",
      }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", {
        name: "Where this map needs deeper research",
      }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", { name: "What is changing" }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("heading", {
        name: "How mapped companies are connected",
      }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("img", { name: "Verified relationship map" }),
    ).toBeVisible();
    await expect(
      admin.page.locator(
        'table[aria-label="Ecosystem candidate evidence ledger"]',
      ),
    ).toHaveCount(1);

    await assertStateMapListParity(admin.page, "Karnataka: 3 organisations");
    await exerciseCrossFilterHistory(admin.page);
    await exerciseExplorer(admin.page);
    await exerciseLedgerSortAndPagination(admin.page);

    for (const viewport of VIEWPORTS) {
      await test.step(
        `workspace remains contained at ${viewport.width}x${viewport.height}`,
        async () => {
          await admin.page.setViewportSize(viewport);
          await expectNoHorizontalOverflow(admin.page);
          if (viewport.width <= 767) await expectTouchControls(admin.page);
          await expectLongValuesContained(admin.page);
        },
      );
    }

    await admin.page.setViewportSize({ width: 320, height: 740 });
    const record = admin.page.getByRole("article", {
      name: /E2E Actuation One .* ecosystem record/,
    });
    const detailsTrigger = record.getByRole("button", { name: "View details" });
    await detailsTrigger.focus();
    await detailsTrigger.click();
    const drawer = admin.page.getByRole("dialog", { name: /E2E Actuation One/ });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: /Close E2E Actuation One .* details/ }),
    ).toBeFocused();
    await expectDrawerContained(drawer, admin.page);
    await expect(drawer.getByText("Evidence-backed", { exact: true }).first()).toBeVisible();
    await expect(drawer.getByText(/95% confidence/).first()).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Systems context", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "History (1)" })).toBeVisible();
    await drawer.getByRole("button", { name: "Show findings" }).click();
    await expect(drawer.getByText(/Higher-level ecosystem relationship:/)).toBeVisible();
    await drawer.getByRole("button", { name: "History (1)" }).click();
    await expect(
      drawer.getByRole("list", { name: "Research versions" }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("heading", { name: "Active public signals" }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("heading", { name: "Verified relationships" }),
    ).toBeVisible();

    await drawer
      .getByRole("button", { name: /Shortlist E2E Actuation One/ })
      .click();
    await expect(drawer).toHaveCount(0);
    await expect(detailsTrigger).toBeFocused();
    await expect(record).toContainText("Shortlisted");

    await assertNoPrivateFixtureData(admin.page, responsePayloads, fixture);
    expect(admin.errors).toEqual([]);
    await proveOfflineAdminBoundary(admin.context, admin.page, fixture);

    await admin.page.goto("/admin/discovery");
    await waitForProductHydration(admin.page);
    await expect(
      admin.page.getByRole("heading", { name: "Discovery operations." }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("link", { name: "Ecosystem Intelligence" }),
    ).toBeVisible();
  } finally {
    await admin.context.close();
  }
});

async function assertStateMapListParity(page: Page, accessibleName: string) {
  const listControl = page
    .getByTestId("india-ranked-locations")
    .getByRole("button", { name: accessibleName });
  const mapControl = page
    .getByTestId("india-ecosystem-map")
    .locator(`[role="button"][aria-label="${accessibleName}"]`);
  await expect(listControl).toBeVisible();
  await expect(mapControl).toHaveCount(1);
  await expect(listControl).toHaveAttribute("aria-pressed", "false");
  await expect(mapControl).toHaveAttribute("aria-pressed", "false");
}

async function exerciseCrossFilterHistory(page: Page) {
  const initialUrl = page.url();
  await page
    .getByTestId("india-ranked-locations")
    .getByRole("button", { name: "Karnataka: 3 organisations" })
    .click();
  await expect(page).toHaveURL(/headquartersState=karnataka/);
  await expect(page.getByRole("button", { name: "Remove Karnataka" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The companies behind this view" }),
  ).toBeVisible();
  await page.reload();
  await waitForProductHydration(page);
  await expect(page).toHaveURL(/headquartersState=karnataka/);
  await expect(page.getByRole("button", { name: "Remove Karnataka" })).toBeVisible();
  await page.goBack();
  await waitForProductHydration(page);
  await expect(page).toHaveURL(initialUrl);
}

async function exerciseExplorer(page: Page) {
  await page
    .getByRole("button", { name: "Technical layers" })
    .click();
  await expect(
    page.getByRole("list", { name: "Technical-layer explorer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Filter by Mechanical and actuation" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Business stages" })
    .click();
  await expect(
    page.getByRole("list", { name: "Business-stage explorer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Role by capability matrix" }),
  ).toBeAttached();
  await expect(
    page.getByRole("table", { name: "State by role matrix" }),
  ).toBeAttached();
  await expect(
    page.getByRole("article", { name: /Map coverage is concentrated/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Active public signals" }),
  ).toBeVisible();
}

async function exerciseLedgerSortAndPagination(page: Page) {
  const pagination = page.getByRole("navigation", {
    name: "Ecosystem candidate pages",
  });
  await expect(pagination).toContainText("Page 1 of 3");
  await pagination.getByRole("link", { name: "Next page" }).click();
  await waitForProductHydration(page);
  await expect(page).toHaveURL(/(?:\?|&)page=2(?:&|$)/);
  await expect(
    page.getByRole("navigation", { name: "Ecosystem candidate pages" }),
  ).toContainText("Page 2 of 3");
  await page
    .getByRole("navigation", { name: "Ecosystem candidate pages" })
    .getByRole("link", { name: "Previous page" })
    .click();
  await waitForProductHydration(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(
    page.getByRole("table", { name: "Ecosystem candidate evidence ledger" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Sort candidates by name/ }).click();
  await waitForProductHydration(page);
  await expect.poll(() => new URL(page.url()).searchParams.get("direction"))
    .toBeNull();
  await expect(
    page.getByRole("columnheader", { name: /Sort candidates by name ascending/ }),
  ).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("link", { name: /Sort candidates by name/ }).click();
  await waitForProductHydration(page);
  await expect(page).toHaveURL(/direction=asc/);
}

async function assertNoPrivateFixtureData(
  page: Page,
  responsePayloads: readonly string[],
  currentFixture: EcosystemBrowserFixture,
) {
  const rendered = await page.locator("body").innerText();
  const serializedResponses = responsePayloads.join("\n");
  for (const privateValue of [
    currentFixture.privateEmail,
    currentFixture.privatePhone,
    currentFixture.rawMetadataMarker,
  ]) {
    expect(rendered).not.toContain(privateValue);
    expect(serializedResponses).not.toContain(privateValue);
  }
  expect(serializedResponses).not.toContain("rawMetadata");
}

async function proveOfflineAdminBoundary(
  context: BrowserContext,
  page: Page,
  currentFixture: EcosystemBrowserFixture,
) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.goto("/admin/ecosystem-intelligence");
  await waitForProductHydration(page);
  await context.setOffline(true);
  await page.goto("/admin/ecosystem-intelligence");
  await expect(
    page.getByRole("heading", {
      name: "Get online to see your partnerships.",
    }),
  ).toBeVisible();
  await expect(page.getByText(currentFixture.privateEmail)).toHaveCount(0);
  await expect(page.getByText(currentFixture.privatePhone)).toHaveCount(0);
  await expect(page.getByText(currentFixture.rawMetadataMarker)).toHaveCount(0);
  const cachedPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);
      }
    }
    return paths;
  });
  expect(
    cachedPaths.filter(
      (path) => path.startsWith("/admin/") || path.startsWith("/api/"),
    ),
  ).toEqual([]);
  await context.setOffline(false);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectTouchControls(page: Page) {
  const controls = page.locator(
    'a, button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([aria-hidden="true"]), select, textarea',
  );
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    const label = await control.getAttribute("aria-label") ??
      (await control.innerText().catch(() => "")).trim();
    expect(box?.height ?? 0, `${label} height`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `${label} width`).toBeGreaterThanOrEqual(44);
  }
  for (const toggle of await page.locator('input[type="checkbox"], input[type="radio"]').all()) {
    if (!(await toggle.isVisible())) continue;
    const label = toggle.locator("xpath=ancestor::label[1]");
    const box = await label.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
}

async function expectLongValuesContained(page: Page) {
  const workspace = page.getByTestId("ecosystem-workspace");
  const box = await workspace.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  for (const rail of await page.locator('[aria-label$="matrix"]').all()) {
    await expect(rail).toBeAttached();
  }
}

async function expectDrawerContained(drawer: ReturnType<Page["getByRole"]>, page: Page) {
  const box = await drawer.boundingBox();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Browser viewport is unavailable.");
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
}

async function authenticateDedicatedAdmin(
  browser: Browser,
  purpose: string,
): Promise<{ context: BrowserContext; errors: string[]; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET is required for browser acceptance.");
  const token = acceptanceToken(purpose, ADMIN_EMAIL);
  const now = new Date();
  await database.insert(magicLinks).values({
    email: ADMIN_EMAIL,
    tokenHash: hashToken(token, sessionSecret),
    issued: true,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  });
  await page.goto(`/auth/verify?token=${encodeURIComponent(token)}`);
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Mewtuals" }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  return { context, errors, page };
}

async function waitForProductHydration(page: Page) {
  await expect(page.locator('[data-product-hydrated="true"]')).toHaveCount(1);
}

async function seedEcosystemFixture(suffix: string): Promise<EcosystemBrowserFixture> {
  const compact = suffix.replaceAll("-", "");
  const now = new Date();
  const olderAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
  const latestAt = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const runIds = [randomUUID(), randomUUID()];
  const candidateIds = Array.from({ length: 6 }, () => randomUUID());
  const publicRoot = `https://ecosystem-${compact}.example`;
  const rawMetadataMarker = `PRIVATE_RAW_METADATA_${compact}`;
  const privateEmail = `private-${compact}@example.test`;
  const privatePhone = `+9199${compact.replaceAll(/\D/g, "").padEnd(8, "0").slice(0, 8)}`;

  await database.insert(discoveryRuns).values([
    browserRun(runIds[0], `ecosystem:e2e:older:${suffix}`, olderAt),
    browserRun(runIds[1], `ecosystem:e2e:latest:${suffix}`, latestAt),
  ]);

  const names = [
    "E2E Actuation One With A Deliberately Long Hardware Company Name",
    "E2E Compute Two",
    "E2E Vision Three",
    "E2E Integration Four",
    "E2E Deployment Five",
    "E2E Unknown Six",
  ];
  await database.insert(discoveryCandidates).values(candidateIds.map((id, index) => ({
    id,
    type: "company" as const,
    name: names[index],
    normalizedName: names[index].toLowerCase(),
    canonicalIdentityKey: `ecosystem-e2e-${compact}-${index}`,
    canonicalUrl: `${publicRoot}/companies/${index}`,
    websiteUrl: index < 5 ? `${publicRoot}/companies/${index}/official` : null,
    linkedinUrl: index === 0 ? `${publicRoot}/companies/${index}/linkedin` : null,
    discoveredDescription: `Evidence-backed Physical AI participant ${index + 1} for browser verification.`,
    category: index === 5 ? "robot makers and integrators" : "components and actuation",
    subcategory: index === 5 ? null : "verified hardware",
    geography: "India",
    firstSourceName: "Public company evidence",
    firstSourceUrl: `${publicRoot}/evidence/${index}`,
    discoveredAt: new Date(latestAt.getTime() - index * 60_000),
    lastSeenAt: latestAt,
    createdAt: latestAt,
    updatedAt: latestAt,
    mostRecentRunId: runIds[1],
    discoveryScore: 95 - index,
    status: "discovered" as const,
    rawMetadata: index === 0 ? { privateMarker: rawMetadataMarker } : {},
  })));

  await database.insert(discoveryCandidateSources).values(candidateIds.map((candidateId, index) => ({
    candidateId,
    discoveryRunId: runIds[1],
    sourceName: `Public evidence ${index + 1}`,
    sourceUrl: `${publicRoot}/evidence/${index}`,
    firstSeenAt: latestAt,
    lastSeenAt: latestAt,
    createdAt: latestAt,
  })));

  const researchFindings = (name: string) => [
    `Higher-level ecosystem relationship: ${name} connects an evidence-backed Physical AI capability to the wider Indian robotics value chain.`,
    "Findings cover inputs purchased, transformations added, outputs sold, suppliers, buyers, manufacturing location, import dependence, approximate value added, technical difficulty, replaceability, strategic importance for India, robot behaviour, materials, and production processes.",
    "Public evidence is kept distinct from interpretation and unknown facts remain explicitly unresolved.",
    "The record explains how the participant fits between underlying components and downstream deployed robot systems.",
  ].join("\n\n").padEnd(700, " Evidence-backed systems context.");
  await database.insert(candidateResearchVersions).values([
    ...candidateIds.map((candidateId, index) => ({
      candidateId,
      discoveryRunId: runIds[1],
      summary: `${names[index]} sits in India’s Physical AI ecosystem with a public-evidence systems context linking its technical contribution to suppliers and buyers.`,
      findings: researchFindings(names[index]),
      sourceUrls: [`${publicRoot}/research/${index}`],
      analysisVersion: "physical-ai-v1",
      createdAt: latestAt,
    })),
    {
      candidateId: candidateIds[0],
      discoveryRunId: runIds[0],
      summary: "Earlier public-evidence assessment of the actuation company and its position between component inputs and integrated robot behaviour.",
      findings: researchFindings(`${names[0]} earlier version`),
      sourceUrls: [`${publicRoot}/research/0/older`],
      analysisVersion: "physical-ai-v1",
      createdAt: olderAt,
    },
  ]);

  const roles = ["component_supplier", "component_supplier", "subsystem_provider", "system_integrator", "deployment_partner"];
  const stages = ["component_manufacturing", "component_manufacturing", "subsystem_engineering", "system_integration", "deployment_and_operations"];
  const layers = ["mechanical_and_actuation", "electronics_and_compute", "sensing_and_perception", "integration_and_safety", "deployment_and_operations"];
  const capabilities = ["motion_control", "edge_ai", "machine_vision", "testing_and_validation", "industrial_automation"];
  await database.insert(candidateEcosystemClassifications).values(
    candidateIds.slice(0, 5).flatMap((candidateId, index) => [
      classification(candidateId, "ecosystem_role", roles[index], publicRoot, index, latestAt),
      classification(candidateId, "business_stage", stages[index], publicRoot, index, latestAt),
      classification(candidateId, "technical_layer", layers[index], publicRoot, index, latestAt),
      classification(candidateId, "capability", capabilities[index], publicRoot, index, latestAt),
    ]),
  );

  const locations = [
    ["karnataka", "Karnataka", "bengaluru", "Bengaluru", 12_971_600, 77_594_600],
    ["karnataka", "Karnataka", "mysuru", "Mysuru", 12_295_800, 76_639_400],
    ["karnataka", "Karnataka", "hubballi", "Hubballi", 15_364_700, 75_124_000],
    ["maharashtra", "Maharashtra", "pune", "Pune", 18_520_400, 73_856_700],
    ["tamil_nadu", "Tamil Nadu", "chennai", "Chennai", 13_082_700, 80_270_700],
  ] as const;
  await database.insert(candidateHeadquarters).values(locations.map((location, index) => ({
    candidateId: candidateIds[index],
    stateKey: location[0],
    stateLabel: location[1],
    cityKey: location[2],
    cityLabel: location[3],
    latitudeMicrodegrees: location[4],
    longitudeMicrodegrees: location[5],
    evidenceState: "evidence_backed",
    confidence: 95,
    sourceUrls: [`${publicRoot}/locations/${index}`],
    createdAt: latestAt,
    updatedAt: latestAt,
  })));

  await database.insert(candidatePublicSignals).values(
    Array.from({ length: 5 }, (_, index) => ({
      candidateId: candidateIds[index % 3],
      signalType: ["product_launch", "partnership", "pilot_deployment", "funding", "facility_expansion"][index],
      title: `Verified ecosystem signal ${index + 1}`,
      occurredAt: new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1_000),
      expiresAt: index === 0 ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000) : null,
      sourceUrl: `${publicRoot}/signals/${index}`,
      confidence: 90,
      evidenceKey: `ecosystem-e2e-${compact}-signal-${index}`,
      createdAt: latestAt,
      updatedAt: latestAt,
    })),
  );

  const relationshipPairs = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [2, 4], [3, 4], [4, 0]] as const;
  await database.insert(candidateRelationships).values(relationshipPairs.map(([source, target], index) => ({
    sourceCandidateId: candidateIds[source],
    targetCandidateId: candidateIds[target],
    relationshipType: index % 2 === 0 ? "supplies_to" : "integrates_with",
    evidenceUrl: `${publicRoot}/relationships/${index}`,
    confidence: 90,
    observedAt: latestAt,
    evidenceKey: `ecosystem-e2e-${compact}-relationship-${index}`,
    createdAt: latestAt,
    updatedAt: latestAt,
  })));

  const [brief] = await database.insert(opportunityBriefRequests).values({
    participantType: "company",
    profileUrl: `${publicRoot}/private-intake`,
    normalizedProfileUrl: `${publicRoot}/private-intake`,
    email: privateEmail,
    normalizedEmail: privateEmail,
    phoneNumber: privatePhone,
    normalizedPhoneNumber: privatePhone,
    openToText: "Private brief text must not cross the Ecosystem Intelligence boundary.",
    source: `ecosystem-e2e-${compact}`,
    linkedCandidateId: candidateIds[0],
    createdAt: latestAt,
    updatedAt: latestAt,
    lastSubmittedAt: latestAt,
  }).returning({ id: opportunityBriefRequests.id });
  if (!brief) throw new Error("Ecosystem browser private fixture was not created.");

  return {
    candidateIds,
    runIds,
    opportunityBriefId: brief.id,
    rawMetadataMarker,
    privateEmail,
    privatePhone,
  };
}

function browserRun(id: string, externalRunKey: string, at: Date) {
  return {
    id,
    externalRunKey,
    campaignKey: "robotics_hardware_india",
    trigger: "trial" as const,
    status: "succeeded" as const,
    startedAt: at,
    completedAt: at,
    createdAt: at,
    updatedAt: at,
    geography: "India",
    candidateType: "company" as const,
    sourcesUsed: ["public_e2e_evidence"],
    requestedCount: 6,
    companyPercentage: 100,
    foundCount: 6,
    newCount: 6,
    duplicateCount: 0,
  };
}

function classification(
  candidateId: string,
  kind: string,
  termKey: string,
  publicRoot: string,
  index: number,
  at: Date,
) {
  return {
    candidateId,
    kind,
    termKey,
    evidenceState: "evidence_backed",
    confidence: 95,
    basis: "Public browser acceptance evidence.",
    sourceUrls: [`${publicRoot}/classifications/${kind}/${index}`],
    createdAt: at,
    updatedAt: at,
  };
}

async function cleanupEcosystemFixture() {
  if (!fixture) return;
  await database.delete(opportunityBriefRequests).where(
    eq(opportunityBriefRequests.id, fixture.opportunityBriefId),
  );
  await database.delete(discoveryCandidates).where(
    inArray(discoveryCandidates.id, fixture.candidateIds),
  );
  await database.delete(discoveryRuns).where(
    inArray(discoveryRuns.id, fixture.runIds),
  );
  fixture = undefined;
}

async function removeDisposableAccount() {
  await database.delete(magicLinks).where(eq(magicLinks.email, ADMIN_EMAIL));
  await database.delete(users).where(eq(users.email, ADMIN_EMAIL));
}

function requireDedicatedAdminAllowlist(value: string | undefined) {
  const adminEmails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.includes(ADMIN_EMAIL)) {
    throw new Error(
      `Refusing Ecosystem Intelligence E2E: add only ${ADMIN_EMAIL} to the ignored local ADMIN_EMAILS allowlist.`,
    );
  }
}
