

## Plan: Add Two Sections — "Built for Real Sessions" + "Results"

Insert two new `<section>` blocks into `src/pages/Index.tsx` at line 761 (before the closing `</main>` tag). No other files or sections are touched.

### Section 1: Built for Real Sessions

- Eyebrow / headline / subheadline centered, same styling pattern as existing sections
- 4 cards in a `md:grid-cols-2` grid (2×2 feels calmer than 4-across):
  - "Leader-controlled workflow"
  - "Designed for sensitive environments"
  - "Easy to pilot"
  - "Low setup burden"
- Each card: rounded-xl border, `landing-surface` bg, title + body only — no icons, no decorations
- Section separated by a top border, generous py-20

### Section 2: Results

- Eyebrow / headline / subheadline centered
- 2 proof cards in `md:grid-cols-2`, each card containing:
  - Small uppercase eyebrow (e.g. "HIGHER EDUCATION")
  - Title bold
  - Stats line in muted text (e.g. "12 sessions · 78% average response rate")
  - Blockquote-style quote with left emerald accent bar
  - Footer note in small muted text
- Cards use `landing-surface` bg with subtle shadow — polished but not dashboard-like

### File Change

| File | Action | Where |
|---|---|---|
| `src/pages/Index.tsx` | Insert ~120 lines | Line 761, before `</main>` |

