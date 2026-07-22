import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { and, eq, inArray, like } from "drizzle-orm";
import jsQR from "jsqr";
import { PNG } from "pngjs";

import { candidateIdentifierForProfileUrl } from "../../app/domain/discovery";
import { createOpportunityBriefService } from "../../app/server/opportunity-brief-service";
import { hashToken } from "../../app/server/tokens";
import { closeDb, getDb } from "../../db/client";
import { createOpportunityBriefRepository } from "../../db/repositories/opportunity-brief-repository";
import {
  discoveryCandidateIdentifiers,
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
const PRIMARY_VIEWPORT = { width: 390, height: 844 } as const;
const DESKTOP_VIEWPORT = { width: 1440, height: 1100 } as const;
const SHARE_SOURCE = "bengaluru-meetup";
const BASE_URL = requireLoopbackBaseUrl(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4000",
);

loadLocalEnvironment();
requireLocalAppDatabaseUrl(process.env.DATABASE_URL);
requireDedicatedAdminAllowlist(process.env.ADMIN_EMAILS);

const database = getDb();
const opportunityBriefRepository = createOpportunityBriefRepository(database);
const createdCandidateIds = new Set<string>();
const createdRequestIds = new Set<string>();
const createdRunIds = new Set<string>();
const disposableEmails = new Set<string>([ADMIN_EMAIL]);
const runPhoneNumbers = new Set<string>();
let activeRunSource: string | undefined;
let profileHost: string | undefined;

test.use({ viewport: PRIMARY_VIEWPORT });

test.beforeEach(async () => {
  await removeDisposableAccount(ADMIN_EMAIL);
});

test.afterEach(async () => {
  await cleanupBrowserRows();
});

test.afterAll(async () => {
  await closeDb();
});

test("isolated public intake and protected operations meet the automated response SLA without regressing member entry", async ({
  browser,
  page,
}) => {
  const runId = randomUUID();
  const compactRunId = runId.replaceAll("-", "");
  const source = `bengaluru-meetup-e2e-${compactRunId.slice(0, 12)}`;
  const publicPhoneNumber = uniqueTestPhone(runId, "8");
  const paginationPhoneNumber = uniqueTestPhone(runId, "7");
  activeRunSource = source;
  expect(source).toMatch(/^[a-z0-9-]+$/);
  expect(source.length).toBeLessThanOrEqual(100);
  runPhoneNumbers.add(publicPhoneNumber);
  runPhoneNumbers.add(paginationPhoneNumber);
  profileHost = `task7-e2e-${compactRunId}.example`;
  const publicProfileUrl = `https://${profileHost}/public-request`;
  const memberEmail = `task7-network-${runId}@example.test`;
  disposableEmails.add(memberEmail);
  const candidateId = await seedSourceSupportedCandidate(runId);
  await seedPaginationRequest(runId, source, paginationPhoneNumber);

  const publicErrors = trackBrowserErrors(page);
  await page.goto(
    `/join?source=${source}&utm_source=meetup&utm_campaign=task-7-browser`,
  );
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", {
      name: "Find who you should collaborate with next.",
    }),
  ).toBeVisible();
  await auditMobileState(page, "public Opportunity Brief form");

  // This SLA measures automated form entry plus backend response time, not human completion time.
  const startedAt = Date.now();
  await page.getByLabel("Company / Startup / Brand").check();
  await page.getByLabel("Public profile URL").fill(publicProfileUrl);
  await page
    .getByLabel("WhatsApp number (optional)")
    .fill(publicPhoneNumber);
  await page
    .getByLabel("What are you open to? (optional)")
    .fill("Creator distribution and a measurable co-marketing pilot");
  await page
    .getByRole("button", { name: "Get my opportunity brief" })
    .click();

  const confirmationHeading = page.getByRole("heading", {
    name: "You’re on our research list.",
  });
  await expect(confirmationHeading).toBeFocused();
  expect(Date.now() - startedAt).toBeLessThan(30_000);
  const confirmation = page.locator(
    'section[aria-labelledby="opportunity-success-heading"]',
  );
  await expect(confirmation).toContainText(publicProfileUrl);
  await expect(confirmation).toContainText(publicPhoneNumber);
  await auditMobileState(page, "public Opportunity Brief confirmation");

  const [storedPublicRequest] = await database
    .select({
      id: opportunityBriefRequests.id,
      email: opportunityBriefRequests.email,
      phoneNumber: opportunityBriefRequests.phoneNumber,
      acknowledgementStatus: opportunityBriefRequests.acknowledgementStatus,
      source: opportunityBriefRequests.source,
    })
    .from(opportunityBriefRequests)
    .where(eq(opportunityBriefRequests.normalizedProfileUrl, publicProfileUrl));
  if (!storedPublicRequest) {
    throw new Error("The browser-submitted Opportunity Brief request was not stored.");
  }
  createdRequestIds.add(storedPublicRequest.id);
  expect(storedPublicRequest).toMatchObject({
    email: null,
    phoneNumber: publicPhoneNumber,
    acknowledgementStatus: "not_requested",
    source,
  });
  const confirmationText = await confirmation.innerText();
  expect(confirmationText).not.toContain(storedPublicRequest.id);
  expect(confirmationText.toLowerCase()).not.toMatch(
    /linked candidate|acknowledgement|request status|submitted/,
  );
  expect(publicErrors).toEqual([]);

  await page.goto("/admin/opportunity-briefs");
  await expect(page).toHaveURL(/\/login$/);

  const admin = await authenticateDedicatedAdmin(browser, runId);
  try {
    await admin.page.goto(
      `/admin/opportunity-briefs?source=${source}&pageSize=1`,
    );
    await waitForProductHydration(admin.page);
    await expect(
      admin.page.getByRole("heading", { name: "Opportunity Brief requests." }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("group", { name: "Opportunity Brief summary" }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole("search", {
        name: "Filter Opportunity Brief requests",
      }).getByLabel("Source"),
    ).toHaveValue(source);
    await auditMobileState(admin.page, "Opportunity Brief administrator queue");

    const pagination = admin.page.getByRole("navigation", {
      name: "Opportunity Brief pages",
    });
    await expect(pagination).toContainText("Page 1 of");
    await expect(pagination.getByRole("link", { name: "Next page" })).toBeVisible();
    await pagination.getByRole("link", { name: "Next page" }).click();
    await expect(admin.page).toHaveURL(/(?:\?|&)page=2(?:&|$)/);
    await waitForProductHydration(admin.page);
    await expect(
      admin.page
        .getByRole("navigation", { name: "Opportunity Brief pages" })
        .getByRole("link", { name: "Previous page" }),
    ).toBeVisible();
    await admin.page
      .getByRole("navigation", { name: "Opportunity Brief pages" })
      .getByRole("link", { name: "Previous page" })
      .click();
    await expect(admin.page).toHaveURL(/(?:\?|&)page=1(?:&|$)/);
    await waitForProductHydration(admin.page);

    const mobileRecord = admin.page
      .getByRole("article", { name: "Company Opportunity Brief record" })
      .filter({ hasText: publicProfileUrl });
    await expect(mobileRecord).toBeVisible();
    const detailsTrigger = mobileRecord.getByRole("button", {
      name: "View company Opportunity Brief details on narrow screens",
    });
    await detailsTrigger.focus();
    await detailsTrigger.click();
    let dialog = admin.page.getByRole("dialog", {
      name: "Company Opportunity Brief",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Close Company Opportunity Brief" }),
    ).toBeFocused();
    await auditMobileState(admin.page, "Opportunity Brief administrator dialog");

    const patchIntercepted = deferred<void>();
    const releasePatch = deferred<void>();
    await admin.page.route(
      `**/api/admin/opportunity-briefs/${storedPublicRequest.id}`,
      async (route) => {
        patchIntercepted.resolve();
        await releasePatch.promise;
        await route.continue();
      },
      { times: 1 },
    );
    const patchResponse = admin.page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(
          `/api/admin/opportunity-briefs/${storedPublicRequest.id}`,
        ),
    );
    const refreshResponse = admin.page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/admin/opportunity-briefs?"),
    );
    await dialog
      .getByLabel("Administrator notes")
      .fill("Saved while the mobile detail dialog closes.");
    await dialog.getByRole("button", { name: "Save notes" }).click();
    await patchIntercepted.promise;
    await admin.page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(detailsTrigger).toBeFocused();
    releasePatch.resolve();
    expect((await patchResponse).status()).toBe(200);
    expect((await refreshResponse).status()).toBe(200);

    await detailsTrigger.click();
    dialog = admin.page.getByRole("dialog", {
      name: "Company Opportunity Brief",
    });
    await expect(dialog.getByLabel("Administrator notes")).toHaveValue(
      "Saved while the mobile detail dialog closes.",
    );

    await dialog
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("researching");
    await dialog.getByRole("button", { name: "Save status" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Status saved.");

    await dialog.getByLabel("Candidate UUID").fill(candidateId);
    await dialog.getByRole("button", { name: "Link candidate" }).click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Discovery candidate linked.",
    );
    await expect(dialog.getByText(candidateId, { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Unlink candidate" }).click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Discovery candidate unlinked.",
    );
    await expect(
      dialog.getByRole("button", { name: "Unlink candidate" }),
    ).toHaveCount(0);

    await admin.page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(detailsTrigger).toBeFocused();

    await admin.page.setViewportSize(DESKTOP_VIEWPORT);
    await expectNoHorizontalOverflow(admin.page);
    const desktopRow = admin.page
      .getByRole("row")
      .filter({ hasText: publicProfileUrl });
    await expect(desktopRow).toBeVisible();
    await expect(
      desktopRow.getByRole("button", {
        name: "View company Opportunity Brief details",
      }),
    ).toBeVisible();
    expect(admin.errors).toEqual([]);
  } finally {
    await admin.context.close();
  }

  await page.setViewportSize(PRIMARY_VIEWPORT);
  await page.goto("/share");
  const qrDataUrl = await page
    .getByRole("img", { name: "QR code to join Mewtuals" })
    .getAttribute("src");
  expect(decodeQrDataUrl(qrDataUrl ?? "")).toBe(
    `https://mewtuals.com/join?source=${SHARE_SOURCE}`,
  );

  await page.goto("/network/join");
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Find the right partnership moment." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(memberEmail);
  const magicLinkRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/auth/magic-link"),
  );
  await page.getByRole("button", { name: "Join Mewtuals" }).click();
  expect((await magicLinkRequest).postDataJSON()).toEqual({ email: memberEmail });
  await expect(
    page.getByRole("link", { name: "Open local sign-in link" }),
  ).toBeVisible();
  await auditMobileState(page, "preserved network join");

  await page.goto("/login");
  await waitForProductHydration(page);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  expect(publicErrors).toEqual([]);
});

async function seedPaginationRequest(
  runId: string,
  source: string,
  phoneNumber: string,
) {
  if (!profileHost) throw new Error("Task 7 browser profile host is unavailable.");
  const profileUrl = `https://${profileHost}/pagination-seed`;
  const service = createOpportunityBriefService({
    repository: opportunityBriefRepository,
    adminEmails: [],
    now: () => new Date(Date.now() - 5 * 60_000),
  });
  const result = await service.submit(
    {
      participantType: "company",
      profileUrl,
      email: "",
      phoneNumber,
      openToText: "Pagination fixture",
      source,
      utm: { campaign: "task-7-pagination" },
      website: "",
    },
    `task7-pagination-${runId}`,
  );
  if (!result.ok) throw new Error(result.error);
  const [stored] = await database
    .select({ id: opportunityBriefRequests.id })
    .from(opportunityBriefRequests)
    .where(
      and(
        eq(opportunityBriefRequests.normalizedProfileUrl, profileUrl),
        eq(opportunityBriefRequests.source, source),
      ),
    );
  if (!stored) throw new Error("Task 7 pagination request was not stored.");
  createdRequestIds.add(stored.id);
}

async function seedSourceSupportedCandidate(runId: string) {
  if (!profileHost) throw new Error("Task 7 browser profile host is unavailable.");
  const now = new Date(Date.now() - 10 * 60_000);
  const [run] = await database
    .insert(discoveryRuns)
    .values({
      externalRunKey: `task7-e2e-${runId}`,
      trigger: "manual",
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      geography: `Task 7 browser ${runId}`,
      candidateType: "company",
      sourcesUsed: ["Task 7 browser source"],
      requestedCount: 1,
      companyPercentage: 100,
      foundCount: 1,
      newCount: 1,
      requestedByEmail: ADMIN_EMAIL,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!run) throw new Error("Task 7 browser Discovery run was not created.");
  createdRunIds.add(run.id);

  const canonicalUrl = `https://${profileHost}/candidate`;
  const identifier = candidateIdentifierForProfileUrl(canonicalUrl);
  const [candidate] = await database
    .insert(discoveryCandidates)
    .values({
      type: "company",
      name: "Task 7 browser candidate",
      normalizedName: "task 7 browser candidate",
      canonicalIdentityKey: `${identifier.kind}:${identifier.value}`,
      canonicalUrl,
      websiteUrl: canonicalUrl,
      discoveredDescription: "Source-supported browser candidate.",
      category: "acceptance",
      geography: `Task 7 browser ${runId}`,
      firstSourceName: "Task 7 browser source",
      firstSourceUrl: `https://${profileHost}/candidate-evidence`,
      discoveredAt: now,
      lastSeenAt: now,
      mostRecentRunId: run.id,
      discoveryScore: 90,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!candidate) throw new Error("Task 7 browser candidate was not created.");
  createdCandidateIds.add(candidate.id);
  await database.insert(discoveryCandidateIdentifiers).values({
    candidateId: candidate.id,
    candidateType: "company",
    kind: identifier.kind,
    normalizedValue: identifier.value,
    createdAt: now,
  });
  await database.insert(discoveryCandidateSources).values({
    candidateId: candidate.id,
    discoveryRunId: run.id,
    sourceName: "Task 7 browser source",
    sourceUrl: `https://${profileHost}/candidate-evidence`,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
  });
  return candidate.id;
}

async function authenticateDedicatedAdmin(
  browser: Browser,
  purpose: string,
): Promise<{ context: BrowserContext; errors: string[]; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: PRIMARY_VIEWPORT,
  });
  const page = await context.newPage();
  const errors = trackBrowserErrors(page);
  await openLocalMagicLink(page, ADMIN_EMAIL, purpose);
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Mewtuals" }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  return { context, errors, page };
}

async function openLocalMagicLink(page: Page, email: string, purpose: string) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required for Task 7 browser acceptance.");
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

async function auditMobileState(page: Page, label: string) {
  await test.step(`${label} at 390x844`, async () => {
    await page.setViewportSize(PRIMARY_VIEWPORT);
    await expectNoHorizontalOverflow(page);
    await expectTouchControls(page);
  });
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
    const label = `${await control.evaluate((element) => element.tagName.toLowerCase())}: ${(
      await control.innerText().catch(() => "")
    ).trim()}`;
    expect(box?.height ?? 0, `${label} height`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `${label} width`).toBeGreaterThanOrEqual(44);
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

function decodeQrDataUrl(dataUrl: string) {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) return undefined;
  const png = PNG.sync.read(Buffer.from(encoded, "base64"));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

function uniqueTestPhone(runId: string, discriminator: "7" | "8") {
  const uniqueDigits = runId.replaceAll(/\D/g, "").padEnd(8, "0").slice(0, 8);
  return `+919${discriminator}${uniqueDigits}`;
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function cleanupBrowserRows() {
  const phoneNumbers = [...runPhoneNumbers];
  if (profileHost && activeRunSource && phoneNumbers.length > 0) {
    const ownedRequests = await database
      .select({ id: opportunityBriefRequests.id })
      .from(opportunityBriefRequests)
      .where(
        and(
          eq(opportunityBriefRequests.source, activeRunSource),
          like(opportunityBriefRequests.normalizedProfileUrl, `%${profileHost}%`),
          inArray(opportunityBriefRequests.normalizedPhoneNumber, phoneNumbers),
        ),
      );
    const cleanupRequestIds = [
      ...new Set([
        ...ownedRequests.map(({ id }) => id),
        ...createdRequestIds,
      ]),
    ];
    if (cleanupRequestIds.length > 0) {
      await database
        .delete(opportunityBriefRequests)
        .where(
          and(
            inArray(opportunityBriefRequests.id, cleanupRequestIds),
            eq(opportunityBriefRequests.source, activeRunSource),
            like(
              opportunityBriefRequests.normalizedProfileUrl,
              `%${profileHost}%`,
            ),
            inArray(opportunityBriefRequests.normalizedPhoneNumber, phoneNumbers),
          ),
        );
      const remainingRequests = await database
        .select({ id: opportunityBriefRequests.id })
        .from(opportunityBriefRequests)
        .where(inArray(opportunityBriefRequests.id, cleanupRequestIds));
      if (remainingRequests.length > 0) {
        throw new Error("Task 7 browser cleanup left an owned request behind.");
      }
    }
  }
  const candidateIds = [...createdCandidateIds];
  if (candidateIds.length > 0) {
    await database
      .delete(discoveryCandidateSources)
      .where(inArray(discoveryCandidateSources.candidateId, candidateIds));
    await database
      .delete(discoveryCandidateIdentifiers)
      .where(inArray(discoveryCandidateIdentifiers.candidateId, candidateIds));
    await database
      .delete(discoveryCandidates)
      .where(inArray(discoveryCandidates.id, candidateIds));
  }
  const runIds = [...createdRunIds];
  if (runIds.length > 0) {
    await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, runIds));
  }
  for (const email of disposableEmails) {
    await removeDisposableAccount(email);
  }
  createdCandidateIds.clear();
  createdRequestIds.clear();
  createdRunIds.clear();
  disposableEmails.clear();
  disposableEmails.add(ADMIN_EMAIL);
  runPhoneNumbers.clear();
  activeRunSource = undefined;
  profileHost = undefined;
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
      `Refusing Opportunity Brief E2E: add only ${ADMIN_EMAIL} to the ignored local ADMIN_EMAILS allowlist.`,
    );
  }
}
