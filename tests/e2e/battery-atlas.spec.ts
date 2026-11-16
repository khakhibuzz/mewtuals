import { expect, test } from "@playwright/test";

test("research markers open evidence and preserve project status", async ({ page }) => {
  await page.goto("/ecosystem/batteries");
  await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "Flat map" }).click();
  await page.getByRole("button", { name: "01 Raw materials" }).click();
  await page.getByRole("button", { name: "Open location: GSI · Salal-Haimna resource" }).click();
  const evidence = page.getByRole("article", { name: "Selected research" });
  await expect(evidence.getByRole("heading", { name: "GSI · Salal-Haimna resource" })).toBeVisible();
  await expect(evidence.getByText("Exploration / resource", { exact: true })).toBeVisible();
  await expect(evidence.getByRole("link", { name: /GSI inferred lithium ore resource/ })).toHaveAttribute("href", /pib.gov.in/);
  await page.getByRole("button", { name: "04 Cells" }).click();
  await page.getByRole("button", { name: "Read research: Agratas · Sanand facility" }).click();
  await expect(evidence.getByText("Planned / construction", { exact: true })).toBeVisible();
  await expect(evidence.getByText(/Production launch was targeted for 2027/)).toBeVisible();
  await page.getByRole("button", { name: /All stages/ }).click();
  const cluster = page.getByRole("button", { name: /^Open \d+ records in this area$/ }).first();
  await cluster.click();
  await expect(page.getByRole("heading", { name: /records in this area/ })).toBeVisible();
  await page.getByRole("button", { name: "Show all results" }).click();
  await expect(page.getByRole("button", { name: /^Read research:/ })).toHaveCount(21);
});

test("pointer panning tracks screen distance and ignores a second finger", async ({ page }) => {
  await page.setViewportSize({ width: 2100, height: 1000 });
  await page.goto("/ecosystem/batteries");
  await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "Flat map" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  const map = page.getByRole("group", { name: "India battery atlas map" });
  await map.scrollIntoViewIfNeeded();
  const bounds = await map.boundingBox();
  const india = page.getByRole("button", { name: "Select India on map" });
  const before = await india.evaluate((element) => (element as SVGGraphicsElement).getScreenCTM()!.e);
  await page.mouse.move(bounds!.x + 140, bounds!.y + 190);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 220, bounds!.y + 190, { steps: 4 });
  await page.mouse.up();
  const after = await india.evaluate((element) => (element as SVGGraphicsElement).getScreenCTM()!.e);
  expect(after - before).toBeCloseTo(80, 0);
  const transform = page.locator('svg[aria-label="India battery atlas map"] > g');
  const initial = await transform.getAttribute("transform");
  await map.dispatchEvent("pointerdown", { pointerId: 10, isPrimary: true, button: 0, clientX: 200, clientY: 200 });
  await map.dispatchEvent("pointermove", { pointerId: 11, isPrimary: false, clientX: 400, clientY: 400 });
  expect(await transform.getAttribute("transform")).toBe(initial);
  await map.dispatchEvent("pointercancel", { pointerId: 10 });
});

