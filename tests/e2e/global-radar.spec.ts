import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import {
  globalRadarBatchProposalSchema,
  type SearchQuery,
} from "../../app/domain/global-radar";
import {
  createGlobalRadarApplication,
  createGlobalRadarApplicationDependencies,
} from "../../app/server/global-radar";
import type { GlobalRadarConfig } from "../../app/server/global-radar/config";
import { hashToken } from "../../app/server/tokens";
import type {
  GlobalRadarAllowedAction,
  GlobalRadarRunItem,
  GlobalRadarSignalDetail,
} from "../../app/components/global-radar/types";
import { closeDb, getDb } from "../../db/client";
import {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarPromotions,
  globalRadarRuns,
  globalRadarSearchQueries,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../../db/global-radar-schema";
import { magicLinks, users } from "../../db/schema";
import { loadLocalEnvironment } from "../../scripts/load-local-env.mjs";
import {
  GLOBAL_RADAR_FICTIONAL_NOW,
  globalRadarFictionalFixtures,
} from "../fixtures/global-radar-fictional";
import {
  acceptanceToken,
  requireLocalAppDatabaseUrl,
  requireLoopbackBaseUrl,
} from "../support/acceptance-environment";
import {
  RADAR_ALLOWED_ACTIONS,
  RADAR_DETAIL_HEADINGS,
} from "../support/global-radar-ui-data";

const ADMIN_EMAIL = "mewtuals-mobile-e2e@example.test";
const RADAR_WORKER_SECRET =
  "global-radar-browser-worker-secret-distinct-and-longer-than-32-characters";
const PRIMARY_VIEWPORT = { width: 390, height: 844 } as const;
const RADAR_VIEWPORTS = [
  { width: 320, height: 740 },
  PRIMARY_VIEWPORT,
  { width: 767, height: 900 },
  { width: 1440, height: 1100 },
] as const;
const BASE_URL = requireLoopbackBaseUrl(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4000",
);
const PWA_BASE_URL = requireProductionPwaBaseUrl(
  process.env.PLAYWRIGHT_PWA_BASE_URL ?? "http://localhost:4002",
);
const TAB_CONTRACT = [
  ["Direct Demand", "/admin/global-demand-radar/direct-demand"],
  ["Demand Precursors", "/admin/global-demand-radar/demand-precursors"],
  ["Momentum", "/admin/global-demand-radar/momentum"],
  ["Watchlist", "/admin/global-demand-radar/watchlist"],
  ["Radar Runs", "/admin/global-demand-radar/runs"],
] as const;
const FORBIDDEN_MUTATION =
  /outreach|introductions?|send[_-]?email|send[_-]?message|messaging|contacts?|member[_-]?matching|automatic[_-]?matching/i;

loadLocalEnvironment();
requireLocalAppDatabaseUrl(process.env.DATABASE_URL);
requireDedicatedAdminAllowlist(process.env.ADMIN_EMAILS);

const database = getDb();
const fixtureSuffix = randomUUID().replaceAll("-", "").slice(0, 12);
const fixtureCountry = `Fictional China ${fixtureSuffix}`;
const ownedRunIds = new Set<string>();
const ownedSignalIds = new Set<string>();
const ownedEntityIds = new Set<string>();
const ownedWatchlistIds = new Set<string>();

let administrator: { userId: string; email: string };
let createdAdministrator = false;
let radar: ReturnType<typeof createGlobalRadarApplication>;
let currentTime = new Date(GLOBAL_RADAR_FICTIONAL_NOW);
let primarySignalId = "";
let duplicateSignalId = "";
let primaryEntityId = "";
let primaryTitle = "";
let primaryEntityName = "";
let initialDetail: GlobalRadarSignalDetail;
let initialRun: GlobalRadarRunItem;

const radarConfig: GlobalRadarConfig = {
  workerSecret: RADAR_WORKER_SECRET,
  countries: [fixtureCountry, "United States", "Japan"],
  languages: ["en", "zh-CN"],
  themes: ["robotics_manufacturing", "physical_ai_evaluation"],
  enabledSources: ["codex_public_web"],
  resultLimit: 20,
  thresholds: {
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
};

test.use({ viewport: PRIMARY_VIEWPORT });

test.beforeAll(async () => {
  await seedGlobalRadarBrowserFixture();
});

test.afterAll(async () => {
  try {
    await cleanupGlobalRadarBrowserFixture();
  } finally {
    await closeDb();
  }
});

test("all five Radar surfaces preserve navigation, strict lists, responsive layout, and the private offline boundary", async ({
  browser,
}) => {
  const admin = await authenticateDedicatedAdmin(browser, `navigation-${fixtureSuffix}`);
  try {
    const page = admin.page;
    const mutationRequests = collectRadarMutationRequests(page);

    for (const [label, path] of TAB_CONTRACT) {
      await page.goto(path);
      await waitForProductHydration(page);
      await expect(
        page.getByRole("heading", { name: "Global Demand Radar." }),
      ).toBeVisible();
      await assertTabContract(page, label);
      await auditRadarPage(page, label);
    }

    await page.goto("/admin/global-demand-radar/direct-demand");
    await waitForProductHydration(page);
    const directPagination = page.getByRole("navigation", {
      name: "Direct Demand pagination",
    });
    await expect(directPagination).toContainText("Page 1 of 2");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await expect(
      page.getByRole("table", { name: "Direct Demand signals" }),
    ).toBeVisible();
    await page.setViewportSize(PRIMARY_VIEWPORT);
    await expect(
      page.getByRole("list", { name: "Direct Demand signal cards" }),
    ).toBeVisible();
    await directPagination.getByRole("link", { name: "Next page" }).click();
    await expect(page).toHaveURL(/(?:\?|&)page=2(?:&|$)/);
    await waitForProductHydration(page);
    await expect(
      page.getByRole("navigation", { name: "Direct Demand pagination" }),
    ).toContainText("Page 2 of 2");
    await expect(
      page
        .getByRole("list", { name: "Direct Demand signal cards" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Direct Demand pagination" })
      .getByRole("link", { name: "Previous page" })
      .click();
    await expect(page).toHaveURL(/global-demand-radar\/direct-demand$/);

    const filters = page.getByRole("search", {
      name: "Filter Direct Demand signals",
    });
    await filters.getByLabel("Status").selectOption("newly_discovered");
    await filters.getByLabel("Country").fill(fixtureCountry);
    await filters
      .getByLabel("Demand domain")
      .selectOption("robotics_hardware_and_ecosystem_demand");
    await filters.getByLabel("Capability").fill("contract_manufacturing");
    await filters.getByLabel("Observed from").fill("2026-07-01");
    await filters.getByLabel("Observed through").fill("2026-07-31");
    await filters.getByLabel("Expires before").fill("2026-10-01");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await waitForProductHydration(page);
    const expectedFilters = new URLSearchParams([
      ["status", "newly_discovered"],
      ["country", fixtureCountry],
      ["demandDomain", "robotics_hardware_and_ecosystem_demand"],
      ["capability", "contract_manufacturing"],
      ["observedFrom", "2026-07-01"],
      ["observedTo", "2026-07-31"],
      ["expiresBefore", "2026-10-01"],
    ]);
    expect(new URL(page.url()).searchParams.toString()).toBe(
      expectedFilters.toString(),
    );
    await expect(
      page
        .getByRole("list", { name: "Direct Demand signal cards" })
        .getByText(primaryEntityName, { exact: true }),
    ).toBeVisible();

    await filters.getByLabel("Country").fill("No matching fictional country");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await waitForProductHydration(page);
    await expect(
      page.getByText("No Direct Demand signals match these filters."),
    ).toBeVisible();
    await page.goto("/admin/global-demand-radar/direct-demand?unknown=1&page=0");
    await expect(page).toHaveURL(/global-demand-radar\/direct-demand$/);

    await page.goto("/admin/global-demand-radar/demand-precursors");
    await waitForProductHydration(page);
    await expect(
      page.getByText("No Demand Precursors signals have been recorded yet."),
    ).toBeVisible();

    await page.goto(
      `/admin/global-demand-radar/signals/${primarySignalId}?returnTo=${encodeURIComponent("/admin/global-demand-radar/direct-demand")}`,
    );
    await waitForProductHydration(page);
    const detailHeadings = page.locator("article h2");
    await expect(detailHeadings).toHaveCount(RADAR_DETAIL_HEADINGS.length);
    await expect(detailHeadings).toHaveText([...RADAR_DETAIL_HEADINGS]);
    const originalLanguage = page.getByRole("region", {
      name: "Original-language source",
    });
    await expect(originalLanguage.locator('blockquote[lang="zh-CN"]')).toContainText(
      "公司正在寻找印度制造合作伙伴",
    );
    await auditRadarPage(page, "signal detail");

    const tabRail = page.getByRole("navigation", {
      name: "Global Demand Radar sections",
    });
    await tabRail.focus();
    await expect(tabRail).toBeFocused();
    const currentTab = tabRail.getByRole("link", { name: "Direct Demand" });
    await currentTab.focus();
    await page.keyboard.press("Tab");
    await expect(
      tabRail.getByRole("link", { name: "Demand Precursors" }),
    ).toBeFocused();

    expect(mutationRequests).toEqual([]);
    expect(admin.errors).toEqual([]);
  } finally {
    await admin.context.close();
  }

  const offlineAdmin = await authenticateDedicatedAdmin(
    browser,
    `offline-${fixtureSuffix}`,
  );
  try {
    await offlineAdmin.page.goto(`${PWA_BASE_URL}/`);
    await offlineAdmin.page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await offlineAdmin.page.reload();
    await offlineAdmin.page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );
    await offlineAdmin.context.setOffline(true);
    await offlineAdmin.page.goto(
      `${PWA_BASE_URL}/admin/global-demand-radar/direct-demand`,
    );
    await expect(
      offlineAdmin.page.getByRole("heading", {
        name: "Get online to see your partnerships.",
      }),
    ).toBeVisible();
    await expect(offlineAdmin.page.getByText(primaryTitle)).toHaveCount(0);
    await expect(offlineAdmin.page.getByText(primaryEntityName)).toHaveCount(0);
    await expect(
      offlineAdmin.page.getByRole("heading", { name: "Global Demand Radar." }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(offlineAdmin.page);
  } finally {
    await offlineAdmin.context.setOffline(false);
    await offlineAdmin.context.close();
  }
});

test("every allowed administrator action uses a bounded Radar mutation and adopts the latest revision after a 409", async ({
  browser,
}) => {
  const admin = await authenticateDedicatedAdmin(browser, `actions-${fixtureSuffix}`);
  try {
    const page = admin.page;
    await page.goto(
      `/admin/global-demand-radar/signals/${primarySignalId}?returnTo=${encodeURIComponent("/admin/global-demand-radar/direct-demand")}`,
    );
    await waitForProductHydration(page);

    const mutations: RadarMutation[] = [];
    let detail = browserDetail(initialDetail.revision, "newly_discovered");
    let issueConflict = true;
    await page.route("**/api/admin/global-demand-radar/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        url.pathname === `/api/admin/global-demand-radar/signals/${primarySignalId}`
      ) {
        await fulfillJson(route, 200, {
          ok: true,
          outcome: "found",
          detail,
        });
        return;
      }
      if (!["PATCH", "POST"].includes(request.method())) {
        throw new Error(`Unexpected Radar request: ${request.method()} ${url.pathname}`);
      }
      const body = parseMutationBody(request.postData());
      assertSafeRadarMutation(url.pathname, body);
      mutations.push({ method: request.method(), path: url.pathname, body });

      if (
        issueConflict &&
        url.pathname === `/api/admin/global-demand-radar/signals/${primarySignalId}` &&
        reviewCommand(body) === "request_review"
      ) {
        issueConflict = false;
        detail = browserDetail(numberField(body, "expectedRevision") + 1, "needs_review");
        await fulfillJson(route, 409, {
          ok: false,
          outcome: "conflict",
          reason: "revision_mismatch",
          latest: detail,
        });
        return;
      }

      detail = browserDetail(detail.revision + 1, statusAfterMutation(body, url.pathname));
      if (url.pathname.endsWith("/evidence") || url.pathname.endsWith("/notes")) {
        await fulfillJson(route, 200, {
          ok: true,
          outcome: "appended",
          revision: detail.revision,
        });
        return;
      }
      if (url.pathname.endsWith("/merge")) {
        await fulfillJson(route, 200, {
          ok: true,
          outcome: "merged",
          survivor: detail,
          duplicate: { id: duplicateSignalId, revision: 1 },
        });
        return;
      }
      if (url.pathname.endsWith("/watchlist")) {
        await fulfillJson(route, 200, { ok: true, outcome: "updated" });
        return;
      }
      if (url.pathname.endsWith("/promotions/reverse")) {
        await fulfillJson(route, 200, { ok: true, outcome: "reversed" });
        return;
      }
      if (url.pathname.endsWith("/promotions")) {
        await fulfillJson(route, 200, { ok: true, outcome: "promoted" });
        return;
      }
      await fulfillJson(route, 200, {
        ok: true,
        outcome: "updated",
        detail,
      });
    });

    await fillReviewReason(page, "Stale review contract");
    await page.getByRole("button", { name: "Request review" }).click();
    const conflict = page
      .getByRole("alert")
      .filter({ hasText: "latest safe state" });
    await expect(conflict).toBeFocused();
    await expect(page.getByText(`revision ${detail.revision}`, { exact: false }).first()).toBeVisible();
    await conflict
      .getByRole("button", { name: "Review latest state and retry" })
      .click();
    await expect(
      page.getByRole("region", { name: "Available administrator actions" }),
    ).toBeFocused();
    await fillReviewReason(page, "Retry after adopting latest revision");
    await page.getByRole("button", { name: "Request review" }).click();
    await expect(page.getByRole("status")).toContainText("Signal updated.");
    expect(numberField(mutations[0]!.body, "expectedRevision")).toBe(
      initialDetail.revision,
    );
    expect(numberField(mutations[1]!.body, "expectedRevision")).toBe(
      initialDetail.revision + 1,
    );

    for (const [label, reason] of [
      ["Monitor", "Monitor public evidence"],
      ["Qualify", "Evidence reviewed"],
      ["Dismiss", "Dismiss fictional signal"],
      ["Expire", "Expire fictional signal"],
      ["Reopen", "Reopen for review"],
      ["Mark no India fit", "No current India fit"],
    ] as const) {
      await fillReviewReason(page, reason);
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByRole("status")).toContainText("Signal updated.");
    }

    await page.getByLabel("Classification reason").fill("Refresh classification scores");
    await page.getByRole("button", { name: "Save classification" }).click();
    await expect(page.getByRole("status")).toContainText("Classification updated.");

    await page.getByLabel("Expiry reason").fill("Record the fictional deadline");
    await page.getByRole("button", { name: "Save expiry" }).click();
    await expect(page.getByRole("status")).toContainText("Expiry updated.");

    await page.getByLabel("Evidence reason").fill("Append a public fictional source");
    await page
      .getByRole("textbox", { name: "Source URL", exact: true })
      .fill("https://radar-e2e.example/public-source");
    await page
      .getByLabel("Canonical source URL")
      .fill("https://radar-e2e.example/public-source");
    await page.getByLabel("Source name").fill("Radar E2E public registry");
    await page.getByLabel("Source type").fill("official_update");
    await page.getByLabel("Source language").fill("zh-CN");
    await page.getByLabel("Source country").fill(fixtureCountry);
    await page
      .getByLabel("Public claim")
      .fill("公司发布了仅用于浏览器验收测试的公开制造需求。");
    await page
      .getByLabel("Evidence English summary")
      .fill("A fictional public manufacturing request used only for browser acceptance.");
    await page.getByLabel("Observed at (ISO timestamp)").fill("2026-07-31T03:00:00.000Z");
    await page.getByLabel("Supported field paths").fill("signal.factualSummary");
    await page.getByRole("button", { name: "Append evidence" }).click();
    await expect(page.getByRole("status")).toContainText("Evidence appended.");

    await page.getByLabel("Note reason").fill("Record administrator review");
    await page.getByLabel("Administrator note").fill("Fictional browser acceptance note.");
    await page.getByRole("button", { name: "Append note" }).click();
    await expect(page.getByRole("status")).toContainText("Note appended.");

    await page.getByLabel("Duplicate signal ID").fill(duplicateSignalId);
    await page.getByLabel("Duplicate revision").fill("0");
    await page.getByLabel("Merge reason").fill("Confirmed fictional duplicate");
    await page.getByLabel("Confirm preserved merge history").check();
    await page.getByRole("button", { name: "Merge into this signal" }).click();
    await expect(page.getByRole("status")).toContainText("history preserved");

    await page.getByLabel("Watchlist reason").fill("Keep the fictional public signal monitored");
    await page.getByRole("button", { name: "Save watchlist" }).click();
    await expect(page.getByRole("status")).toContainText("Watchlist updated.");

    await page.getByLabel("Promotion reason").fill("Controlled fictional intake");
    await page
      .getByLabel("Promotion rationale")
      .fill("Qualified explicit India demand with public fictional evidence.");
    await page.getByRole("button", { name: "Promote to India Discovery" }).click();
    await expect(page.getByRole("status")).toContainText("Promoted to India Discovery.");

    await page.getByLabel("Reversal reason").fill("Reverse the fictional intake only");
    await page.getByLabel("Confirm Discovery candidate preservation").check();
    await page.getByRole("button", { name: "Reverse promotion" }).click();
    await expect(page.getByRole("status")).toContainText("candidate remains intact");

    expect(actionsRepresentedBy(mutations)).toEqual(
      new Set<GlobalRadarAllowedAction>(RADAR_ALLOWED_ACTIONS),
    );
    for (const mutation of mutations) {
      assertSafeRadarMutation(mutation.path, mutation.body);
    }
    expect(admin.errors.filter((error) => !error.includes("409"))).toEqual([]);
  } finally {
    await admin.context.close();
  }
});

test("watchlist and manual-run unknown outcomes retry the exact same request", async ({
  browser,
}) => {
  const admin = await authenticateDedicatedAdmin(browser, `retry-${fixtureSuffix}`);
  try {
    const page = admin.page;
    await page.goto("/admin/global-demand-radar/watchlist");
    await waitForProductHydration(page);
    const card = page.getByRole("region", { name: primaryEntityName });
    const watchlistBodies: Record<string, unknown>[] = [];
    let watchlistAttempt = 0;
    await page.route(
      `**/api/admin/global-demand-radar/entities/${primaryEntityId}/watchlist`,
      async (route) => {
        const body = parseMutationBody(route.request().postData());
        assertSafeRadarMutation(new URL(route.request().url()).pathname, body);
        watchlistBodies.push(body);
        watchlistAttempt += 1;
        if (watchlistAttempt === 1) {
          await route.abort("failed");
          return;
        }
        const configuration = recordField(body, "configuration");
        await fulfillJson(route, 200, {
          ok: true,
          outcome: "updated",
          entity: {
            id: primaryEntityId,
            canonicalName: primaryEntityName,
            headquartersCountry: fixtureCountry,
            entityStatus: "watchlisted",
            revision: 2,
          },
          entry: {
            id: [...ownedWatchlistIds][0],
            globalEntityId: primaryEntityId,
            state: configuration.state,
            priority: configuration.priority,
            theme: configuration.theme,
            category: configuration.category,
            categorySearchTermEn: configuration.categorySearchTermEn,
            categorySearchTermZhCn: configuration.categorySearchTermZhCn,
            countries: configuration.countries,
            languages: configuration.languages,
            cadenceDays: configuration.cadenceDays,
            nextScanAt: configuration.nextScanAt,
            reason: body.reason,
            revision: 1,
          },
        });
      },
    );
    await card.getByRole("button", { name: `Pause ${primaryEntityName}` }).click();
    await expect(page.getByRole("alert")).toHaveText(/outcome is unknown/i);
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(card.getByLabel("Update reason")).toBeDisabled();
    await expect(
      card.getByRole("button", { name: `Disable ${primaryEntityName}` }),
    ).toHaveCount(0);
    await expect(
      card.getByRole("link", { name: "Review current watchlist state" }),
    ).toHaveAttribute("href", "/admin/global-demand-radar/watchlist");
    await card
      .getByRole("button", { name: `Retry exact update for ${primaryEntityName}` })
      .click();
    await expect(page.getByRole("status")).toHaveText("Watchlist updated.");
    expect(watchlistBodies).toHaveLength(2);
    expect(watchlistBodies[1]).toEqual(watchlistBodies[0]);

    await page.unroute(
      `**/api/admin/global-demand-radar/entities/${primaryEntityId}/watchlist`,
    );
    await page.goto("/admin/global-demand-radar/runs");
    await waitForProductHydration(page);
    const runBodies: Record<string, unknown>[] = [];
    await page.route("**/api/admin/global-demand-radar/runs", async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, 200, {
          ok: true,
          outcome: "listed",
          page: 1,
          pageSize: 25,
          total: 1,
          runs: [initialRun],
        });
        return;
      }
      const body = parseMutationBody(route.request().postData());
      assertSafeRadarMutation(new URL(route.request().url()).pathname, body);
      runBodies.push(body);
      if (runBodies.length === 1) {
        await fulfillJson(route, 200, { ok: true, outcome: "queued" });
        return;
      }
      await fulfillJson(route, 200, {
        ok: true,
        outcome: "replayed",
        run: manualRunDto(String(body.requestId)),
      });
    });
    await page.getByLabel("Optional theme").selectOption("robotics_manufacturing");
    await page.getByRole("button", { name: "Queue manual Radar run" }).click();
    await expect(page.getByRole("alert")).toContainText("outcome is unknown");
    await expect(page.getByLabel("Optional theme")).toBeDisabled();
    await page.getByRole("button", { name: "Retry same manual request" }).click();
    await expect(page.getByRole("status")).toContainText("already queued");
    expect(runBodies).toHaveLength(2);
    expect(runBodies[1]).toEqual(runBodies[0]);
    expect(admin.errors).toEqual([
      "Failed to load resource: net::ERR_FAILED",
    ]);
  } finally {
    await admin.context.close();
  }
});

