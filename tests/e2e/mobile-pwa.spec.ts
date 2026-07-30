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
  candidateResearchVersions,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  magicLinks,
  users,
} from "../../db/schema";
import { loadLocalEnvironment } from "../../scripts/load-local-env.mjs";
import {
  acceptanceToken,
  requireLocalAppDatabaseUrl,
  requireLoopbackBaseUrl,
} from "../support/acceptance-environment";

const ADMIN_EMAIL = "mewtuals-mobile-e2e@example.test";
const PRIMARY_VIEWPORT = { width: 390, height: 844 } as const;
const AUDIT_VIEWPORTS = [
  PRIMARY_VIEWPORT,
  { width: 320, height: 740 },
  { width: 767, height: 900 },
] as const;
const DESKTOP_VIEWPORT = { width: 1440, height: 1100 } as const;
const BASE_URL = requireLoopbackBaseUrl(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4000",
);
const PWA_BASE_URL = requireProductionPwaBaseUrl(
  process.env.PLAYWRIGHT_PWA_BASE_URL ?? "http://localhost:4002",
);

loadLocalEnvironment();
requireLocalAppDatabaseUrl(process.env.DATABASE_URL);
requireDedicatedAdminAllowlist(process.env.ADMIN_EMAILS);

const database = getDb();
let memberEmail: string | undefined;
let discoveryFixture:
  | { candidateId: string; runIds: [string, string] }
  | undefined;

test.use({ viewport: PRIMARY_VIEWPORT });

test.beforeEach(async () => {
  await removeDisposableAccount(ADMIN_EMAIL);
  await removeDiscoveryFixture();
});

test.afterEach(async () => {
  if (memberEmail) await removeDisposableAccount(memberEmail);
  await removeDisposableAccount(ADMIN_EMAIL);
  await removeDiscoveryFixture();
  memberEmail = undefined;
});

test.afterAll(async () => {
  await closeDb();
});

