# Mewtuals Website v2 Rebrand Design

## Goal

Rebrand the existing Mutuals landing page as **Mewtuals** for mewtuals.com, treating the unexpected spelling as the brand's only playful device while keeping the product, visual system, and operating promise serious.

## Version contract

- Preserve the current website source as the immutable Git tag website-v1.
- Build the rebrand on the existing codex/mutuals-landing branch.
- Tag the completed, verified rebrand as website-v2.
- Version switching is a source-control operation, not a public UI toggle. After switching tags, rebuild and restart the local server.
- Preserve the uncommitted .openai/hosting.json project binding; it is operational configuration, not part of the visual rebrand.

## Positioning

Mewtuals is the external partnerships function for internet-native companies. It is particularly legible to AI startups, creator-economy companies, and consumer brands whose reputation, distribution, and demand already move through online networks.

The tone is:

- current, concise, and internet-fluent;
- authoritative without sounding institutional;
- slightly unusual in name, exacting in practice;
- free of cat imagery, cat language, puns, mascots, or cute interaction patterns.

## Visual direction

Preserve the existing warm paper, charcoal typography, graph field, generous negative space, restrained controls, and editorial layout. Use the complete wordmark **Mewtuals** in one typographic treatment; do not isolate, color, underline, animate, or illustrate “mew.” The spelling carries the personality by itself.

## Public copy

### Header

Wordmark: **Mewtuals**

Navigation remains: How it works, For startups, About, Apply.

### Hero

Eyebrow:

> The external partnerships function for internet-native companies.

Headline remains:

> One partnership can change a company. We find the right one.

Support:

> Mewtuals researches your company, identifies where another organisation can unlock growth, and advances the relationship from hypothesis to pilot.

Actions remain:

- Find my next partnership
- See how it works

### For startups

Headline:

> Built for companies that move at internet speed.

Body:

> AI startups, creator-economy companies, and consumer brands already live where reputation, distribution, and demand move quickly. We learn the company as it is now, then advance the relationships that can support its next step.

Principle:

> Less corporate theatre. More useful movement.

Keep the existing five-stage visual sequence.

### About

Headline:

> Less corporate in tone. Exacting in practice.

Body:

> Mewtuals represents internet-native companies with the same seriousness as a traditional partnerships firm—without the theatre, jargon, or distance.

> We map complementary needs, assets, timing, trust, and customer touchpoints, then carry the work until a decision belongs with the people responsible for it.

The comparison remains, with **The Mewtuals map** as the branded label. Rename its accessibility label to **How Mewtuals changes the business map** so the old brand is not exposed to assistive technology.

### Case studies and Apply

- Rename the detail heading to **Mewtuals’ first approach**.
- Change the Apply headline to **Put Mewtuals on your company’s side.**
- Keep every case study illustrative and preserve the no-transmission prototype disclosure.

### Metadata

Title:

> Mewtuals — Partnerships for internet-native companies

Description:

> Mewtuals identifies and advances high-value partnerships for AI startups, creator-economy companies, and consumer brands.

Keep the existing abstract favicon. Do not introduce a cat mark.

## Boundaries

This version changes only public website branding and positioning. It does not rename historical specs, internal engine terminology, package identifiers, source paths, database concepts, or the existing Sites project. It adds no backend, analytics, animations, dependencies, imagery, or public version selector.

## Verification

- Render contract proves the Mewtuals title, wordmark, hero, audience positioning, About positioning, Apply copy, case-study heading, metadata, and favicon.
- Existing navigation, dialog, form, accessibility, and data tests remain green.
- Production build and lint pass.
- Desktop and mobile localhost views preserve the approved layout.
- Browser console has no errors or warnings.
