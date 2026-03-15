

## Plan: Add Use Cases, Emotional Midpoint, Vision, Final CTA & Footer

Insert five new blocks into `src/pages/Index.tsx` at line 925 (before `</main>`), plus a footer after `</main>`. No earlier sections touched.

### Sections to Add

**1. Use Cases** (`id="use-cases-detail"`)
- Eyebrow + headline + subheadline centered
- 4 cards in `md:grid-cols-2` grid: Higher education, Clinical/health-professions, Training/certification, Workshops/cohort-based
- Same card styling as "Built for Real Sessions" — border, `landing-surface` bg, title + body only

**2. Emotional Midpoint**
- Full-width band, generous `py-20`, centered max-w-2xl
- Bold headline: "When you speak, you should not have to do it blind."
- Body paragraph below in muted text
- Similar treatment to the existing category-framing strip (subtle border top/bottom, `landing-surface` bg)

**3. Vision**
- Eyebrow "VISION" + headline + body, centered max-w-2xl
- Clean section, no cards — just typography with generous whitespace
- `py-20`, border-top separator

**4. Final CTA**
- Centered block, `py-24`
- Headline + subheadline
- Two buttons: "Book a Demo" (emerald pill, same as hero) + "Start a Pilot Conversation" (outlined)
- Small muted supporting line below

**5. Footer**
- `<footer>` after `</main>`, `landing-surface` bg with top border
- 4-column grid (`md:grid-cols-4`):
  - Product links, Sessions links, Company links, Brand statement
- Links use muted color, hover to dark
- Bottom bar: `© 2026 Edvana` left-aligned, minimal
- Internal links use `scrollToSection` or `navigate`; external pages (`/privacy`, `/terms`) use router

### File Change

| File | Action |
|---|---|
| `src/pages/Index.tsx` | Insert ~200 lines at line 925 (before `</main>`) + footer after `</main>` |