test("mobile member and administrator journey stays responsive and private offline", async ({
  browser,
  context,
  page,
}) => {
  const runId = randomUUID();
  memberEmail = `mobile-pwa-${runId}@example.test`;
  const profileName = `Mobile Acceptance ${runId.slice(0, 8)}`;
  const websiteHost = `mobile-${runId}.example`;
  const memberErrors = trackBrowserErrors(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "One partnership can change a company. We find the right one.",
    }),
  ).toBeVisible();
  await auditResponsiveState(page, "landing", { desktop: true });
  await verifyLandingKeyboardInteractions(page);

  const primaryNavigation = page.locator("#primary-navigation");
  const primaryLinks = primaryNavigation.locator("a");
  await expect(primaryLinks).toHaveCount(5);
  await expect(primaryLinks).toHaveText([
    "How it works",
    "For startups",
    "For creators",
    "Join Mewtuals",
    "Log in",
  ]);
  await expect(primaryLinks.filter({ hasText: /^About$/ })).toHaveCount(0);
  await expect(primaryLinks.filter({ hasText: /^Apply$/ })).toHaveCount(0);

  await page
    .getByRole("button", { name: /Open case study:/ })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Apply with this path" })
    .click();
  await expect(page).toHaveURL(/\/apply$/);
  await expect(
    page.getByRole("heading", { name: "Put Mewtuals on your company’s side." }),
  ).toBeVisible();
  await expect(page.getByLabel("Company URL")).toBeVisible();
  await expect(
    page.locator("#primary-navigation a").filter({ hasText: /^How it works$/ }),
  ).toHaveAttribute("href", "/#how-it-works");
  await auditResponsiveState(page, "application page", { desktop: true });

  await page.goto("/network/join");
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Find the right partnership moment." }),
  ).toBeVisible();
  await auditResponsiveState(page, "member join");
  await page.getByLabel("Email address").fill(memberEmail);
  await page.getByRole("button", { name: "Join Mewtuals" }).click();
  await expect(
    page.getByRole("link", { name: "Open local sign-in link" }),
  ).toBeVisible();
  await auditResponsiveState(page, "member join magic-link result");

  await page.goto("/login");
  await waitForProductHydration(page);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await auditResponsiveState(page, "login");

  await page.goto("/auth/verify?token=invalid");
  await expect(
    page.getByRole("heading", { name: "This sign-in link is not valid." }),
  ).toBeVisible();
  await auditResponsiveState(page, "invalid magic link");

  await openLocalMagicLink(page, memberEmail, runId);
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/verify\?token=/);
  await auditResponsiveState(page, "magic-link confirmation");
  await page.getByRole("button", { name: "Continue to Mewtuals" }).click();

  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  await waitForProductHydration(page);
  await auditResponsiveState(page, "onboarding identity");
  await page.route(
    "**/api/onboarding/identity",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Your session expired." }),
      });
    },
    { times: 1 },
  );
  await page.getByLabel("Which best describes you?").selectOption("startup");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await auditResponsiveState(page, "expired session alert");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/source$/);
  await waitForProductHydration(page);
  expect(memberErrors).toEqual([
    "Failed to load resource: the server responded with a status of 400 (Bad Request)",
    "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
  ]);
  memberErrors.length = 0;
  await auditResponsiveState(page, "onboarding source");
  await page.getByLabel("Website").fill(`https://${websiteHost}`);
  await page.getByRole("button", { name: "Build my profile" }).click();

  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  await waitForProductHydration(page);
  await auditResponsiveState(page, "onboarding profile");
  await page.getByLabel("Display name").fill(profileName);
  await page
    .getByLabel("Organisation or creator name")
    .fill("Mobile Acceptance Studio");
  await page
    .getByLabel(
      "I confirm this profile is accurate and based on my submitted sources.",
    )
    .check();
  await page.getByRole("button", { name: "Confirm profile" }).click();

  await expect(page).toHaveURL(/\/onboarding\/verification$/);
  await waitForProductHydration(page);
  await auditResponsiveState(page, "onboarding verification");
  await page
    .getByRole("button", { name: "Submit for verification" })
    .click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Verification in progress" }),
  ).toBeVisible();
  await auditResponsiveState(page, "pending dashboard", { desktop: true });

  const admin = await authenticateDedicatedAdmin(browser);
  try {
    await admin.page.goto("/admin/verifications");
    await waitForProductHydration(admin.page);
    await expect(
      admin.page.getByRole("heading", { name: "Profiles awaiting review." }),
    ).toBeVisible();
    await auditResponsiveState(admin.page, "administrator verification queue", {
      desktop: true,
    });

    const pendingCard = admin.page
      .getByRole("article")
      .filter({ has: admin.page.getByRole("heading", { name: profileName }) });
    await expect(pendingCard).toBeVisible();
    await pendingCard
      .getByLabel("Review notes (optional)")
      .fill("Approved by the dedicated mobile browser test account.");
    await pendingCard
      .getByRole("button", { name: `Approve ${profileName}` })
      .click();
    await expect(pendingCard).toHaveCount(0);

    await createDiscoveryFixture(runId);
    await admin.page.goto("/admin/discovery");
    await waitForProductHydration(admin.page);
    await expect(
      admin.page.getByRole("heading", { name: "Discovery operations." }),
    ).toBeVisible();
    await auditResponsiveState(admin.page, "administrator discovery dashboard", {
      desktop: true,
    });
    await admin.page
      .getByRole("button", { name: "View Physical AI Acceptance details on narrow screens" })
      .click();
    const discoveryDrawer = admin.page.getByRole("dialog", {
      name: "Physical AI Acceptance",
    });
    await expect(discoveryDrawer.getByText("Systems context")).toBeVisible();
    await expect(
      discoveryDrawer.getByText(/connects Indian motion-control suppliers/i),
    ).toBeVisible();
    await expect(
      discoveryDrawer.getByRole("button", { name: "History (1)" }),
    ).toBeVisible();
    await discoveryDrawer.getByRole("button", { name: "Show findings" }).click();
    await expect(
      discoveryDrawer.getByText(/Ecosystem role: this company sits between/i),
    ).toBeVisible();
    await discoveryDrawer.getByRole("button", { name: "History (1)" }).click();
    await discoveryDrawer
      .getByRole("button", { name: /View research from/ })
      .last()
      .click();
    await expect(
      discoveryDrawer.getByText(
        "Earlier ecosystem assessment of an Indian motion-control participant and its place between component suppliers and robot integrators.",
      ),
    ).toBeVisible();
    expect(admin.errors).toEqual([]);
  } finally {
    await admin.context.close();
  }

  await page.reload();
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Your profile is verified." }),
  ).toBeVisible();
  await auditResponsiveState(page, "verified dashboard", { desktop: true });

  await page.getByLabel("Distribution partnerships").check();
  await page
    .getByLabel("A useful note (optional)")
    .fill("Ready for a mobile browser-verified distribution pilot.");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Save my signal" }).click(),
  ]);
  await waitForProductHydration(page);
  await expect(page.getByLabel("Distribution partnerships")).toBeChecked();

  const firstPick = page.getByTestId("curated-opportunity").first();
  await expect(firstPick).toBeVisible();
  await firstPick
    .getByRole("button", { name: "Ask Mewtuals to advance this" })
    .click();
  await expect(firstPick.getByRole("status")).toHaveText(
    "Mewtuals is reviewing the relationship",
  );

  await provePublicOnlyOfflineBoundary(
    context,
    page,
    memberErrors,
    profileName,
    websiteHost,
  );
});

