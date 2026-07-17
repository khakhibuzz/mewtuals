import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { eq } from "drizzle-orm";

import { hashToken } from "../../app/server/tokens";
import { closeDb, getDb } from "../../db/client";
import { magicLinks, users } from "../../db/schema";
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

test.use({ viewport: PRIMARY_VIEWPORT });

test.beforeEach(async () => {
  await removeDisposableAccount(ADMIN_EMAIL);
});

test.afterEach(async () => {
  if (memberEmail) await removeDisposableAccount(memberEmail);
  await removeDisposableAccount(ADMIN_EMAIL);
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

  await page.goto("/join");
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Find the right partnership moment." }),
  ).toBeVisible();
  await auditResponsiveState(page, "join");

  await page.goto("/login");
  await waitForProductHydration(page);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await auditResponsiveState(page, "login");

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
  await page.getByLabel("Which best describes you?").selectOption("startup");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/source$/);
  await waitForProductHydration(page);
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
    'a, button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea',
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
    page.getByRole("heading", { name: "Find the right partnership moment." }),
  ).toBeVisible();
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
        "/join",
        "/login",
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
