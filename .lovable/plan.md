

## Plan: Redesign Edvana Landing Page

### Scope

Full rewrite of `src/pages/Index.tsx` (~716 lines). The page structure, copy, CTAs, and sections all change per the spec. No new files needed — all changes are within the single page component. The existing scroll animation hook, logo asset, button/card components, and CSS variables are reused.

### Section-by-Section Changes

#### 1. Top Nav
- Merge "Student Login" and "Instructor Login" into a single **"Login"** link (navigates to a simple choice or `/auth`)
- Keep "Join Session" as a text link
- Add nav links: How It Works | Why Edvana | Trust | Results
- **"Book a Demo"** remains the primary CTA button (right side)

#### 2. Hero Section
- **Headline**: "Know Whether the Room Is Actually With You" (exact copy)
- **Subheadline**: "Edvana helps instructors, trainers, and facilitators check understanding live — without breaking the flow of teaching, training, or explanation." (exact copy)
- **Primary CTA**: "Book a Demo" → `handleBookDemo`
- **Secondary CTA**: "See How It Works" → scrolls to `#how-it-works`
- **Trust row** (3 chips): "No prebuilt polls required" | "Review before sending" | "Built for real live sessions"
- **Hero visual**: Enlarge the existing workflow mockup — show 3 inline panels (live session context, check-in preview card, response summary) at readable size. Remove the current badge pill ("Live understanding without poll-building friction")
- **Remove**: "Know Who's Actually Learning" headline, Student Login / Instructor Login CTAs from hero

#### 3. Audience Band (NEW — inserted after hero)
- Horizontal row with label: "Built for explanation-heavy live sessions like:"
- 6 items in a flex-wrap row with subtle icons: Higher ed teaching, Nursing & clinical education, Workforce training, Workshops & cohort learning, Zoom & hybrid sessions, Technical & case-based instruction

#### 4. How It Works
- Subheading updated: "Check understanding during a live session in three simple steps"
- Step 1 title: "Just Teach" — support text: "Real-time session context, without interrupting flow"
- Step 2 title: "Preview and Send a Check-In" — support text: "You review before participants see it"
- Step 3 title: "See Where the Room Is Confused" — support text: "Act while the session is still live"
- Body copy updated per spec (replace "lecture" references with broader "session" language)
- Reduce `space-y-24` to `space-y-16` to tighten dead space
- Make mockup cards slightly larger (increase padding, font sizes)

#### 5. Why Edvana Is Different
- Left card: add 4th bullet: "Focus on response collection more than live understanding"
- Right card: update bullets to spec (4 items, broader language replacing "instructor" with "leader")
- Bottom tagline updated to exact spec copy: "Polling tools help collect responses. Edvana helps leaders know what the room actually took away while there's still time to adjust."

#### 6. Trust Section
- Title stays: "Built for Trust, Control, and Real-World Rollout"
- Card updates:
  - "Leader-controlled workflow" (was "Instructor-controlled")
  - **Remove FERPA**: "Built for privacy-sensitive environments" with universal privacy language
  - "Easy to pilot" (was "Designed for controlled pilots")
  - "Low setup burden" (was "Fits real classes without heavy setup")

#### 7. Proof Section
- Rename heading: "Used in Real Teaching and Training Environments"
- Enlarge cards (more padding, bigger stats). Keep 3 cards with existing data but add "environment type" label above each.

#### 8. Who It Is For (NEW section — inserted after Proof)
- Heading: "Who Edvana Is For"
- 4 cards in a 2×2 grid:
  - Higher education — "For instructors teaching difficult or explanation-heavy material"
  - Clinical & health-professions education — "For nursing, medical, PA, and case-based learning environments"
  - Training & certification — "For trainers who need live signal without heavy prep"
  - Workshops & cohort-based sessions — "For facilitators leading high-attention learning experiences"
- Each card gets a relevant icon (GraduationCap, HeartPulse, Award, Users)

#### 9. Final CTA
- Headline: "See How Edvana Fits Your Live Sessions"
- Subheadline: "Start with a short demo or controlled pilot to see how Edvana supports real-time understanding in teaching, training, and explanation-heavy sessions."
- Primary: "Book a Demo"
- Secondary: "Start a Pilot Conversation"

#### 10. Footer
- Restructure into 4 columns: Product | Trust | Login & Join Session | Legal
- Tagline: "Live understanding without breaking flow."
- Merge login links into single "Login" in the Login & Join column
- Keep Admin Portal link

### Files to Edit

- **`src/pages/Index.tsx`** — Full rewrite of all sections as described above. ~700 lines, same component structure with scroll animation refs.

No new components, no CSS changes, no route changes needed.

