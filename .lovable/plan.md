

## Plan: Add Four Sections Below the Hero

Add four new sections to `src/pages/Index.tsx` inside `<main>`, after the hero `</section>` (line 454). The header and hero remain untouched.

### Section 1: Category-Framing Strip (line ~454)
- Full-width band with subtle top/bottom border, light surface background
- Centered text block (max-w-2xl): headline "The missing feedback loop in live communication" + body paragraph
- Generous vertical padding (py-20), restrained styling — no icons, no cards

### Section 2: How It Works (`id="how-it-works"`)
- Eyebrow + headline + subheadline centered
- Three step cards in a responsive grid (`md:grid-cols-3`), each card with:
  - Step number pill (small emerald circle)
  - Title (bold)
  - Body paragraph
  - Micro-line at bottom (small muted text with accent dot)
- Cards use `landing-surface` bg, `landing-border` border, subtle shadow
- Connected feel via a horizontal rule or subtle numbering

### Section 3: Built for the Live Moment (`id="use-cases"`)
- Eyebrow "WHY IT CHANGES THE LIVE MOMENT" + headline + subheadline centered
- Three feature cards in `md:grid-cols-3`:
  - "No prebuilt polls" / "No broken flow" / "No delayed insight"
  - Each card: title + body, clean border, surface bg
  - Titles use landing-text, body uses landing-muted

### Section 4: Why Edvana is Different (`id="results"`)
- Eyebrow + headline centered
- Two-column comparison layout (`md:grid-cols-2`):
  - Left: "Traditional polling tools" — muted styling, bullet list with subtle markers
  - Right: "Edvana" — accent-highlighted card, bullet list with emerald markers
  - Not a cheesy table — two distinct cards side by side with different visual weight
- Footer line below in muted text, centered

### File Changes
| Action | File |
|---|---|
| **Edit** | `src/pages/Index.tsx` — insert 4 sections after line 454 inside `<main>` |

No new files. No changes to header, hero, or CSS.

