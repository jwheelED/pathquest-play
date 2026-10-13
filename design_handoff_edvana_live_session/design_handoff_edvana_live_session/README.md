# Handoff: Edvana Live — student laptop screen (auto check-in mode)

## Overview
The student-facing browser screen shown during an Edvana live session while **auto question mode** is on. Edvana listens to the instructor, generates a check-in question at intervals from what was just said, and pushes it to students. Key features:
1. **Generated image** (illustration or diagram) shown as a full-width banner *above* the check-in question.
2. **"Lost me" button**: an always-available, anonymous confusion flag in the bottom bar, next to "I'm following".
3. Visuals follow the **Edvana design system** (emerald and sky, DM Sans, calm light surfaces).

Target codebase: `jwheelED/pathquest-play` (React 18 + Vite + TS + Tailwind + shadcn/ui, Supabase). Relevant files: `src/pages/LiveStudent.tsx`, `src/pages/JoinLive.tsx`, `src/index.css` (tokens).

## About the design files
The files in this bundle are **design references built in HTML**. They show the intended look and behavior; they are not production code to copy. Rebuild them in the existing codebase as React + Tailwind components, using its tokens from `src/index.css`, the shadcn primitives, and `lucide-react`. Open `Edvana Live Session.dc.html` in a browser to see all the options animated (serve the folder locally, e.g. `npx serve`).

## Fidelity
**High-fidelity.** Final colors, type, spacing, copy and motion. Recreate them closely using codebase tokens. Course imagery (`gen-heart.png`, `course-thumb.png`) are **stand-ins** for AI-generated images.

The file shows **options** (ids 1a–1k). Pick one per screen with the product owner before building. Suggested defaults are marked ★.

## Frame / global layout (all screens)
- Desktop browser, design canvas 1120×740 content area (fluid in production; content max-width 640–820px, centered).
- Page background: `--surface-app` (canvas-warm `hsl(40 20% 97%)`), or white for the editorial variants (1b, 1g).
- **Top bar**: padding 12px 24px, `bg white/0.85` + `backdrop-blur 16px`, bottom hairline `1px hsl(220 15% 88%)`. Contents: Edvana wide logo (h 22px) · 1px×24px divider · course thumb 36×36 r10 · course title (15/600, -0.01em) + subtitle "BIO 301 · Prof. Mitchell" (12px, text-muted) · right side: `users` icon "142 in the room" (12px muted) + `Badge variant="live"` "Class is live".
- **Bottom bar** (persistent, all live screens): centered, padding 14px 24px, white/0.85 + blur, top hairline.
  - "Lost me": pill, h44, px22, 1px border `--border`, white bg, 14/600, `circle-help` icon. Hover: `slate-50` bg, `slate-300` border.
  - "I'm following": ghost pill, h44, transparent, text-muted, `check` icon. Hover: `slate-100` bg.
  - Right-aligned: `shield` 14px + "Always anonymous" (12px, text-subtle).

## Screens

### 01 Listening (between auto check-ins)
- **1a ★ Breathing spiral**: centered column, gap 28. 240px ring stack (4 concentric circles inset 28px each, emerald-300 border at 0.6→0.3 alpha, emerald-100 fill), Edvana mark 56px centered with glow shadow. Eyebrow "EDVANA LIVE" (11/600, 0.16em, emerald-700) · H "Listening with your class" (34/700, -0.025em) · body "Following the lecture and looking for a moment worth checking. You'll see it here." (15px muted, max-w 420). Three status chips: "Following the lecture", "Finding key concepts" (white, hairline) and active "Preparing a check-in" (emerald-50 bg, emerald-100 border, emerald-700, pulsing 7px dot). Faint `--gradient-mesh` overlay.
- **1b Topic thread**: left-aligned, padding 0 96px. Pulsing dot + "NOW DISCUSSING" eyebrow · topic "The Frank-Starling mechanism" (56/700, -0.03em, lh 1.04) · body 17px muted max-w 520 · 48-bar audio waveform (4px bars, emerald-300/500, 44px tall) · "Earlier: …" topics (13px subtle). Drifting radial emerald/sky glow at top right.