type RadarMutation = Readonly<{
  method: string;
  path: string;
  body: Record<string, unknown>;
}>;

async function seedGlobalRadarBrowserFixture() {
  const existing = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);
  const existingAdministrator = existing[0];
  if (existingAdministrator) {
    administrator = {
      userId: existingAdministrator.id,
      email: existingAdministrator.email,
    };
  } else {
    const [created] = await database
      .insert(users)
      .values({
        id: randomUUID(),
        email: ADMIN_EMAIL,
        name: "Global Radar Browser Administrator",
      })
      .returning({ id: users.id, email: users.email });
    if (!created) throw new Error("The Radar browser administrator was not created.");
    administrator = { userId: created.id, email: created.email };
    createdAdministrator = true;
  }

  radar = createGlobalRadarApplication(
    createGlobalRadarApplicationDependencies({
      database,
      config: radarConfig,
      adminEmails: [ADMIN_EMAIL],
      now: () => new Date(currentTime.getTime()),
      issueLeaseToken: () => randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    }),
  );

  await seedCompletedRun(
    globalRadarFictionalFixtures.chineseIndianManufacturingDirectDemand.input,
    "robotics_manufacturing",
    20,
    "direct-a",
    fixtureCountry,
  );
  await seedCompletedRun(
    globalRadarFictionalFixtures.chineseIndianManufacturingDirectDemand.input,
    "robotics_manufacturing",
    6,
    "direct-b",
    fixtureCountry,
  );
  await seedCompletedRun(
    globalRadarFictionalFixtures.multiOrganisationPhysicalAiPlatformMomentum.input,
    "physical_ai_evaluation",
    1,
    "momentum",
  );

  const ownedSignals = await database
    .select({
      id: globalRadarSignals.id,
      globalEntityId: globalRadarSignals.globalEntityId,
      title: globalRadarSignals.title,
    })
    .from(globalRadarSignals)
    .where(inArray(globalRadarSignals.firstRunId, [...ownedRunIds]));
  for (const signal of ownedSignals) {
    ownedSignalIds.add(signal.id);
    if (signal.globalEntityId) ownedEntityIds.add(signal.globalEntityId);
  }
  const associations = await database
    .select({ globalEntityId: globalRadarSignalEntities.globalEntityId })
    .from(globalRadarSignalEntities)
    .where(inArray(globalRadarSignalEntities.signalId, [...ownedSignalIds]));
  for (const association of associations) ownedEntityIds.add(association.globalEntityId);

  const primary = ownedSignals.find(({ title }) =>
    title.startsWith(`全球雷达浏览器验收 ${fixtureSuffix}`),
  );
  const duplicate = ownedSignals.find(
    ({ id, globalEntityId }) => id !== primary?.id && globalEntityId !== null,
  );
  if (!primary?.globalEntityId || !duplicate) {
    throw new Error("The Radar browser signal fixture was not persisted.");
  }
  primarySignalId = primary.id;
  duplicateSignalId = duplicate.id;
  primaryEntityId = primary.globalEntityId;
  primaryTitle = primary.title;
  const [entity] = await database
    .select()
    .from(globalEntities)
    .where(eq(globalEntities.id, primaryEntityId));
  if (!entity) throw new Error("The Radar browser entity fixture was not persisted.");
  primaryEntityName = entity.canonicalName;

  currentTime = new Date(currentTime.getTime() + 1_000);
  const watchlisted = await radar.admin.upsertWatchlist(administrator, {
    entity: {
      type: "existing",
      entityId: primaryEntityId,
      expectedRevision: entity.revision,
    },
    expectedEntryRevision: null,
    idempotencyKey: randomUUID(),
    reason: "Monitor the fictional browser acceptance signal.",
    configuration: {
      state: "enabled",
      priority: 80,
      theme: "robotics_manufacturing",
      category: "contract_manufacturing",
      categorySearchTermEn: "fictional robotics contract manufacturing",
      categorySearchTermZhCn: "虚构机器人合同制造",
      countries: [fixtureCountry],
      languages: ["en", "zh-CN"],
      cadenceDays: 7,
      nextScanAt: "2026-08-07T00:00:00.000Z",
    },
  });
  if (watchlisted.outcome !== "created") {
    throw new Error(`The Radar browser watchlist fixture returned ${watchlisted.outcome}.`);
  }
  ownedWatchlistIds.add(watchlisted.entry.id);

  const detailResult = await radar.admin.getSignalDetail(
    administrator,
    primarySignalId,
  );
  if (detailResult.outcome !== "found") {
    throw new Error("The Radar browser detail fixture was not readable.");
  }
  initialDetail = detailResult.detail as GlobalRadarSignalDetail;
  const runs = await radar.admin.listRuns(administrator, { page: 1 });
  if (runs.outcome !== "listed" || !runs.runs[0]) {
    throw new Error("The Radar browser run fixture was not readable.");
  }
  initialRun = runs.runs[0] as GlobalRadarRunItem;
}

