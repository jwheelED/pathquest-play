

## Plan: Landing Page Accessibility & Design System Overhaul

This is a comprehensive redesign of `src/pages/Index.tsx` and supporting CSS to fix WCAG contrast failures, unify the visual language, and improve conversion affordances.

---

### Implementation Scope

**Files to modify:**
- `src/pages/Index.tsx` — full landing page rewrite
- `src/index.css` — add landing-specific design tokens
- `tailwind.config.ts` — add `text-main`, `text-muted-landing`, `shadow-card` tokens

**No new files needed** — all changes fit within existing structure.

---

### 1. Design Token Foundation

Add to `tailwind.config.ts` `extend.colors`:
- `text-main: '#1E293B'` (slate-800, all headlines/body)
- `text-muted-landing: '#475569'` (slate-600, subtext minimum)
- `text-subtle: '#64748B'` (slate-500, captions only)

Add `shadow-card: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'`

These tokens enforce contrast floors site-wide without breaking existing dashboard theming.

---

### 2. Header Fixes

- Add `border-b border-slate-200` (solid, not transparent)
- "Join Session" and "Student Login" text → `text-slate-700 hover:text-slate-900 hover:underline`
- "Instructor Login" keeps primary bg but gets explicit contrast check

### 3. Hero Section

- Trust signal subtext ("Free to start", etc.) → `text-slate-600` (from `text-muted-foreground`)
- "For Students" outline button → `border-2 border-slate-700 text-slate-700 hover:bg-slate-700 hover:text-white`
- Replace raw app screenshot (step1Image) with a **stylized React component mockup**: large Mic icon (64px) + oversized text bubble showing "Transcribing: 'Today we'll cover...'". Built as JSX, not an image. Readable at any scale.

### 4. Steps 2 & 3

- Add `items-center` to all step grid rows (already present on some, verify all)
- Replace step2Image with stylized MCQ card component: one question + 4 colored option bars
- Replace step3Image with stylized bar chart: 3 bars with large labels ("Got it: 78%", "Confused: 22%")
- All step indicator text (e.g., "Contextual questions in seconds") → if not a link, use `text-slate-800` with a checkmark icon, not the secondary color

### 5. Feature/Benefit Cards

- Replace emoji icons (`👁️`, `🧠`, `⚡`) with Lucide icons (`Eye`, `Brain`, `Zap`) at 24px, stroke 1.5, `text-slate-800`
- Card styling → `bg-white shadow-card rounded-xl p-6 border border-slate-200` (replacing gradient bg)
- Description text → `text-slate-600`

### 6. Testimonial Cards

- Apply same card treatment: `bg-white shadow-card rounded-xl p-8`
- Constrain container: `max-w-4xl mx-auto`
- Avatar initials → `w-10 h-10 rounded-full bg-slate-200 text-slate-600 font-semibold` (no gradient)
- Remove staggered `md:mt-8` offset on second card
- Quote text stays `text-foreground`, attribution stays `text-slate-600`

### 7. Green CTA Banner

- CTA button inside green banner → `bg-white text-emerald-700 hover:bg-emerald-50` (replace `variant="secondary"` which renders as bright blue)
- "No credit card required" subtext → `text-sm text-white/85` (from `/70`)

### 8. Footer

- Background → `bg-slate-50 border-t border-slate-200`
- All footer link text → `text-slate-600 hover:text-slate-900 hover:underline`
- Move "Admin Portal" from bottom-right into the "Product" column list
- Constrain footer content: `max-w-6xl mx-auto px-6`
- Column gap → `gap-12`
- Copyright text → `text-slate-500`

### 9. Cleanup

- Remove all floating decorative elements (gradient orbs, geometric shapes, particles) — they add visual noise without value
- Remove parallax scroll transforms
- Remove the `useScrollPosition` hook usage (no longer needed)
- Keep scroll-reveal animations on sections (they're fine)

---

### Implementation Order

1. Tailwind config token additions
2. Header + Hero fixes (contrast, button styles, stylized mockup)
3. Steps 2-3 mockup components + alignment
4. Benefit cards (icons + card styling)
5. Testimonials (card styling + avatars)
6. CTA banner button fix
7. Footer restructure
8. Remove floating decorations

All changes are in `Index.tsx` with minor additions to `tailwind.config.ts`. No new components needed — the stylized mockups are inline JSX within `Index.tsx`.