### 02 Auto check-in with generated image + confidence (same card)
- **1c ★ By the book**: card max-w 780, white, r `--radius-xl`, shadow-md, overflow hidden.
  - Image banner h168, `object-fit: cover`. Bottom-left glass pill (white/0.9, blur 12, 11/600): `sparkles` "Generated for this check-in". While generating: `wand-sparkles` "Drawing from the last few minutes…".
  - Body padding 20px 28px, gap 14. Meta row: question-type eyebrow "PREDICTION" (emerald-700) · "From the last few minutes" (12 subtle) · right: timer chip (mono 13, slate-100 pill, `timer` icon, "0:25").
  - Question 22/600 -0.015em lh1.3; helper 14px muted.
  - Answers: 2×2 grid, gap 10, DS `McqOption` (A–D), selected state for the chosen option.
  - Divider, then the confidence row: "How sure are you?" (14/600) + 4 equal buttons h44 r12 (Not sure / Think so / Confident / Certain, with 1–4 dot indicators); selected = 2px primary border + primary/0.06 bg + emerald-800 text. Then `Button` "Submit" with `send` icon.
- **1d Full-bleed**: image spans page width at the top (h300) with a bottom fade to canvas; the glass card (max-w 640, white/0.96, blur 24, `--shadow-hero`) overlaps it at 96px from the top. Answers stacked. Confidence is a 4-stop slider (6px track, gradient-primary fill, 14px dots, 22px active thumb). Full-width "Submit answer and confidence". Lost me / Following float at bottom right.
- **1e Diagram mode** (when the concept needs a figure): top row grid `1fr 250px` h190. Left: generated diagram (here a placeholder: emerald-50, dashed emerald-300). Right: lecture-quote card "FROM THE LECTURE · 2 MIN AGO" plus a quote. Below: question card (type "APPLICATION" in sky-600, timer 0:40), 2×2 answers, confidence pills inline in a slate-50 strip with a small Submit.

**Image rule:** use an illustration by default, and a diagram when the concept is quantitative or spatial. Always show provenance ("Generated for this check-in" / the quote it came from).

### 03 Personal misconception feedback
- **1f ★ Calm tutor**: card max-w 720, padding 30/32, gap 20. Eyebrow "YOUR RESPONSE" · H "You found a misconception." (32/700, "misconception." in emerald-600) · "You chose B and marked Certain. The answer is C." Then a `1fr auto 1fr` row: your answer tile (B, slate) → `arrow-right` → correct tile (C, 2px primary border, primary/0.06). "Why B felt right" box (slate-50, `lightbulb` in amber-strong, 2-sentence explanation). Footer: `users` (sky-500) "**You weren't alone.** 43% of the class made the same distinction." · right "Prof. Mitchell sees this too".
- **1g Thinking mirror**: 2 columns. Left: small image, eyebrow, H "Your certainty just taught you something." (38/700), explanation, room stat. Right: 2×2 confidence × correctness grid (Sure/Unsure × Correct/Not yet). The student's square is highlighted (emerald-50, 2px primary, glow) with a "You · B, Certain" pill and "Misconception found". Other squares: Solid / Knew more than you thought / Still forming.

### 04 "Lost me" (bottom bar, quiet anonymous confirmation)
- **1h ★ Paired pills**: on tap, the Lost me pill turns into `check-circle-2` "Sent anonymously" (sky-50 bg, sky-100 border, sky-600) plus the note "Prof. Mitchell sees the room, never your name." It resets after about 4s.
- **1i Segmented switch**: slate-100 track, white active segment. Tapping Lost me moves the active segment (sky-600 text). A dark ink toast rises above it: `shield-check` "Noted, anonymously. You can switch back anytime."
- **1j Whisper**: compact bar. Left: "Listening with your class" with a pulse dot. Right: small "Following" and "Lost me" text buttons. After a tap: "Your signal is in — anonymous" (sky-600) plus "Undo", and a 2px sky-400 hairline along the top edge fills over the 60s the signal stays active.

### 05 After-class recap
- **1k**: eyebrow "WHAT CHANGED TODAY" · H "Today in Cardiac Physiology" (36/700). 2×2 card grid: Strong (emerald, `check-circle-2`), Misconception corrected (sky, `refresh-cw`), "2× You changed your mind correctly" (40/700 emerald-600 numeral), Worth another look (amber `hsl(38 80% 32%)`, `bookmark`). Bottom: dashed survey strip "Would you want Edvana used again next class?" with 4 pill options. Top-bar badge `outline` "Class ended · 10:50".

