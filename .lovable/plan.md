

## Plan: Premium Homepage Shell & Header

Replace the current Index.tsx header and page wrapper with a clean, premium design system inspired by Apple x Linear — calm, high-trust, restrained.

### What Changes

#### 1. Update Global Style Tokens (`src/index.css`)
- Add landing-page-specific CSS variables for the premium aesthetic:
  - `--landing-bg: 0 0% 99%` (near-white, not pure white)
  - `--landing-text: 220 20% 12%` (near-black)
  - `--landing-muted: 220 10% 52%` (secondary text)
  - `--landing-border: 220 10% 92%` (barely-there borders)
  - `--landing-surface: 0 0% 100%` (card/header surface)
  - `--landing-accent: 160 45% 40%` (restrained emerald, not saturated)
- Add a `.landing-page` utility class scope so these tokens don't leak into the dashboard

#### 2. Rebuild Header in Index.tsx (lines ~145-198)
Replace the current header block with the new structure:

- **Left**: Edvana logo (existing `edvana-icon-logo.png`)
- **Center nav** (desktop only): `Product` · `How It Works` · `Use Cases` · `Results` · `Demo` — using thin dot separators, `font-medium text-[15px]`, muted color with hover-to-dark transition
- **Right utility**: 
  - `Login` — plain text link, navigates to `/instructor/auth`
  - `Join Session` — plain text link, navigates to `/join`
  - `Book a Demo` — solid emerald pill button, `rounded-full px-5 py-2`, restrained shadow

- Header style: `bg-[hsl(var(--landing-surface))]/80 backdrop-blur-xl border-b border-[hsl(var(--landing-border))]`, sticky top-0, z-50
- On mobile: logo left, hamburger right (or just logo + Book a Demo button)

#### 3. Page Shell
- Wrap the page in a `landing-page` class div with `bg-[hsl(var(--landing-bg))]`
- Remove all existing content below the header (hero, steps, trust, etc.) and replace with a single placeholder `<main>` that says nothing — the page is just the shell
- Keep the auth redirect logic intact (lines 80-128)
- Keep `scrollToSection`, `handleBookDemo` helpers

#### 4. Remove Unused Imports
- Strip out all the Lucide icons, scroll animation refs, recording state, bar chart state that powered the old landing page content — they'll be re-added when we build sections

### Files

| Action | File | What |
|---|---|---|
| **Edit** | `src/index.css` | Add landing-page scoped design tokens |
| **Edit** | `src/pages/Index.tsx` | Rebuild header, strip body content to shell only |

### Design Details

Header visual spec:
```text
┌─────────────────────────────────────────────────────────┐
│ [Edvana logo]   Product · How It Works · Use Cases ·    │
│                 Results · Demo                          │
│                                    Login  Join  [Book]  │
└─────────────────────────────────────────────────────────┘
```

- Font: DM Sans (already in the system), 15px nav, 14px utility
- Logo height: 28-32px
- Header height: ~64px
- Max-width container: 1200px, centered
- No gradients, no glow, no colored backgrounds — just white surface + blur
- "Book a Demo" button: `bg-emerald-700 hover:bg-emerald-800 text-white`, subtle `shadow-sm`

