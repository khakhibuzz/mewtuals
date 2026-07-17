import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");
const icons = [
  { filename: "mewtuals-192.png", size: 192 },
  { filename: "mewtuals-512.png", size: 512 },
  { filename: "apple-touch-icon.png", size: 180 },
];
const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";

try {
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });

  for (const { filename, size } of icons) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #f3f0e9; }
      #icon { display: grid; width: 100%; height: 100%; place-items: center; background: #f3f0e9; color: #11110f; }
      #mark { font-family: Arial, Helvetica, sans-serif; font-size: ${Math.round(size * 0.58)}px; font-weight: 700; letter-spacing: -0.13em; line-height: 1; transform: translateX(-${Math.round(size * 0.035)}px); }
    </style><div id="icon"><span id="mark">M</span></div>`);
    await page.locator("#icon").screenshot({ path: path.join(directory, filename), type: "png" });
  }

  await browser.close();
} catch (error) {
  console.error(
    `Unable to generate PWA icons with Playwright ${channel}. Install Google Chrome, or set PLAYWRIGHT_CHANNEL=chromium after running npx playwright install chromium.`,
  );
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
