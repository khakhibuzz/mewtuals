# India Battery Atlas

## Product scope

Public, India-first educational research at `/ecosystem/batteries`, linked from Mewtuals Ecosystem. The user accepted the initial geographic design, then requested populated India research and Three.js WebGPU on 6 September 2026. The current milestone establishes a source-backed foundation for understanding where Indian batteries come from. Future supplier outreach, quotes, transactions and infrastructure are outside this implementation.

## Implemented design

- Three.js WebGPURenderer with WebGL2 fallback, and a separately usable SVG flat map when GPU initialization fails.
- Uniform extruded state geometry with a short reduced-motion-aware arrival animation. Height does not encode capacity. Orbit, keyboard rotation, bounded zoom and reset; the settled view renders on interaction rather than continuously.
- Accessible HTML locality markers clustered at screen scale, linked to the same evidence list. Pins are town/district references, not factory entrances; unresolved locations and agreements remain listed without invented markers.
- Seven lifecycle stages and independent capability filters for cells, packs, BMS, chargers, materials, recycling and end uses.
- 21 selected research records, not a complete census. Source-reported operating, commissioning, qualification, exploration, planned, development and agreement statuses remain distinct.
- Supply-chain dossiers cover cell origin/imports, chemistry, production capacity, certification scope, customer relationships, MOQ and lead time. Every populated field points to sources; missing commercial information stays unknown.
- Readable HTML research is available independently of graphics. The public route remains network-only under the existing service worker.

## Architecture

Pure static public data and framework-free types in `app/data` and `app/domain`; client interaction and rendering under `app/components/battery-atlas`. Three.js loads dynamically in the browser, with explicit renderer, geometry, material, observer and control cleanup. No database or private member data is used by the Atlas. Existing attributed DataMeet geography and GeoNames localities are reused.

## Evidence boundaries

A technology licence is not a cell shipment. An agreement is not delivery. Planned capacity is not operating output, and charger power is not factory capacity. Company/factory management-system certificates are not universal product certificates. Product capability does not locate its factory. Historical Greenfuel–EVE sourcing requires confirmation of current shipments and legal entity. Aircraft and humanoid records establish applications without inventing their cell suppliers. No supplier was contacted and no quote was fabricated.

## Verification — 6 September 2026

Passed so far:
- `npm test`: 107 unit suites / 1,894 tests; production build and all three rendered-page tests.
- `npm run test:db`: 10 suites / 336 tests in isolated `mewtuals_test`.
- `npm run test:migrations`: forward compatibility and populated migration harness.
- `npm run test:acceptance`: 7 suites / 61 tests.
- Manual IAB inspection verified `data-backend=webgpu`, desktop and mobile rendering, capability filtering and supplier dossier navigation.
- Independent review findings addressed: failed-init cleanup no longer retries initialization, keyboard arrows orbit, and filtering remounts the scene to discard old markers.
- Browser tests cover source/status preservation, real screen-distance panning, secondary pointers, 1440/390/320px layouts, touch targets/overflow, 3D keyboard navigation, unsupported-GPU fallback and network-only offline behavior.

Full release-gate results are appended below after the final run. No source commit, push or public deployment has occurred.

## Existing local application blockers

Prior full-browser checks found that the local application database lacks `mewtuals.discovery_runs.campaign_key`; a normal migration failed transactionally because `opportunity_brief_acknowledgement_status` already exists. Radar browser setup returned `The Radar browser run was not queued: invalid.` Dedicated database tests pass. No schema reset, manual migration-history rewrite or unrelated database repair is authorized by this feature. Sites publication remains gated on the full release checks and public-deploy authorization.

### Final release-gate result

- Final `npm run test:e2e`: all **8 Atlas tests passed**. Entire suite: 9 passed, 4 failed, 2 did not run. The four failures repeat the existing local database / Radar fixture blockers above.
- Final typecheck, lint, focused 10-test Atlas/data suite, and `git diff --check` passed. The complete browser command rebuilt the final source successfully. Three.js remains a lazy-loaded chunk; the build reports its bundle-size advisory.
- The pointer regression checks screen transformation rather than hover-dependent stroke bounds; it verifies an actual 80px screen pan.
- Local preview remains available on port 4010. Source changes remain uncommitted; no public release was attempted.

### Guided provenance continuation

Added three source-linked journeys for Ola's in-house cell-to-scooter route, TDSG's Suzuki strong-hybrid batteries, and the historical Greenfuel–EVE sourcing announcement. Each carries its evidence status and limits, with a direct opening into the corresponding dossier. A `Follow a battery` link makes this section reachable without traversing the long mobile results list. Selecting a record resets the evidence panel's scroll position.

Verification: all 9 Atlas browser checks passed; the final mobile journey-link check passed separately after adding the anchor. The focused Atlas/data suite now has 11 passing tests. Final typecheck, lint, production build (browser setup), and diff whitespace checks passed. Desktop journey layout was visually inspected; default viewport restored and the local preview retained. Existing full-release blockers remain unchanged; no public deployment.