async function seedCompletedRun(
  sourceFixture: unknown,
  theme: "robotics_manufacturing" | "physical_ai_evaluation",
  signalCount: number,
  marker: string,
  countryOverride?: string,
) {
  const requestId = randomUUID();
  const queued = await radar.run.queueManual(administrator, { requestId, theme });
  if (queued.outcome !== "queued") {
    throw new Error(`The Radar browser run was not queued: ${queued.outcome}.`);
  }
  ownedRunIds.add(queued.run.id);
  currentTime = new Date(currentTime.getTime() + 1_000);
  const worker = radar.run.authorizeWorker(`Bearer ${RADAR_WORKER_SECRET}`);
  if (!worker) throw new Error("The Radar browser worker was not authorized.");
  const claimed = await radar.run.claim(worker, {});
  if (claimed.outcome !== "claimed" || claimed.claim.runId !== queued.run.id) {
    throw new Error(`The Radar browser run was not claimed: ${claimed.outcome}.`);
  }
  const claim = claimed.claim;
  currentTime = new Date(currentTime.getTime() + 1_000);
  const batch = browserBatch(
    sourceFixture,
    claim.runId,
    claim.plan.fingerprint,
    claim.queries,
    signalCount,
    marker,
    countryOverride,
  );
  const completed = await radar.run.complete(worker, {
    runId: claim.runId,
    leaseToken: claim.leaseToken,
    batch,
  });
  if (completed.outcome !== "completed") {
    throw new Error(`The Radar browser run was not completed: ${completed.outcome}.`);
  }
}