async function auditResponsiveState(
  page: Page,
  label: string,
  options: { desktop?: boolean } = {},
) {
  const viewports = options.desktop
    ? [...AUDIT_VIEWPORTS, DESKTOP_VIEWPORT]
    : AUDIT_VIEWPORTS;

  for (const viewport of viewports) {
    await test.step(
      `${label} at ${viewport.width}x${viewport.height}`,
      async () => {
        await page.setViewportSize(viewport);
        await expectNoHorizontalOverflow(page);
        if (viewport.width <= 767) await expectTouchControls(page);
      },
    );
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
    const height = (await control.boundingBox())?.height ?? 0;
    const label = `${await control.evaluate((element) => element.tagName.toLowerCase())}: ${(
      await control.innerText().catch(() => "")
    ).trim()}`;
    expect(height, label).toBeGreaterThanOrEqual(44);
  }

  const toggles = page.locator('input[type="checkbox"], input[type="radio"]');
  for (const toggle of await toggles.all()) {
    if (!(await toggle.isVisible())) continue;
    const label = toggle.locator("xpath=ancestor::label[1]");
    await expect(label).toHaveCount(1);
    expect((await label.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

async function verifyLandingKeyboardInteractions(page: Page) {
  await page.setViewportSize(PRIMARY_VIEWPORT);
  const menu = page.locator('button[aria-controls="primary-navigation"]');
  await expect(menu).toHaveAccessibleName("Open navigation");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAccessibleName("Close navigation");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();

  const firstCaseStudy = page
    .getByRole("button", { name: /Open case study:/ })
    .first();
  await firstCaseStudy.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Back to case studies" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(firstCaseStudy).toBeFocused();
}

async function openLocalMagicLink(page: Page, email: string, purpose: string) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required for local browser acceptance.");
  }
  const token = acceptanceToken(purpose, email);
  const now = new Date();
  await database.insert(magicLinks).values({
    email,
    tokenHash: hashToken(token, sessionSecret),
    issued: true,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  });
  await page.goto(`/auth/verify?token=${encodeURIComponent(token)}`);
}

async function authenticateDedicatedAdmin(browser: Browser): Promise<{
  context: BrowserContext;
  errors: string[];
  page: Page;
}> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: PRIMARY_VIEWPORT,
  });
  const page = await context.newPage();
  const errors = trackBrowserErrors(page);
  await openLocalMagicLink(page, ADMIN_EMAIL, randomUUID());
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await auditResponsiveState(page, "administrator magic-link confirmation");
  await page.getByRole("button", { name: "Continue to Mewtuals" }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  return { context, errors, page };
}

