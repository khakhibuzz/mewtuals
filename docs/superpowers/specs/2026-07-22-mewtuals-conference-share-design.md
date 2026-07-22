# Mewtuals Conference Share Design

**Date:** 2026-07-22  
**Status:** Approved

## Goal

Give the founder a conference-ready page at `https://mewtuals.com/share` that can be opened on a phone and shown to another person. The page displays a large QR code that sends the scanner directly to `https://mewtuals.com/join`.

## Experience

The `/share` route is a single-screen public surface designed for viewing at arm's length:

- Mewtuals wordmark.
- Short instruction: `Scan to join Mewtuals`.
- One concise partnership-focused supporting line.
- A large, high-contrast QR code encoding the canonical production URL `https://mewtuals.com/join`.
- A small fallback link to `mewtuals.com/join` for accessibility and situations where scanning is inconvenient.

The QR code and fallback link both lead directly to `/join`. There is no intermediate campaign page, tracking redirect, form, or conference-specific onboarding branch.

## Visual Direction

The page extends the established Mewtuals visual language: warm toned-white background, charcoal typography, quiet grid lines, generous negative space, and sparse editorial copy. The QR is the dominant object and uses a plain light quiet zone with dark modules for dependable scanning. The layout fills the mobile viewport without requiring scrolling at common phone sizes and remains balanced on desktop.

## Architecture

- Add a dedicated server-rendered route at `app/share/page.tsx`.
- Add a small route-specific stylesheet or focused reusable component only if it keeps the page easier to understand.
- Generate the QR deterministically in the application from the fixed production join URL. Prefer a small maintained QR dependency over hand-authored QR markup or an external QR image service.
- Keep the page public and independent of authentication, database access, browser storage, and runtime configuration.
- Preserve all existing `/join` behavior.

## Accessibility and Reliability

- Provide visible text describing the QR destination.
- Make the fallback destination a normal keyboard-accessible link.
- Preserve adequate contrast and the QR quiet zone.
- Prevent decorative grid treatments from crossing the QR code.
- Use responsive sizing so the full QR and instruction remain visible on a 390 x 844 viewport.
- If QR rendering fails during development or build, fail verification rather than shipping an unscannable placeholder.

## Verification

- Unit or UI coverage proves the route renders the instruction and canonical join fallback.
- A QR decoding check proves the generated code resolves exactly to `https://mewtuals.com/join`.
- The project build and relevant test suite pass.
- Browser verification checks the actual `/share` page on a representative mobile viewport and confirms the fallback link reaches `/join`.
- After deployment, verify `https://mewtuals.com/share` returns successfully and the deployed QR still decodes to the canonical join URL.

## Out of Scope

- QR download or print exports.
- Analytics or conference campaign attribution.
- A new join flow or changes to onboarding.
- Offline support, screen-wake controls, contact exchange, NFC, vCards, or wallet passes.

## Acceptance Criteria

1. Opening `https://mewtuals.com/share` displays a polished, full-screen Mewtuals sharing page.
2. The QR is the dominant element and is readable on a phone in typical conference conditions.
3. Scanning the QR opens `https://mewtuals.com/join` directly.
4. The visible fallback link also opens `/join`.
5. Existing public and member routes continue to behave as before.
