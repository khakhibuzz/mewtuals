# Battery Atlas: market catalog and policy watch

The user requested a B2B-style catalog of internet purchase links and recent government policies with ecosystem impact insights. Extend the accepted Atlas visual language with two independently shareable public sections: `/ecosystem/batteries/market` and `/ecosystem/batteries/policies`. Shared Atlas navigation connects both with the map; the new routes do not initialize 3D rendering.

## Market

Searchable product cards with category, chemistry and purchase-route filters. Show seller, product specifications, source URL, review date, source-reported availability, MOQ and lead time when explicit. Distinguish direct checkout, quote enquiry and unavailable listings. Display price only when verified, with tax/unit scope; otherwise refer to seller pricing. No checkout, account, outreach, endorsements, rating fabrication or purchase is performed within Mewtuals. Product illustrations are generic category diagrams, not supplier product photographs.

## Policies

Selected Indian national policies and important updates in 2024–2026, including older schemes only when a recent update matters. Show issuer, dated source, implementation/announcement status, affected supply-chain segment, factual change, and a separately labelled Atlas interpretation of impact. Explicitly distinguish proposals, effective rules, category-specific deadlines and eligibility. Link official government material directly. No individualized eligibility determination or legal conclusion.

## Implementation and validation

Static public evidence in `app/data`; framework-free types and filtering in `app/domain`; small market, policy and navigation components in `app/components/battery-atlas`. Existing source data stays intact. No new dependencies or persistence. Both routes remain network-only under the existing public-shell service worker.

Test filtering, empty results, source completeness, date and price scope, outbound CTA semantics, mobile overflow/touch sizes, section navigation and network-only offline behavior. Run focused tests while editing and the documented release gate. Preserve and report unrelated local database/Radar release blockers; do not alter database state to publish this public feature.

## Delivery verification — 7 September 2026

Implemented 10 cell/pack listings from five sellers and eight national-policy cards, with source review dates of 6 September. Seller checkout, enquiry and restock links remain distinct. Policy facts and Atlas impact interpretations are separately labelled. Review caught compact-unit search mismatches; searches such as `24V 20Ah` now match spaced specifications.

Passed: 1,903 unit tests, three rendered-output checks and their production build, 336 database tests, migration checks, 61 acceptance tests, TypeScript, ESLint and diff whitespace checks. After the final test typing correction, all nine market/policy focused tests passed. All 13 Atlas browser tests passed, including desktop, 390px and 320px layouts and network-only offline handling. The mobile policy page was also visually inspected.

The complete browser suite finished with 14 passed, four failed and two not run. Three failures depend on the existing local application's missing `discovery_runs.campaign_key`; Radar rejected its fixture queue as invalid. These are outside the public catalog/policy changes. No database reset, public deployment or purchase was performed. Both new routes are available on the local preview at port 4010.