async function provePublicOnlyOfflineBoundary(
  context: BrowserContext,
  page: Page,
  browserErrors: string[],
  profileName: string,
  websiteHost: string,
) {
  await page.goto(`${PWA_BASE_URL}/`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await page
    .getByRole("link", { name: "Find my next partnership" })
    .click();
  await expect(page).toHaveURL(/\/join$/);
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Find who you should collaborate with next." }),
  ).toBeVisible();
  await auditResponsiveState(page, "opportunity brief form");
  const submittedBriefProfile = `https://brief-${websiteHost}`;
  await page.route(
    "**/api/opportunity-briefs",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          submission: {
            participantType: "company",
            profileUrl: submittedBriefProfile,
            email: memberEmail,
            phoneNumber: null,
            openToText: null,
            source: null,
            utm: {},
          },
        }),
      });
    },
    { times: 1 },
  );
  await page.getByLabel("Public profile URL").fill(submittedBriefProfile);
  await page.getByLabel("Email address (optional)").fill(memberEmail ?? "");
  await page.getByRole("button", { name: "Get my opportunity brief" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re on our research list." }),
  ).toBeFocused();
  await auditResponsiveState(page, "opportunity brief confirmation");
  await page.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.goto(`${PWA_BASE_URL}/`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await verifyLandingKeyboardInteractions(page);

  const cachedShell = await page.evaluate(async () => {
    const cacheNames = (await caches.keys()).filter((name) =>
      name.startsWith("mewtuals-"),
    );
    const cachedPaths: string[] = [];
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        cachedPaths.push(url.pathname + url.search);
      }
    }
    return {
      cachedPaths,
      stylesheetPaths: Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
        (link) => {
          const url = new URL(link.href);
          return url.pathname + url.search;
        },
      ),
    };
  });
  for (const stylesheetPath of cachedShell.stylesheetPaths) {
    expect(cachedShell.cachedPaths).toContain(stylesheetPath);
  }
  expect(
    cachedShell.cachedPaths.filter((pathname) =>
      [
        "/admin/",
        "/api/",
        "/auth/",
        "/dashboard",
        "/apply",
        "/join",
        "/login",
        "/network/join",
        "/onboarding/",
      ].some((prefix) => pathname === prefix || pathname.startsWith(prefix)),
    ),
  ).toEqual([]);

  await context.setOffline(true);
  await page.goto(`${PWA_BASE_URL}/`);
  await expect(
    page.getByRole("heading", {
      name: "One partnership can change a company. We find the right one.",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
  const menu = page.locator('button[aria-controls="primary-navigation"]');
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  await page
    .getByRole("button", { name: /Open case study:/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(`${PWA_BASE_URL}/dashboard`);
  await expect(
    page.getByRole("heading", {
      name: "Get online to see your partnerships.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Try again" }),
  ).toHaveAttribute("href", "?retry");
  await expect(
    page.getByRole("link", { name: "Back to the landing page" }),
  ).toHaveAttribute("href", "/");
  await expect(page.getByText(profileName)).toHaveCount(0);
  await expect(page.getByText(websiteHost)).toHaveCount(0);
  await expect(page.getByText("Curated for this moment")).toHaveCount(0);
  await expect(page.getByText("Profiles awaiting review.")).toHaveCount(0);
  await auditResponsiveState(page, "offline member fallback");

  await page.goto(`${PWA_BASE_URL}/apply`);
  await expect(
    page.getByRole("heading", {
      name: "Get online to see your partnerships.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Put Mewtuals on your company’s side." }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Company URL")).toHaveCount(0);
  await auditResponsiveState(page, "offline application fallback");

  await page.goto(`${PWA_BASE_URL}/join?source=bengaluru-meetup`);
  await expect(
    page.getByRole("heading", {
      name: "Get online to see your partnerships.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Public profile URL")).toHaveCount(0);
  await expect(page.getByText(memberEmail ?? "")).toHaveCount(0);
  await expect(page.getByText(submittedBriefProfile)).toHaveCount(0);
  await auditResponsiveState(page, "offline opportunity brief fallback");

  // The built Vinext server proves the public PWA boundary above. Authenticated
  // local Postgres RSC routes are exercised on the development server below.
  await context.setOffline(false);
  await page.goto(`${BASE_URL}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Your profile is verified." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await context.setOffline(true);
  await page.goto(`${BASE_URL}/dashboard`);
  await expect(
    page.getByRole("heading", {
      name: "Get online to see your partnerships.",
    }),
  ).toBeVisible();
  await expect(page.getByText(profileName)).toHaveCount(0);
  await expect(page.getByText(websiteHost)).toHaveCount(0);
  await expect(page.getByText("Curated for this moment")).toHaveCount(0);

  const recoveryErrorStart = browserErrors.length;
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile is verified." }),
  ).toBeVisible();
  await waitForProductHydration(page);
  expect(browserErrors.slice(recoveryErrorStart)).toEqual([]);
}

async function waitForProductHydration(page: Page) {
  await expect(page.locator('[data-product-hydrated="true"]')).toHaveCount(1);
}

function trackBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function removeDisposableAccount(email: string) {
  await database.delete(magicLinks).where(eq(magicLinks.email, email));
  await database.delete(users).where(eq(users.email, email));
}

async function createDiscoveryFixture(suffix: string) {
  const olderRunId = randomUUID();
  const latestRunId = randomUUID();
  const candidateId = randomUUID();
  const olderAt = new Date("2026-07-21T06:00:00.000Z");
  const latestAt = new Date("2026-07-28T06:00:00.000Z");
  const findings = (lead: string) =>
    `${lead}\n\n${"Public-evidence systems analysis covering suppliers, manufacturing, technical difficulty, replaceability, strategic importance for India, underlying materials and processes, robot behaviour, buyers, and ecosystem relationships. ".repeat(4)}`;

  await database.insert(discoveryRuns).values([
    {
      id: olderRunId,
      externalRunKey: `e2e:physical-ai:older:${suffix}`,
      campaignKey: "robotics_hardware_india",
      trigger: "trial",
      status: "succeeded",
      startedAt: olderAt,
      completedAt: olderAt,
      createdAt: olderAt,
      updatedAt: olderAt,
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 1,
      companyPercentage: 100,
      foundCount: 1,
      newCount: 1,
      duplicateCount: 0,
    },
    {
      id: latestRunId,
      externalRunKey: `e2e:physical-ai:latest:${suffix}`,
      campaignKey: "robotics_hardware_india",
      trigger: "trial",
      status: "succeeded",
      startedAt: latestAt,
      completedAt: latestAt,
      createdAt: latestAt,
      updatedAt: latestAt,
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 1,
      companyPercentage: 100,
      foundCount: 1,
      newCount: 0,
      duplicateCount: 1,
    },
  ]);
  await database.insert(discoveryCandidates).values({
    id: candidateId,
    type: "company",
    name: "Physical AI Acceptance",
    normalizedName: "physical ai acceptance",
    canonicalIdentityKey: `physical-ai-acceptance-${suffix}`,
    canonicalUrl: "https://example.com/physical-ai-acceptance",
    websiteUrl: "https://example.com/physical-ai-acceptance",
    discoveredDescription: "An Indian robotics systems participant used for browser acceptance.",
    category: "robot components and subsystem makers",
    subcategory: "motion control",
    geography: "India",
    firstSourceName: "codex_web",
    firstSourceUrl: "https://example.com/physical-ai-acceptance",
    discoveredAt: olderAt,
    lastSeenAt: latestAt,
    createdAt: olderAt,
    updatedAt: latestAt,
    mostRecentRunId: latestRunId,
    discoveryScore: 91,
  });
  await database.insert(discoveryCandidateSources).values({
    candidateId,
    discoveryRunId: latestRunId,
    sourceName: "Company website",
    sourceUrl: "https://example.com/physical-ai-acceptance",
    firstSeenAt: olderAt,
    lastSeenAt: latestAt,
    createdAt: olderAt,
  });
  await database.insert(candidateResearchVersions).values([
    {
      candidateId,
      discoveryRunId: olderRunId,
      summary:
        "Earlier ecosystem assessment of an Indian motion-control participant and its place between component suppliers and robot integrators.",
      findings: findings(
        "Earlier ecosystem assessment: the company links imported electronics to domestic robot assembly.",
      ),
      sourceUrls: ["https://example.com/physical-ai-acceptance"],
      analysisVersion: "physical-ai-v1",
      createdAt: olderAt,
    },
    {
      candidateId,
      discoveryRunId: latestRunId,
      summary:
        "This participant connects Indian motion-control suppliers to robot integrators, adding reliable actuator behaviour within the wider Physical AI ecosystem.",
      findings: findings(
        "Ecosystem role: this company sits between electronics and actuator suppliers and complete robot builders.",
      ),
      sourceUrls: ["https://example.com/physical-ai-acceptance"],
      analysisVersion: "physical-ai-v1",
      createdAt: latestAt,
    },
  ]);
  discoveryFixture = { candidateId, runIds: [olderRunId, latestRunId] };
}

async function removeDiscoveryFixture() {
  if (!discoveryFixture) return;
  await database
    .delete(discoveryCandidates)
    .where(eq(discoveryCandidates.id, discoveryFixture.candidateId));
  await database
    .delete(discoveryRuns)
    .where(inArray(discoveryRuns.id, discoveryFixture.runIds));
  discoveryFixture = undefined;
}

function requireDedicatedAdminAllowlist(value: string | undefined) {
  const adminEmails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.includes(ADMIN_EMAIL)) {
    throw new Error(
      `Refusing mobile E2E: add only ${ADMIN_EMAIL} to the ignored local ADMIN_EMAILS allowlist.`,
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