## Interactions & behavior
- **State flow**: `listening` → (server pushes an auto question) `checkin` → submit → `feedback` → back to `listening`. Session end → `recap`.
- **Image generation**: the question can arrive before its image. Show the banner blurred (`blur(14px) saturate(.3)`, scale 1.06, opacity 0.55) with the "Drawing…" pill, then cross-fade to sharp over about 1.2s (`cubic-bezier(.4,0,.2,1)`) when the image URL resolves. If generation fails, collapse the banner and show the question without an image.
- **Timer**: counts down per question (e.g. 25s, 40s). On expiry, auto-submit or lock the answers (product decision).
- **Confidence**: required before Submit is enabled; it sits in the same card as the answers.
- **Lost me**: available in every state. It sends an anonymous signal (no user id exposed to the instructor) with a timestamp and the current transcript segment. Debounce to one tap per about 60s. The confirmation is quiet (no modal).
- **Motion** (from the design system): UI entrances use `translateY(16px)→0` + fade, 0.3–0.7s, `cubic-bezier(0.16,1,0.3,1)`. Answer options stagger about 350ms apart. A selection press scales to 0.95 with a 6px `rgba(16,185,129,.22)` ring, using the spring `cubic-bezier(0.34,1.56,0.64,1)`. Live pulse: opacity 1→0.45, 2s loop. Listening rings breathe at scale .94→1.04 over 5s, staggered 0.7s. **Respect `prefers-reduced-motion`.** The HTML loops everything on a 10s cycle for demo purposes only. In production each animation plays once, on its state change.

## State (suggested)
`sessionState: 'listening'|'checkin'|'feedback'|'recap'`, `currentTopic`, `question {id, type, prompt, helper, options[], correctIndex, durationSec, image {kind:'illustration'|'diagram', url|null, status:'pending'|'ready'|'failed', sourceQuote}}`, `selectedOption`, `confidence: 1–4`, `timeLeft`, `lostMeSentAt`, `roomStats {inRoom, sameAnswerPct}`. The question and image arrive via Supabase realtime. Image status updates arrive separately.

## Design tokens
Use `src/index.css` / design system tokens (HSL triplets → `hsl(var(--x))`). The ones used here:
- Emerald 50 `160 50% 96%` · 100 `160 45% 90%` · 300 `160 50% 65%` · 500 `160 84% 39%` · **600 (primary) `160 84% 29%`** ≈ #0c8a64 · 700 `160 84% 23%` · 800 `160 80% 17%`
- Sky 50 `199 90% 95%` · 100 `199 90% 88%` · 400 (secondary) `199 89% 48%` · 500 `199 89% 42%` · 600 `199 85% 34%`
- Amber-strong `45 93% 47%`; danger `0 84% 60%` (End Session / LIVE CHECK-IN only)
- Ink `220 25% 15%` · muted `220 12% 45%` · subtle `220 10% 55%`; slate 50 `210 20% 98%` · 100 `220 15% 94%` · 200/border `220 15% 88%` · 300 `200 15% 78%` · 400 `200 15% 58%`; canvas-warm `40 20% 97%`
- Type: DM Sans (DM Mono for timers and codes). Display 32–56px/700 with -0.025 to -0.03em tracking. Body 14–17px, lh 1.6–1.7. Eyebrow 11px/600 uppercase 0.12–0.16em.
- Radius: pills 9999px · cards `--radius-xl` (1rem) · tiles `--radius-lg` (0.75rem) · confidence buttons 12px
- Shadows: `--shadow-sm/md`, `--shadow-hero` (0 24px 80px ink/8%), `--shadow-glow` (emerald/15%)
- Full values: `_ds/.../tokens/*.css` in this bundle.

## Assets
- `assets/edvana-logo-wide.png`: horizontal lockup (mark + wordmark, transparent), derived from `edvana-standard-logo.png`
- `assets/edvana-mark.png`: spiral mark
- `assets/gen-heart.png`, `assets/gen-diagram.png`: **placeholders** for AI-generated question images
- `assets/course-thumb.png`: placeholder course image
- Icons: Lucide (`lucide-react`). Used: users, circle-help, check, shield, shield-check, audio-lines, layers, sparkles, wand-sparkles, timer, send, line-chart, quote, arrow-right, lightbulb, check-circle-2, refresh-cw, bookmark

## Screenshots
`screenshots/` has one static PNG per option (1a–1k, 1120px wide). Each was taken at the end state of its animation. The capture tool sometimes wraps short pill labels ("Lost me", "Class is live") onto two lines. That is a rendering artifact: those labels are single-line (`white-space: nowrap`) in the intended design.

## Files
- `Edvana Live Session.dc.html`: all screens and options (1a–1k), animated. Needs `support.js` and `_ds/` alongside it.
- `_ds/…/tokens/*.css`, `styles.css`, `_ds_bundle.js`: Edvana design system tokens and components (Button, Badge, McqOption) used by the reference.
