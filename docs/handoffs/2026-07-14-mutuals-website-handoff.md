# Mutuals Website Handoff

Use this file as the current product and copy source of truth when starting a separate website chat. The older landing-page design spec documents the current implementation, but some of its positioning and case-study content predates the decisions below.

## Product truth

**Mission**

Build India's company-to-company opportunity infrastructure.

**Positioning**

Mutuals is the external partnerships function for early-stage companies.

**Promise**

Mutuals identifies the highest-value partnership worth pursuing, structures the exchange, and advances it to a decision-ready pilot. If no partnership is justified, it says so. The client's team owns product and delivery.

**Governing principle**

Mutuals matches present assets to present needs; it does not manufacture synergy.

## Exact hero direction

**Headline**

> One partnership can change a company. We find the right one.

**Support**

> Mutuals researches your company, identifies where another organisation can unlock growth, and advances the relationship from hypothesis to pilot.

**Primary CTA**

> Find my next partnership

The supporting product idea is “Your external partnerships function.” It may appear as a restrained eyebrow or explanatory line, but it should not compete with the headline.

## What every word must imply

- **Your:** Mutuals acts from the company's interests.
- **External:** it operates beyond the company boundary.
- **Partnerships:** it creates reciprocal relationships, not purchased labour.
- **Function:** it owns a continuous responsibility, not a recommendation feed.
- **Discovers:** it identifies non-obvious counterparties.
- **Structures:** it defines the exchange, economics, responsibilities, and pilot.
- **Advances:** it handles research, outreach, qualification, negotiation, and follow-up.
- **Decision:** human judgment remains with the company.
- **Delivery:** product and operational execution remain with the company's team.

## Ideal visitor

A founder or empowered senior operator at an early-stage company with a real product, real customers or users, or clear intent and ability to execute. The person can authorize Mutuals to initiate conversations and carry them forward.

The website should not be written for passive networkers, generic startup audiences, or people seeking a lead list.

## Visual direction

- warm toned-white background;
- pastel charcoal for ordinary text and true near-black for decisive emphasis;
- large negative space;
- graph-like grids and coordinate lines that imply objectivity and an activity-driven culture;
- a restrained right-side signal-to-decision graph is welcome;
- light, collaborative, precise, and editorial;
- no decorative feature density, generic AI art, stock imagery, logo walls, or internal system diagrams.

The user explicitly liked the earlier right-side graph with language such as “signal captured.” Retain the feeling of movement from signal to human decision, but do not turn the hero into the internal network-engine map.

## Page structure

The top bar contains:

1. How it works
2. For startups
3. About
4. Apply

### How it works

Show the operating idea through five concise, concrete partnership paths. On desktop, the five case-study cards sit in one row. On smaller screens, preserve them as a purposeful horizontal rail instead of wrapping them into a generic grid. Clicking or keyboard-activating a card opens a detailed case-study view that can carry the extreme detail without making the landing page verbose.

The cards remain illustrative unless and until Mutuals has verified permission to publish a real outcome. Their content should be reassessed against the current v0 opportunity families and must never imply completed client results.

Current v0 families:

- distribution pathways: referrals, financing-led conversion, creator or agency distribution;
- strategic access: supply or manufacturing access;
- commercial product combinations: non-public commercial integrations, bundles, and cross-selling.

Keep the surface sparse. Extreme detail belongs inside an opened case study, not on the landing page.

### For startups

Convey that a company begins as an idea moving through execution toward a vision. Mutuals understands its present product, customers, constraints, assets, and needs, then finds external relationships that support the next step. Keep this empathetic without calling a founder's company childish or fragile.

### About

Mainstream business narratives focus on competition. Mutuals shifts attention to complementary assets, needs, timing, trust, and customer touchpoints. It looks for value businesses can create together without forcing a connection.

### Apply

Keep it frictionless but definitive. Ask for:

- company URL;
- work email; and
- phone number.

Suggested reassurance: “No deck required. We start with the company itself.”

The current local prototype does not transmit submissions; preserve that honesty unless a real backend is added.

## Copy and content constraints

- Every sentence must either clarify the promise, show the method, qualify the visitor, or enable application.
- Prefer one strong sentence to a paragraph.
- Do not call Mutuals a network recommender, directory, marketplace, community, agency, or founder-services platform.
- Do not promise a partnership on every run.
- Do not expose the full engine architecture on the landing page.
- Do not fabricate testimonials, customers, outcomes, or case-study status.
- Do not add CA/compliance directories, app recommendations, hiring, vendor reviews, market-image feedback, daily recommendations, expertise maps, or generic startup promotion.

## Existing implementation

- Repository: `/Users/keshavgarg/Documents/Creativity`
- Branch: `codex/mutuals-landing`
- Current landing implementation commit: `e59d6a5 feat: build Mutuals landing experience`
- Main files:
  - `app/components/Hero.tsx`
  - `app/components/SiteHeader.tsx`
  - `app/components/CaseStudies.tsx`
  - `app/components/ForStartups.tsx`
  - `app/components/AboutSection.tsx`
  - `app/components/ApplySection.tsx`
  - `app/data/caseStudies.ts`
  - `app/globals.css`
- Existing implementation spec: `docs/superpowers/specs/2026-07-12-mutuals-landing-design.md`
- Current engine source of truth: `docs/superpowers/specs/2026-07-14-mutuals-network-engine-design.md`

## First instruction for the next website chat

Read this handoff, the current rendered page, and the named source files before proposing changes. Treat the new hero and product truth here as authoritative. Preserve the sparse visual character and separate the public landing page from the internal engine/dashboard.