function browserBatch(
  sourceFixture: unknown,
  runId: string,
  planFingerprint: string,
  queries: readonly SearchQuery[],
  count: number,
  marker: string,
  countryOverride?: string,
) {
  const source = globalRadarBatchProposalSchema.parse(
    structuredClone(sourceFixture),
  );
  const entities: Record<string, unknown>[] = [];
  const signals: Record<string, unknown>[] = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = `${fixtureSuffix}-${marker}-${String(index + 1).padStart(2, "0")}`;
    const referenceMap = new Map<string, string>();
    for (const entity of source.entities) {
      const nextReference = `${entity.entityRef}-${suffix}`;
      referenceMap.set(entity.entityRef, nextReference);
      const host = `radar-${suffix}-${entities.length}`.toLowerCase();
      entities.push({
        ...entity,
        entityRef: nextReference,
        canonicalName:
          marker === "direct-a" && index === 0
            ? `玉龙机器人系统全球制造需求浏览器验收${"超长组织名称".repeat(8)}${fixtureSuffix}`
            : `${entity.canonicalName} E2E ${suffix}`,
        websiteUrl: `https://${host}.example/about`,
        stablePublicIdentifiers: [
          { namespace: "fictional_registry", value: host },
        ],
        canonicalCorporateGroupId: `group:${host}`,
        ...(countryOverride ? {
          headquartersCountry: countryOverride,
          operatingCountries: [countryOverride],
        } : {}),
      });
    }
    const template = source.signals[index % source.signals.length]!;
    const evidence = template.evidence.map((item, evidenceIndex) => {
      const host = `radar-source-${suffix}-${evidenceIndex}`.toLowerCase();
      return {
        ...item,
        contributorEntityRef: item.contributorEntityRef
          ? referenceMap.get(item.contributorEntityRef)
          : null,
        sourceUrl: `https://${host}.example/public-evidence`,
        canonicalSourceUrl: `https://${host}.example/public-evidence`,
        sourceName: `Radar E2E public source ${suffix}`,
        ...(countryOverride ? { sourceCountry: countryOverride } : {}),
        ...(marker === "direct-a" && index === 0
          ? {
              claim: "公司正在寻找印度制造合作伙伴，为虚构移动机器人平台生产组件并验证质量体系。".repeat(18),
            }
          : {}),
      };
    });
    signals.push({
      ...template,
      externalSignalId: `${template.externalSignalId}-${suffix}`,
      primaryEntityRef: template.primaryEntityRef
        ? referenceMap.get(template.primaryEntityRef)
        : null,
      associatedEntities: template.associatedEntities.map((association) => ({
        ...association,
        entityRef: referenceMap.get(association.entityRef),
      })),
      title:
        marker === "direct-a" && index === 0
          ? `全球雷达浏览器验收 ${fixtureSuffix} ${"制造需求".repeat(20)}`
          : `Radar E2E ${suffix}: ${template.title}`,
      ...(countryOverride ? { sourceCountry: countryOverride } : {}),
      evidence,
    });
  }
  return {
    ...source,
    runId,
    planFingerprint,
    executedQueries: executedQueries(queries, currentTime),
    entities,
    signals,
    sourceErrors: [],
  };
}

