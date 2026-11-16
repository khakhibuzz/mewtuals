# Robov3rse newsroom and publication

Date: 2026-09-10
Status: Proposed product design for owner review; not implemented or deployed.

## Outcome

Give the editor one daily workflow for selecting a robotics development, examining its evidence, crafting an article and social variants, and publishing the reviewed article to Robov3rse. Support three enduring editorial layers: daily news, explanations, and original field reports.

The first acceptance journey is one real source-backed story moving from inbox to saved draft, reviewed revision, published article, and a prepared social post. A publication homepage without an operational editor, or an editor without a working public article, does not satisfy this scope.

## Product decision

Recommended: one connected publication application with an anonymous reader surface and an editor-only newsroom, sharing a content service. These are separate access surfaces, not necessarily separate deployments or databases. This keeps preview, article formatting, and published content consistent.

The owner has been asked whether the newsroom should be online or local to the Mac. The online design below is the recommendation, not an approved hosting preference. If local is selected, retain the same editorial model and public publishing API, but keep private drafts and the editor on the Mac. Do not begin dependent implementation before resolving this design choice.

Keep Mewtuals as the partnerships destination. Do not replace its site, copy its private records, or add the publication to its existing deployment.

Robov3rse is the working brand. Renaming is not part of this build.

## Existing work and reuse

The robots-finder repository contains Robot Watch story validation and discovery artifacts, media production/verification tooling, and the Evidence Loop Console. Its current console creates experiments and records verified publications, observations, and decisions. It explicitly excludes article and media editing and is loopback-only.

Preserve that console's runtime and repository boundaries. Build the new publication in a separate project. Reuse compatible concepts through a versioned import/export adapter, not by importing Node filesystem code into hosted pages or maintaining two writable authorities for the same records.

Newsroom drafts are editorial state. Existing content-records remain evidence about verified real publications and subsequent observations. Only a successful public read-back can produce an export eligible for that evidence workflow. An owner-only preview deployment is not a public publication.

## Editor experience

Primary navigation: Today, Stories, Library, Settings.

Today opens on a useful working surface: source inbox, selected lead, and stories being prepared. Empty state offers Add source or Create story, without invented headlines, traffic, or completed research.

### 1. Discover and select

- Accept a source URL with editor-provided notes or excerpts.
- Allow manually triggered refresh of a small editable allowlist of RSS/Atom feeds; scheduling is a later operating decision, not implied by daily use.
- Track source publication time separately from retrieval time. Unknown publication time stays unknown.
- Deduplicate exact source identities and flag possible coverage of the same event for editorial review. Do not silently merge separate developments.
- Group by topic/company and let the editor shortlist or dismiss a candidate.
- A failed feed or unavailable page is visible as unavailable, not an empty successful search.
- Sources supply evidence, never instructions to the editor assistant or authority to publish.

### 2. Build a source brief

Keep the article's reporting brief visible beside its draft:

- What changed and when.
- Why the development matters to readers.
- Claim-to-source references.
- Company claim, company demonstration, independent observation, or unconfirmed report, with attribution.
- Unknowns and conflicting accounts.
- Media source, credit and reuse basis.

Automated extraction may suggest these fields. It must not mark its own output independently verified. A demonstrated action is not proof of autonomy, commercial availability, or broad deployment.

### 3. Craft and edit

One story owns a shared source brief and separate editable channel variants. Saving or regenerating one variant does not silently overwrite another.

- Article: headline, standfirst, body, sources, author, topic/company tags, optional cleared cover image and captions.
- Social: Instagram caption/carousel outline, LinkedIn post, X post/thread, and short-video script. These are text packages in version one, not rendered videos or direct platform integrations.
- Newsletter assembly and email delivery are deferred; the saved article and social text exports can be reused manually.

Provide explicit assistant actions: suggest angles, create outline, draft from selected evidence, explain a term, tighten a passage, and adapt a reviewed article for a channel. Record the input source revision and preserve prior drafts. Flag unsupported claims for editor review; do not imply automated fact checking proves truth.

Server-side generation uses a configured text-generation provider. Credentials remain server-side. Missing configuration or provider failure leaves the manual editor usable and returns an honest unavailable/error state. Generation is not considered delivered until a live configured request has been verified; a prompt-copy substitute does not meet that acceptance criterion. Select and verify the provider during implementation planning, before implementing its adapter or incurring usage.

Generation requests contain only the selected evidence and draft passages visible in the action's input summary. Exclude private interview contacts, restricted assets, credentials and unrelated private notes. Provider selection must specify data handling and cost before real requests run.

### 4. Support the three layers

All layers share sourcing, editing, preview and publishing, with different reporting prompts:

| Layer | Workspace prompts | Outputs |
| --- | --- | --- |
| News | What changed, original source, event date, significance, uncertainty | Brief or article and daily social variants |
| Explained | Reader question, mechanism, examples, evidence, limitations | Evergreen explanation and derivative social content |
| In the field | Visit/interview brief, questions, shot list, field notes, consent/rights, firsthand findings | Field report, interview article or video script/embed |

Original reporting can be planned immediately; it is not a prerequisite for publishing daily news. No full timeline video editor, animation system, or media transcoding service is included.

### 5. Review and publish

Draft -> In review -> Ready are editorial workflow states. Published content is an explicit immutable revision referenced by the article's publication record, separate from its editable draft.

