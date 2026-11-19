# Robotics data landing page implementation plan

**Goal:** Add an unlinked, directly shareable `/robotics-data` page that introduces Mewtuals as a factory-workflow data collection partner for robotics labs and data companies.

**Architecture:** One server-rendered route and a scoped CSS module. No database, authentication, new dependencies, navigation entries or service-worker changes. For outreach, invite visitors to reply to the person who shared the link; replace with an email CTA when the user supplies an inbox. Existing `/apply` is a non-submitting prototype and is unsuitable.

**Source context:** The user has access to factories and commercial stores and wants a first collection deal. Competitors' headset specifications are not our capabilities. Do not invent deployments, recordings, customers, volumes or certifications.

**Design:** Paper background, ink typography, small warm accent, generous space. Clear buyer-facing headline, factory-to-dataset schematic, illustrative task categories, three-step pilot process and one contact action. State that scope, capture requirements, permissions and delivery criteria are agreed for a pilot. No hardware claims or catalog UI.

**Visibility:** Accessible by URL with `noindex,nofollow` metadata, absent from existing navigation and homepage. Unlisted is not authenticated/private. Existing network-only behavior applies to the route.

## Implementation and verification

- [x] Add built-output tests for HTTP 200, page metadata, noindex and absence of a homepage link; observe the missing-route failure.
- [x] Implement `app/robotics-data/page.tsx` and `robotics-data.module.css`; invite outreach recipients to reply to the person who shared the page, pending a preferred inbox.
- [x] Extend existing mobile/PWA browser coverage for the route, 320/390/767/1440px layouts, 44px controls and offline fallback.
- [x] Run focused tests, inspect desktop/mobile in the in-app browser and click the contact flow.
- [x] Run the release gate and review only the task diff. The exact scoped release's seven browser journeys pass; broader development-checkout attempts exposed pre-existing local setup issues documented in the verification record. Preserve unrelated files.
- [x] Check live/source compatibility before release. Prepare an exact committed target with `npm run prepare:sites -- <sha>`; reuse the established Sites project and verify both custom domains.

## Release constraint

The current Sites version is older than local development. Do not silently publish unrelated local features as part of this page. Check the exact live source and prepare a scoped release, or report the concrete blocker if the full verification/deployment contract cannot be met.

Released Sites version 16 from `f0ed341f6b694509ff569805a13c88032abfdf63`, based on the former live commit with only this page and its tests. Evidence: `docs/verification/2026-11-16-robotics-data-release.json`.
