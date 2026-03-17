

## Plan: Events Marketing Page

**Scope**: Replace `src/pages/CorporateEvents.tsx` entirely — from a speaker dashboard into a marketing/pricing page. No other files change. The route `/corporate/events` is already wired.

### Design System
Use the existing `.landing-page` scoped class and its utility classes (`.landing-card`, `.landing-cta`, `.landing-eyebrow`, `.landing-heading`, `.landing-subheading`, `.landing-secondary-btn`) from `src/index.css` to match the homepage aesthetic exactly.

### Page Structure (single file: `src/pages/CorporateEvents.tsx`)

**Header**: Edvana logo + "Back to Home" ghost button. Same pattern as `CorporateEnterprise.tsx` but wrapped in `.landing-page`.

**Section 1 — Hero**
- Eyebrow: `EDVANA FOR EVENTS`
- Headline + subheadline (copy as specified)
- Three proof points in a horizontal row with subtle emerald check icons
- No CTA button in the hero (pricing below handles conversion)

**Section 2 — How It Works**
- Eyebrow: `HOW IT WORKS`
- Headline + subheadline
- Three numbered step cards using `.landing-card` with step number, title, and description

**Section 3 — Two Ways to Run an Event**
- Eyebrow: `TWO WAYS TO RUN AN EVENT`
- Headline: "Self-serve or fully supported. You choose."
- Two side-by-side `.landing-card` cards, each with body text and a tag/badge at the bottom

**Section 4 — Pricing**
- Eyebrow: `PRICING`
- Headline + subheadline
- Tab toggle (Self-Serve / Premium) using local `useState` — styled as two pill buttons, not Radix Tabs, to stay within `.landing-page` design
- **Self-Serve tab**: label, pricing matrix table (4 rows × 3 columns), overflow note, "Plan Your Event" CTA
- **Premium tab**: label, pricing matrix table (3 rows × 2 columns), custom quote note, "Request a Quote" CTA
- Matrix: clean table with emerald hover highlight on cells, clear row/column headers
- Both CTAs use `.landing-cta` style

**Section 5 — Enterprise Callout**
- Eyebrow: `ENTERPRISE`
- Headline + body + "Contact Sales" CTA
- Full-width card with subtle emerald border accent

**Footer**: Simple copyright + Privacy/Terms links (same as `MarketingLanding.tsx`)

### Technical Details
- All pricing data is hardcoded as const arrays at the top of the file
- Tab state managed with `useState<'self-serve' | 'premium'>('self-serve')`
- No new components, no new CSS, no new routes — just rewriting the single page file
- Responsive: single column on mobile, side-by-side cards on `md:`, pricing matrix scrolls horizontally on small screens
- All CTAs use `mailto:nigel@edvana.dev` with appropriate subject lines, matching the existing lead-gen pattern

