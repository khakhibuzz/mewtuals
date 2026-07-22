# Mewtuals Conference Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a full-screen `mewtuals.com/share` page whose large QR code sends conference attendees directly to `https://mewtuals.com/join`.

**Architecture:** Add one public server-rendered route with route-scoped CSS. A focused QR utility owns the canonical destination and deterministic PNG generation; the page consumes that utility and exposes a normal `/join` fallback link. No authentication, persistence, analytics, or client state enters the route.

**Tech Stack:** Vinext/Next.js, React 19, TypeScript, CSS Modules, `qrcode`, Vitest, Testing Library, `jsqr`, `pngjs`

---

## File Map

- Create `app/share/share-qr.ts`: canonical production join URL and deterministic QR PNG generation.
- Create `app/share/page.tsx`: server-rendered conference sharing surface.
- Create `app/share/share.module.css`: viewport-filling responsive presentation and protected QR quiet zone.
- Create `tests/share-page.test.tsx`: route contract and real QR decoding coverage.
- Modify `package.json` and `package-lock.json`: maintained QR encoder plus test-only PNG decoder dependencies.

### Task 1: Add the QR contract with a real decode test

**Files:**
- Create: `tests/share-page.test.tsx`
- Create: `app/share/share-qr.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the smallest encoder and decoder dependencies**

Run:

```bash
npm install qrcode
npm install --save-dev @types/qrcode jsqr pngjs @types/pngjs
```

Expected: dependencies install successfully and the lockfile updates without unrelated package changes.

- [ ] **Step 2: Write the failing QR decoding test**

Create `tests/share-page.test.tsx` with a test that imports `SHARE_DESTINATION` and `generateShareQrDataUrl`, parses the returned base64 PNG with `PNG.sync.read`, decodes the pixels with `jsQR`, and expects the decoded data to equal `https://mewtuals.com/join`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/share-page.test.tsx
```

Expected: FAIL because `app/share/share-qr.ts` does not exist.

- [ ] **Step 4: Implement deterministic QR generation**

Create `app/share/share-qr.ts`:

```ts
import QRCode from "qrcode";

export const SHARE_DESTINATION = "https://mewtuals.com/join";

export function generateShareQrDataUrl() {
  return QRCode.toDataURL(SHARE_DESTINATION, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 768,
    color: { dark: "#11110fff", light: "#ffffffff" },
  });
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npx vitest run tests/share-page.test.tsx`

Expected: PASS and decoded data exactly matches the production join URL.

### Task 2: Build the accessible full-screen share route

**Files:**
- Modify: `tests/share-page.test.tsx`
- Create: `app/share/page.tsx`
- Create: `app/share/share.module.css`

- [ ] **Step 1: Add a failing page contract test**

Add a test that awaits `SharePage()`, renders the returned element, and proves:

- heading `Scan to join Mewtuals` is visible;
- the QR image has accessible name `QR code to join Mewtuals`;
- the visible fallback link is `mewtuals.com/join` with `href="/join"`;
- concise supporting copy describes finding the right partnership.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/share-page.test.tsx`

Expected: FAIL because `app/share/page.tsx` does not exist.

- [ ] **Step 3: Implement the server-rendered page**

Create `app/share/page.tsx` as an async server component. Generate the QR data URL once per render, use a semantic `<main>`, render the wordmark, heading, supporting sentence, QR `<img>`, and normal fallback `<a href="/join">`. Keep copy sparse and use no client-side code.

- [ ] **Step 4: Implement route-scoped responsive styling**

Create `app/share/share.module.css` with:

- `min-height: 100svh` and a centered single-screen composition;
- warm paper background, charcoal type, restrained grid lines, and generous negative space;
- a QR card with plain white quiet zone and no decorative overlap;
- QR width constrained by both viewport width and height so a 390 x 844 phone shows the full experience without scrolling;
- desktop sizing that keeps the QR dominant but not oversized;
- visible link focus styles and reduced-motion-safe behavior (no motion is required).

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npx vitest run tests/share-page.test.tsx`

Expected: all share-page tests PASS.

### Task 3: Verify the production artifact and deploy

**Files:**
- Modify only files required by real verification failures.

- [ ] **Step 1: Run the relevant automated checks**

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

Expected: all commands exit 0 with no test failures or build errors.

- [ ] **Step 2: Verify the real rendered page**

Start the existing development server, open the exact local `/share` URL, and inspect a 390 x 844 viewport. Confirm the full instruction, QR, and fallback link are visible without horizontal overflow; click the fallback and confirm `/join` loads.

- [ ] **Step 3: Perform a real scan check**

Scan the rendered QR with a phone camera at typical arm's-length distance and confirm it proposes `https://mewtuals.com/join`. If a physical phone is unavailable to the implementer, decode the rendered PNG independently and record that the physical scan remains a user-side confidence check rather than claiming it occurred.

- [ ] **Step 4: Commit the exact validated source**

```bash
git add app/share tests/share-page.test.tsx package.json package-lock.json docs/superpowers/plans/2026-07-22-mewtuals-conference-share.md
git commit -m "feat: add conference share QR page"
```

- [ ] **Step 5: Publish through the existing Sites project**

Reuse `.openai/hosting.json`, package the successful build, save a new version from the validated commit, deploy it, and poll until the deployment reports success. Do not create a new Sites project.

- [ ] **Step 6: Verify production**

Confirm `https://mewtuals.com/share` returns HTTP 200, the visible fallback resolves to `/join`, and the deployed QR decodes exactly to `https://mewtuals.com/join`.