function executedQueries(queries: readonly SearchQuery[], executedAt: Date) {
  return queries.map((query) => ({
    ...query,
    executedAt: executedAt.toISOString(),
    resultsExamined: 2,
    error: null,
  }));
}

async function cleanupGlobalRadarBrowserFixture() {
  requireLocalAppDatabaseUrl(process.env.DATABASE_URL);
  const signalIds = [...ownedSignalIds];
  const entityIds = [...ownedEntityIds];
  const runIds = [...ownedRunIds];
  const watchlistIds = [...ownedWatchlistIds];
  const targetIds = [...new Set([...signalIds, ...entityIds, ...runIds, ...watchlistIds])];
  if (targetIds.length > 0) {
    await database
      .delete(globalRadarAdminEvents)
      .where(inArray(globalRadarAdminEvents.targetId, targetIds));
  }
  if (signalIds.length > 0) {
    await database
      .delete(globalSignalUpdates)
      .where(inArray(globalSignalUpdates.signalId, signalIds));
    await database
      .delete(globalRadarPromotions)
      .where(inArray(globalRadarPromotions.primarySignalId, signalIds));
    await database
      .delete(globalSignalEvidence)
      .where(inArray(globalSignalEvidence.signalId, signalIds));
    await database
      .delete(globalSignalRequirements)
      .where(inArray(globalSignalRequirements.signalId, signalIds));
    await database
      .delete(globalRadarSignalEntities)
      .where(inArray(globalRadarSignalEntities.signalId, signalIds));
  }
  if (entityIds.length > 0) {
    await database
      .delete(globalRadarWatchlistEntries)
      .where(inArray(globalRadarWatchlistEntries.globalEntityId, entityIds));
  }
  if (signalIds.length > 0) {
    await database
      .delete(globalRadarSignals)
      .where(inArray(globalRadarSignals.id, signalIds));
  }
  if (entityIds.length > 0) {
    await database
      .delete(globalEntities)
      .where(inArray(globalEntities.id, entityIds));
  }
  if (runIds.length > 0) {
    await database
      .delete(globalRadarSearchQueries)
      .where(inArray(globalRadarSearchQueries.runId, runIds));
    await database
      .delete(globalRadarRuns)
      .where(inArray(globalRadarRuns.id, runIds));
  }
  await database.delete(magicLinks).where(eq(magicLinks.email, ADMIN_EMAIL));
  if (createdAdministrator && administrator) {
    await database.delete(users).where(eq(users.id, administrator.userId));
  }
}