- Preview uses the real article renderer, requires server-side editor authorization and returns private/no-store responses. Also mark it noindex; robots directives are not access control.
- Review shows sources, missing required fields, rights information, and disclosure where relevant.
- Publishing selects the exact reviewed revision; editing the draft afterward does not change the live article.
- That snapshot pins sources, displayed metadata, credits and asset versions. Changes to shared source or asset records cannot change a live article or preserve approval of altered content. Social variants record their originating revision and are marked for review after a correction.
- Publication fails closed on missing required fields or authorization. No silent retries or duplicate posts after an uncertain response.
- Durable read-back identifies the published revision and URL. A failed public URL check shows verification pending, not verified publication.
- Corrections create a new reviewed revision, retain original publication time, and display an updated time/correction note when appropriate.
- Authorized withdrawal removes an article from collections, search, RSS and sitemap, invalidates cached public representations, and makes its public route return 410 with a neutral withdrawal message. Keep its history private. An asset withdrawal also revokes its public bytes and references wherever used; rollback alone is insufficient.
- Social packages are prepared for manual posting. Scheduling, automated posting and account connections require their own explicit scope.

## Reader website

Reference: https://www.humanoidsdaily.com/ for publication structure, not copied articles, branding or media.

Routes:

- `/`: lead story, latest articles, clearly labelled News / Explained / In the field sections where content exists.
- `/news`, `/explained`, `/in-the-field`: chronological or editorial collections.
- `/stories/[slug]`: readable article, credited media, sources, publication/update dates, related articles from actual tags.
- `/topics/[slug]`: automatic collection from published article metadata, not a new researched company database.
- `/search`: published-content search.
- `/about`: editorial promise and sourcing/corrections approach.
- `/work-with-us`: sponsorship and original-access enquiry destinations; no fabricated contact address or form success.
- RSS and sitemap expose published revisions only.

Visual direction: an editorial grid with strong headlines, real robot media when cleared, restrained typography, and one electric-blue accent consistent with the existing Robov3rse direction. Headlines and recent coverage should be visible immediately. Desktop can carry a contextual sponsor rail; mobile places the equivalent unit between content groups without covering text.

Reserve a contextual sponsor placement in the layout and hide it while unbooked. After the connected publishing core works, a small placement configuration can hold advertiser, disclosure, creative, destination and start/end; campaign management is deferred. Preview fixtures, if needed for layout QA, must be clearly synthetic and cannot ship as live sponsorships. No ad exchange, auction system or third-party advertising network is included.

A relevant partnership link can direct an interested reader to Mewtuals. Private editorial notes and reader information are not automatically shared with it.

## Data and security boundaries

Use framework-free domain rules, server-owned orchestration, thin routes and explicit repositories. Hosted structured records use persistent platform storage; approved image uploads use object storage. Do not store authoritative drafts only in browser storage.

Core records: source, story, draft revision, claim/source reference, channel variant, approved asset, publication, sponsorship. Public readers receive a deliberate projection of published revisions only. Drafts, prompts, private source notes, interview contacts and credentials must never enter public responses, HTML, search, RSS, sitemap, or caches.

Unpublished uploads, originals and thumbnails require editor authorization even at their direct URLs. Explicit publication exposes only the approved rendition pinned by that revision; unrelated originals stay private. Asset reads must enforce current publication/withdrawal state rather than rely on unguessable paths.

Online authentication must include server-side editor authorization. Being signed in is not sufficient to gain newsroom access. Development identity bypass, if required, must be loopback-only and impossible to enable in hosted production.

Every write validates input and expected revision. Concurrent edits report a conflict and preserve the editor's text. Publish uses an idempotency key and a transaction/atomic batch for its exact revision and publication record. Retry after timeout first reconciles the durable result.

Fetchers accept bounded source inputs, enforce safe public HTTP destinations on every redirect, block private/link-local/metadata destinations, limit time and response size, and treat HTML as untrusted. Rich text and embeds must be sanitized or rendered through a constrained format.

Backups/export cover editorial records and asset references. The public website is derived from the stored published revisions and can be rebuilt. Publication rollback points to an existing reviewed revision, preserving its history.

## Delivery sequence and acceptance

1. Confirm this product design and online/local editorial choice. Write separate implementation plans for the shared editorial/publishing core and its two surfaces.
2. Implement and verify the connected first story journey with persisted sources/drafts, private preview, authorized publish, public article read-back and a social text export.
3. Add the configured assistant, bounded feed inbox, layer-specific reporting prompts and variant revision handling. Verify real provider success and failure, preserving prior text.
4. Complete publication collections/search, responsive presentation, RSS/sitemap, corrections and sponsorship placement behavior.
5. Verify record export against the existing evidence workflow using a disposable fixture; do not migrate or mutate existing records automatically.

Required checks: permission denial and draft/asset privacy across every public surface and direct URL; source-fetch boundaries; persistence after restart; concurrent-save conflicts; duplicate/uncertain publish recovery; exact snapshot approval; corrections and withdrawal/cache invalidation; real assistant execution, input exclusions and missing-provider state; source deduplication and unavailable feeds; public search/RSS/sitemap filtering; mobile overflow, keyboard operation, touch targets and article readability.

Validate functional browser flows and run the selected project's documented release checks. New Site deployments start owner-only for review. Public audience access and a custom domain are a final launch step after the exact tested result is reviewable. Do not claim the newsroom, website, assistant or public launch exists merely because this design is complete.