for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`battery atlas interaction and layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/ecosystem/batteries");
  await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "Flat map" }).click();
    await expect(page.getByRole("heading", { name: "Battery Atlas." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "India", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "03 Components" }).click();
    await expect(page.getByRole("heading", { name: "Components", exact: true })).toBeVisible();
    await expect(page.getByText(/missing evidence does not mean no activity/i)).toBeVisible();
    await page.getByRole("button", { name: "Close country details" }).click();
    await expect(page.getByRole("button", { name: "India ↗", exact: true })).toBeFocused();
    const india = page.getByRole("button", { name: "Select India on map" });
    await india.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "India", exact: true })).toBeVisible();
    const transform = page.locator('svg[aria-label="India battery atlas map"] > g');
    const initial = await transform.getAttribute("transform");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(transform).not.toHaveAttribute("transform", initial!);
    await page.getByRole("group", { name: "India battery atlas map" }).focus();
    const zoomed = await transform.getAttribute("transform");
    await page.keyboard.press("ArrowRight");
    await expect(transform).not.toHaveAttribute("transform", zoomed!);
    await page.getByRole("button", { name: "Reset map" }).click();
    await expect(transform).toHaveAttribute("transform", initial!);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      undersized: Array.from(document.querySelectorAll('main button, main a')).filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).map((button) => button.getAttribute('aria-label') ?? button.textContent),
    }));
    expect(layout).toEqual({ overflow: false, undersized: [] });
    expect(errors).toEqual([]);
  });
}

test("battery atlas is linked from ecosystem and remains network-only offline", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:4002" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    });
    await page.goto("/ecosystem");
    await page.getByRole("link", { name: "Explore the Battery Atlas · India →" }).click();
    await expect(page.getByRole("heading", { name: "Battery Atlas." })).toBeVisible();
    const cachedPaths = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)))).flat());
    expect(cachedPaths).not.toContain("/ecosystem/batteries");
    await context.setOffline(true);
    await page.goto("/ecosystem/batteries");

    await expect(page.getByRole("heading", { name: "Get online to see your partnerships." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Battery Atlas." })).toHaveCount(0);
  } finally {
    await context.close();
  }
});


test("3D renderer supports keyboard exploration, filters and safe fallback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ecosystem/batteries");
  const scene = page.getByLabel("Three-dimensional India map", { exact: true });
  await expect(scene).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(scene).toHaveAttribute("data-backend", /webgpu|webgl2/);
  const marker = page.getByRole("button", { name: "Open location: GSI · Salal-Haimna resource" });
  const before = await marker.getAttribute("style");
  await scene.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect(marker).not.toHaveAttribute("style", before!);
  await page.getByLabel("Find a capability").selectOption("bms");
  await expect(page.getByRole("button", { name: /^Read research:/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Open location: undefined/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Read research: Vecmocon · BMS & chargers" }).click();
  await expect(page.getByRole("heading", { name: "Supply-chain dossier" })).toBeVisible();
  await expect(page.getByText("No verified quote · ask supplier for a dated, product-specific offer.")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("GPU-unavailable browsers retain the flat map and research", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ecosystem/batteries");
  await expect(page.getByRole("group", { name: "India battery atlas map" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: /^Read research:/ })).toHaveCount(21);
  expect(errors).toEqual([]);
});


test("guided sourcing journeys open the matching evidence on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ecosystem/batteries");
  await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("link", { name: "Follow a battery ↓" }).click();
  await expect(page.getByRole("heading", { name: "Where does it actually come from?" })).toBeInViewport();
  await page.getByRole("button", { name: "An overseas cell sourcing agreement" }).click();
  await expect(page.getByText(/An announced supplier relationship is not shipment evidence/)).toBeVisible();
  await page.getByRole("button", { name: "Open the research record ↗" }).click();
  const article = page.getByRole("article", { name: "Selected research" });
  await expect(article.getByRole("heading", { name: "Greenfuel–EVE · cell sourcing" })).toBeInViewport();
  await expect(article.getByText("Agreement · not delivery", { exact: true })).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`market and policy sections remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/ecosystem/batteries/market");
    await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByRole("heading", { name: "Market catalog." })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(10);
    const unavailable = page.getByRole("article", { name: /Axelium/ });
    await expect(unavailable.getByRole("link", { name: /Check restock/ })).toHaveAttribute("href", "https://axelium.in/portable-lithium-battery-pack-1");
    await page.getByLabel("Search products").fill("Voltech 24");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByText(/Indicative.*GST extra/)).toBeVisible();
    await page.getByLabel("Purchase route").selectOption("checkout");
    await expect(page.getByRole("heading", { name: "No matching products" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByRole("article")).toHaveCount(10);
    async function expectLayout() {
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        small: Array.from(document.querySelectorAll("main a, main button, main input, main select")).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
        }).map((element) => element.textContent ?? element.getAttribute("aria-label")),
      }));
      expect(layout).toEqual({ overflow: false, small: [] });
    }
    await expectLayout();
    await page.getByRole("link", { name: "Policy watch", exact: true }).click();
    await expect(page).toHaveURL(/\/ecosystem\/batteries\/policies$/);
    await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByRole("article")).toHaveCount(8);
    await page.getByRole("button", { name: "Recycling", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(page.getByText(/not a universal compulsory digital battery passport/)).toBeVisible();
    await expectLayout();
    await page.getByRole("link", { name: "Map & companies" }).click();
    await expect(page.getByRole("heading", { name: "Battery Atlas." })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("market and policy pages are network-only with the public offline fallback", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:4002" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    });
    for (const route of ["market", "policies"]) {
      const pathname = `/ecosystem/batteries/${route}`;
      await context.setOffline(false);
      await page.goto(pathname);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const paths = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)))).flat());
      expect(paths).not.toContain(pathname);
      await context.setOffline(true);
      await page.goto(pathname);
      await expect(page.getByRole("heading", { name: "Get online to see your partnerships." })).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(0);
    }
  } finally { await context.close(); }
});
