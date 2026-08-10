# Mewtuals Physical AI Public Site Design

## Goal

Reposition Mewtuals as the external partnerships function for Physical AI companies and turn the public marketing experience into three clear destinations: Ecosystem, For companies, and Join Mewtuals.

## Information architecture

- `/` is a sparse positioning page. It carries the new Physical AI promise, the existing partnership headline adapted for robotics, one primary join action, one ecosystem action, and a quiet ecosystem map.
- `/ecosystem` explains how the Physical AI ecosystem fits together and what Mewtuals can unlock. It contains the six-stage value chain and four focused outcome cards from the approved reference.
- `/companies` preserves the existing company-facing proposition and partnership comparison, with language adjusted only where the old internet-native/startup framing conflicts with the new Physical AI positioning.
- `/join` keeps the current functional join experience.
- The shared header contains exactly three actions: Ecosystem, For companies, and Join Mewtuals. The Mewtuals logo links home but is not counted as a navigation action.

## Visual system

Keep the established warm paper background, charcoal typography, hairline borders, and generous negative space. Use a small geometric Mewtuals mark beside the wordmark. The diagrams use bordered nodes, fine connector lines, and restrained monochrome line icons rather than dense illustration.

Desktop layouts can show the ecosystem chain horizontally. At the project mobile boundary (`max-width: 767px`), the chain becomes a calm vertical sequence, cards stack to one column, all controls remain at least 44px, and each major idea receives substantial vertical separation. No public route may introduce page-level horizontal overflow.

## Content

Homepage eyebrow: `The External Partnerships function for Physical AI companies`

Homepage headline: `One partnership can change a robotics company. We find the right one.`

Homepage support copy stays concise and describes mapping the Physical AI ecosystem, identifying counterparties, and advancing a partnership from signal to pilot.

The Ecosystem page includes:

1. Components
2. Manufacturing
3. OEMs
4. Integrators
5. Distribution
6. Media

It then presents four Mewtuals outcomes: Supply chain access, Distribution and pilots, Media and visibility, and Ecosystem intelligence.

## Behavior and boundaries

- Navigation links are real routes, close the mobile menu after selection, and preserve keyboard and Escape behavior.
- Existing member, authentication, onboarding, admin, database, and join behavior remain unchanged.
- The service worker remains a public-landing cache only. The new public marketing routes are not added to offline caching in this change.
- No invented customer claims, partner endorsements, or unverified logos are added. Ecosystem category labels are illustrative structure, not claims of affiliation.

## Verification

- Component tests cover exact navigation labels and route destinations.
- Rendered HTML tests cover the new metadata, copy, routes, and absence of removed labels.
- Browser QA covers `/`, `/ecosystem`, `/companies`, and `/join` at 390x844 and 1440x1100, including menu behavior, touch target size, negative space, and horizontal overflow.
- The existing full release gate remains authoritative before deployment.

## Deployment acceptance

Publish an exact committed target through the existing Sites project recorded in `.openai/hosting.json`. The authenticated publisher must validate the prepared request and digest, prove that the credential-returned Sites source branch points at the target SHA, and obtain any required public-deploy authorization. Acceptance requires active routing, valid SSL, and HTTP 200 responses on both `https://mewtuals.com` and `https://www.mewtuals.com`, including the new `/ecosystem` and `/companies` public routes.
