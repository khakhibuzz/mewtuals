# Mutuals landing page — design QA

## Reference and capture set

- Source of truth: `design/reference/mutuals-objective-field.png`
- Desktop viewport: `artifacts/mutuals-desktop-viewport.png` at 1440 × 1100
- Mobile viewport: `artifacts/mutuals-mobile.png` at 390 × 844
- Full-view comparison: `artifacts/mutuals-comparison.png`
- Focused states:
  - `artifacts/mutuals-how-it-works.png`
  - `artifacts/mutuals-case-dialog.png`
  - `artifacts/mutuals-for-startups.png`
  - `artifacts/mutuals-about.png`
  - `artifacts/mutuals-apply.png`
  - `artifacts/mutuals-mobile-menu.png`
  - `artifacts/mutuals-mobile-how.png`

The comparison places the selected visual direction beside the implemented hero. The focused captures cover every new section and the two responsive interaction states that materially change the layout: the mobile menu and horizontally scrollable case-study rail.

## Fidelity review

### Typography

Geist Sans preserves the selected neutral-grotesk character without introducing a decorative brand voice. The hero keeps the reference hierarchy: a large soft-charcoal statement with the final decision phrase in near-black. The wordmark, navigation, section labels, and body copy remain deliberately subordinate.

### Spacing and layout

The desktop hero retains the selected copy-left, graph-right composition and large negative-space field. The five case studies remain in one row at desktop width. On mobile they become a horizontal rail with a visible next-card edge, preserving the sequence without compressing the content into unusable cards. Section spacing remains generous and dividers provide the only persistent structure.

### Color

The implementation uses warm paper `#f3f0e9`, soft charcoal `#69665f`, readable secondary charcoal `#6b6861`, near-black `#11110f`, and restrained neutral rules. The two normal-text charcoals measure 5.03:1 and 4.88:1 against the paper; the secondary charcoal remains 4.50:1 on the interactive paper-deep surface. Input boundaries measure 3.45:1 against paper. This matches the selected toned-white and pastel-black direction while keeping emphasis objective and legible.

### Graph asset

The hero graph is a generated 1122 × 1402 raster asset sized for its actual placement. It keeps the selected grid, node progression, and exact labels: “signal captured”, “conversation initiated”, “interest aligned”, and “human decision”. It remains sharp at the tested desktop and mobile sizes.

### Copy and information hierarchy

The hero uses the approved core promise verbatim. The top navigation contains only “How it works”, “For startups”, “About”, and “Apply”. Each supporting section answers one question: how value paths start, whom Mutuals represents, why the network exists, and how to apply. Case studies are explicitly labeled illustrative so invented examples cannot be mistaken for customer proof.

### Interaction and accessibility

- All navigation anchors were exercised in the browser.
- Each case-study card opens an in-depth dialog.
- Escape closes the dialog and restores focus to its originating card.
- The application form validates company URL, work email, and phone number with accessible error states.
- The live error summary includes every field-specific message, not only generic guidance.
- The prototype success state clearly says information was not sent and can be reset.
- The mobile menu opens, exposes all four destinations, and closes after selection.
- Escape from the mobile menu, the case-study Apply path, and the application reset all place focus on the next useful control.
- Keyboard focus styling is visible and the live browser console showed no errors or warnings.

## Findings and iteration history

The initial side-by-side visual comparison showed no P0, P1, or P2 fidelity differences. A subsequent static and interaction review found P2 implementation issues outside that first capture: the Apply grid could clip around 1000px; secondary text missed minimum contrast; input focus rings were suppressed; card theses were clamped; and several keyboard/error handoffs lacked complete context. The implementation now stacks Apply at 1180px, uses compliant text tokens, restores focus rings and deliberate focus destinations, announces field-level errors in the live summary, and shows every thesis in full.

P3 polish observations:

- The graph image field is slightly more explicit than the reference because its paper tone creates a very subtle rectangular boundary.
- The rendered Mutuals wordmark is marginally heavier than the reference mock.

Both observations are non-blocking and preserve the intended hierarchy. There are no broken layouts, cropped assets, missing core interactions, inaccessible primary controls, or requirement gaps in the tested states.

## Final result

passed