async function authenticateDedicatedAdmin(
  browser: Browser,
  purpose: string,
): Promise<{
  context: BrowserContext;
  errors: string[];
  page: Page;
}> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required for Radar browser acceptance.");
  }
  await database.delete(magicLinks).where(eq(magicLinks.email, ADMIN_EMAIL));
  const token = acceptanceToken(purpose, ADMIN_EMAIL);
  const now = new Date();
  await database.insert(magicLinks).values({
    email: ADMIN_EMAIL,
    tokenHash: hashToken(token, sessionSecret),
    issued: true,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: PRIMARY_VIEWPORT,
  });
  const page = await context.newPage();
  const errors = trackBrowserErrors(page);
  await page.goto(`/auth/verify?token=${encodeURIComponent(token)}`);
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Mewtuals" }).click();
  return { context, errors, page };
}

async function assertTabContract(page: Page, currentLabel: string) {
  const tabs = page.getByRole("navigation", {
    name: "Global Demand Radar sections",
  });
  const links = tabs.getByRole("link");
  await expect(links).toHaveCount(TAB_CONTRACT.length);
  await expect(links).toHaveText(TAB_CONTRACT.map(([label]) => label));
  await expect(
    tabs.getByRole("link", { name: currentLabel }),
  ).toHaveAttribute("aria-current", "page");
  for (const [label, path] of TAB_CONTRACT) {
    await expect(tabs.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      path,
    );
  }
}

