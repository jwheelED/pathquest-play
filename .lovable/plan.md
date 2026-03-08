

## Landing Page Redesign Plan

### What Changes

Rewrite `src/pages/Index.tsx` (~619 lines) to match the new page structure, copy, and positioning. No new files needed; all changes are in-place. The existing scroll animations, design system, and green/blue palette are preserved.

### Section-by-Section Breakdown

**1. Navigation (Header)**
- Replace current nav links with: scrollable anchors for "Product", "How It Works", "For Instructors", "For Admins", "Trust"
- Add primary "Book a Demo" CTA button (links to a Calendly or mailto — placeholder `#book-demo` anchor for now)
- Demote "Student Login" and "Join Session" to small text links, visually secondary

**2. Hero Section**
- Badge: "Live understanding, without poll-building friction"
- Headline: "Know Who's Actually Learning"
- Subheadline: "Edvana helps instructors check understanding live without breaking lecture flow."
- Primary CTA: "Book a Demo" (prominent, rounded)
- Secondary CTA: "See How It Works" (outline, scrolls to how-it-works section)
- Trust strip below CTAs: three inline items — "Instructor-controlled", "Built for privacy-sensitive environments", "Designed for real lectures"
- Remove "For Students" as co-equal CTA, remove "Free to start / No credit card / Secure & Private" badges

**3. How It Works (3-step rewrite)**
- Keep existing scroll-triggered animations and mockups (recording button, MCQ card, bar chart)
- Section heading: "How It Works" (remove "Engagement Made Effortless")
- Step 1 — "Just Teach": new copy emphasizing instructor flow, Edvana listens and helps create checks
- Step 2 — "Preview and Send a Check-In": replace "AI Sends Check-Ins"; new copy about instructor control over what gets sent; update mockup label from "Check-In Question" to "Preview Check-In"
- Step 3 — "See Where the Room Is Confused": replace "See Who Gets It"; copy about live response patterns and acting with confidence

**4. Why Edvana Is Different (NEW section)**
- Replaces the current "Why Instructors Love Edvana" benefits grid
- Two-column comparison: "Traditional polling tools" vs "Edvana" with 3 bullet points each
- Closing line: "Polling tools help collect responses. Edvana helps instructors check understanding while there is still time to adjust."
- Use existing scroll animation hook

**5. Trust Section (NEW section)**
- Heading: "Built for trust, control, and real-world rollout"
- Four bullet items with checkmark icons: instructor-controlled workflow, privacy-sensitive environments, controlled pilots, fits real classes without heavy setup
- Clean card layout, no fake compliance badges

**6. Proof Section (replaces Testimonials)**
- Heading: "Used in real learning environments"
- 3 placeholder proof cards in a grid, each with: context, sessions run, average response rate, repeat use, short quote
- Styled as structured data cards (not fluffy quote blocks)

**7. Final CTA Section**
- Headline: "See how Edvana fits a live class"
- Subheadline: "Start with a controlled pilot or a short demo to evaluate real classroom fit."
- Primary: "Book a Demo"
- Secondary: "Start a Pilot Conversation"
- Remove "Join thousands..." and "Free forever" language

**8. Footer**
- Tagline: "Check understanding live without breaking lecture flow."
- Keep Product/Legal link columns; update Product links to match new nav anchors
- Update copyright to 2026

### Technical Details

- Single file edit: `src/pages/Index.tsx`
- All existing imports reused (`useScrollAnimation`, `lucide-react` icons, `edvanaLogo`, `Button`, router)
- Add `Shield`, `Clock`, `GitCompare` or similar icons for new sections; all from `lucide-react` (already installed)
- Maintain session-check redirect logic at top of component (lines 10-96) untouched
- "Book a Demo" buttons use `window.open('mailto:...')` or a placeholder `#book-demo` scroll target until a real booking link is provided
- Preserve all animation state logic (recording, transcript, bars) and refs

