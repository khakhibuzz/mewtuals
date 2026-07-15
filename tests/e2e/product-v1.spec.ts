import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { closeDb, getDb } from "../../db/client";
import { magicLinks, users } from "../../db/schema";
import { loadLocalEnvironment } from "../../scripts/load-local-env.mjs";
import { requireLocalAppDatabaseUrl } from "../support/acceptance-environment";

loadLocalEnvironment();
requireLocalAppDatabaseUrl(process.env.DATABASE_URL);

const database = getDb();
let memberEmail: string | undefined;

async function removeBrowserMember() {
  if (!memberEmail) return;
  await database.delete(magicLinks).where(eq(magicLinks.email, memberEmail));
  await database.delete(users).where(eq(users.email, memberEmail));
}

async function ageMemberMagicLinks() {
  if (!memberEmail) throw new Error("Browser member email is not available.");
  await database
    .update(magicLinks)
    .set({ createdAt: new Date(Date.now() - 61_000) })
    .where(eq(magicLinks.email, memberEmail));
}

async function waitForProductHydration(page: Page) {
  await expect(
    page.locator('[data-product-hydrated="true"]'),
  ).toHaveCount(1);
}

async function requestAndConfirmMagicLink(page: Page, mode: "join" | "login") {
  if (!memberEmail) throw new Error("Browser member email is not available.");
  await page.goto(mode === "join" ? "/join" : "/login");
  await waitForProductHydration(page);
  await page.getByLabel("Email address").fill(memberEmail);
  await page
    .getByRole("button", {
      name: mode === "join" ? "Join Mewtuals" : "Send sign-in link",
    })
    .click();

  const localLink = page.getByRole("link", {
    name: "Open local sign-in link",
  });
  await expect(localLink).toBeVisible();
  await localLink.click();
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Mewtuals" }).click();
}

test.afterEach(async () => {
  await removeBrowserMember();
});

test.afterAll(async () => {
  await closeDb();
});

test("fresh member completes and retains the product-v1 journey", async ({
  page,
}) => {
  const runId = randomUUID();
  memberEmail = `browser-product-v1-${runId}@example.test`;
  const profileName = `Browser Acceptance ${runId.slice(0, 8)}`;
  const websiteHost = `browser-${runId}.example`;
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await requestAndConfirmMagicLink(page, "join");
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  await waitForProductHydration(page);

  await page.getByLabel("Which best describes you?").selectOption("startup");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/source$/);
  await waitForProductHydration(page);

  await page.getByLabel("Website").fill(`https://${websiteHost}`);
  await expect(page.getByLabel("Website")).toHaveValue(
    `https://${websiteHost}`,
  );
  await page.getByRole("button", { name: "Build my profile" }).click();
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  await waitForProductHydration(page);
  await expect(page.getByLabel("Display name")).not.toHaveValue(profileName);

  await page.getByLabel("Display name").fill(profileName);
  await page
    .getByLabel("Organisation or creator name")
    .fill("Browser Acceptance Studio");
  await page
    .getByLabel(
      "I confirm this profile is accurate and based on my submitted sources.",
    )
    .check();
  await page.getByRole("button", { name: "Confirm profile" }).click();
  await expect(page).toHaveURL(/\/onboarding\/verification$/);
  await waitForProductHydration(page);

  await page
    .getByRole("button", { name: "Submit for verification" })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Verification in progress" }),
  ).toBeVisible();
  await expect(page.getByTestId("example-opportunity")).toBeVisible();
  await expect(page.getByTestId("coming-soon-opportunity")).toHaveCount(4);

  await page
    .getByRole("button", { name: "Simulate approval locally" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your profile is verified." }),
  ).toBeVisible();
  await waitForProductHydration(page);

  await page.getByLabel("Distribution partnerships").check();
  await page
    .getByLabel("A useful note (optional)")
    .fill("Ready for a browser-verified distribution pilot.");
  await page.getByRole("button", { name: "Save my signal" }).click();

  const firstPick = page.getByTestId("curated-opportunity").first();
  await expect(firstPick).toBeVisible();
  await firstPick
    .getByRole("button", { name: "Ask Mewtuals to advance this" })
    .click();
  await expect(firstPick.getByRole("status")).toHaveText(
    "Mewtuals is reviewing the relationship",
  );

  await page.reload();
  await waitForProductHydration(page);
  await expect(
    page.getByTestId("curated-opportunity").first().getByRole("status"),
  ).toHaveText("Mewtuals is reviewing the relationship");

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await ageMemberMagicLinks();
  await requestAndConfirmMagicLink(page, "login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await waitForProductHydration(page);
  await expect(
    page.getByRole("heading", { name: "Your profile is verified." }),
  ).toBeVisible();
  await expect(
    page.getByTestId("curated-opportunity").first().getByRole("status"),
  ).toHaveText("Mewtuals is reviewing the relationship");

  expect(browserErrors).toEqual([]);
});