async function auditRadarPage(page: Page, label: string) {
  for (const viewport of RADAR_VIEWPORTS) {
    await test.step(`${label} at ${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
      const tabs = page.getByRole("navigation", {
        name: "Global Demand Radar sections",
      });
      const overflow = await tabs.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }));
      expect(["auto", "scroll"]).toContain(overflow.overflowX);
      if (viewport.width <= 390) {
        expect(overflow.scrollWidth).toBeGreaterThanOrEqual(overflow.clientWidth);
      }
      if (viewport.width <= 767) await expectTouchControls(page);
    });
  }
  await page.setViewportSize(PRIMARY_VIEWPORT);
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
    const identity = await control.evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
      label: element.getAttribute("aria-label") ?? "",
    }));
    const description = `${identity.tag} ${identity.label || identity.text}`.trim();
    expect(box?.height ?? 0, `touch height: ${description}`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `touch width: ${description}`).toBeGreaterThanOrEqual(44);
  }
  const toggles = page.locator('input[type="checkbox"], input[type="radio"]');
  for (const toggle of await toggles.all()) {
    if (!(await toggle.isVisible())) continue;
    const label = toggle.locator("xpath=ancestor::label[1]");
    await expect(label).toHaveCount(1);
    const box = await label.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
}

function browserDetail(
  revision: number,
  status:
    | "newly_discovered"
    | "needs_review"
    | "monitoring"
    | "qualified"
    | "dismissed"
    | "expired"
    | "promoted",
): GlobalRadarSignalDetail {
  const source = structuredClone(initialDetail);
  return {
    ...source,
    revision,
    status,
    allowedActions: [...RADAR_ALLOWED_ACTIONS],
    sections: source.sections.map((section) => {
      if (section.id === "signal_class") {
        return { ...section, data: { ...section.data, status } };
      }
      if (section.id === "admin_notes_and_actions") {
        return {
          ...section,
          data: {
            ...section.data,
            promotion:
              status === "promoted"
                ? {
                    id: randomUUID(),
                    status: "active",
                    discoveryCandidateId: randomUUID(),
                    revisionContext: {
                      promotedEntity: 2,
                      promotedPrimarySignal: revision,
                    },
                  }
                : null,
          },
        };
      }
      return section;
    }),
  };
}

async function fillReviewReason(page: Page, reason: string) {
  await page.getByLabel("Review reason").fill(reason);
}

function statusAfterMutation(
  body: Record<string, unknown>,
  path: string,
): GlobalRadarSignalDetail["status"] {
  if (path.endsWith("/promotions")) return "promoted";
  if (path.endsWith("/promotions/reverse")) return "qualified";
  const command = reviewCommand(body);
  const statuses: Partial<
    Record<string, GlobalRadarSignalDetail["status"]>
  > = {
    request_review: "needs_review",
    monitor: "monitoring",
    qualify: "qualified",
    dismiss: "dismissed",
    expire: "expired",
    reopen: "needs_review",
    mark_no_india_fit: "monitoring",
  };
  return statuses[command ?? ""] ?? "monitoring";
}

function actionsRepresentedBy(mutations: readonly RadarMutation[]) {
  const actions = new Set<GlobalRadarAllowedAction>();
  for (const { path, body } of mutations) {
    const command = reviewCommand(body);
    if (command) actions.add(command as GlobalRadarAllowedAction);
    else if ("classification" in body) actions.add("edit_classification");
    else if ("expiry" in body) actions.add("edit_expiry");
    else if (path.endsWith("/evidence")) actions.add("append_evidence");
    else if (path.endsWith("/notes")) actions.add("append_note");
    else if (path.endsWith("/merge")) actions.add("merge");
    else if (path.endsWith("/watchlist")) actions.add("edit_watchlist");
    else if (path.endsWith("/promotions/reverse")) actions.add("reverse_promotion");
    else if (path.endsWith("/promotions")) actions.add("promote");
  }
  return actions;
}

function collectRadarMutationRequests(page: Page): RadarMutation[] {
  const mutations: RadarMutation[] = [];
  page.on("request", (request) => {
    if (
      !request.url().includes("/api/admin/global-demand-radar/") ||
      !["PATCH", "POST", "PUT", "DELETE"].includes(request.method())
    ) return;
    const body = parseMutationBody(request.postData());
    mutations.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      body,
    });
  });
  return mutations;
}

function parseMutationBody(value: string | null): Record<string, unknown> {
  if (!value) throw new Error("Every Radar mutation must have a JSON body.");
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Every Radar mutation must have an object JSON body.");
  }
  return parsed as Record<string, unknown>;
}

function assertSafeRadarMutation(
  path: string,
  body: Record<string, unknown>,
) {
  const serialized = `${path}\n${JSON.stringify(body)}`;
  expect(serialized).not.toMatch(FORBIDDEN_MUTATION);
  expect(path).toMatch(/^\/api\/admin\/global-demand-radar\//);
}

function reviewCommand(body: Record<string, unknown>): string | null {
  const command = body.command;
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    return null;
  }
  const type = (command as Record<string, unknown>).type;
  return typeof type === "string" ? type : null;
}

function numberField(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number") {
    throw new Error(`Radar mutation field ${key} must be numeric.`);
  }
  return value;
}

function recordField(
  body: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = body[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Radar mutation field ${key} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function manualRunDto(requestId: string): GlobalRadarRunItem {
  return {
    ...initialRun,
    id: requestId,
    trigger: "manual",
    scanMode: "manual",
    status: "queued",
    startedAt: null,
    completedAt: null,
    counts: {
      resultsExamined: 0,
      entitiesObserved: 0,
      signalsFound: 0,
      directDemands: 0,
      precursors: 0,
      momentumRecords: 0,
      new: 0,
      updated: 0,
      duplicates: 0,
      rejectedForWeakEvidence: 0,
      sourceErrors: 0,
    },
    notices: [],
  };
}

async function fulfillJson(
  route: Parameters<Parameters<Page["route"]>[1]>[0],
  status: number,
  body: unknown,
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function trackBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function waitForProductHydration(page: Page) {
  await expect(page.locator('[data-product-hydrated="true"]')).toHaveCount(1);
}

function requireDedicatedAdminAllowlist(value: string | undefined) {
  const adminEmails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.includes(ADMIN_EMAIL)) {
    throw new Error(
      `Refusing Radar E2E: add only ${ADMIN_EMAIL} to the ignored local ADMIN_EMAILS allowlist.`,
    );
  }
}

function requireProductionPwaBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PLAYWRIGHT_PWA_BASE_URL must be an exact loopback URL.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(hostname) ||
    url.port !== "4002" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "PLAYWRIGHT_PWA_BASE_URL must be an exact loopback origin on port 4002.",
    );
  }
  return url.origin;
}
