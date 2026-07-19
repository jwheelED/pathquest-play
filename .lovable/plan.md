## Scope

Copy-only edits to `src/pages/Index.tsx` (the landing page at `/`) plus the page's `<title>`/`<meta description>`. No layout, component, or logic changes. No visuals reshuffled — just text, plus one new lightweight "pilot proof" strip under the hero using existing landing card styles.

Note: The request mentions "website and deck." I don't see a deck (Keynote/Google Slides/PPTX) in this repo. This plan covers the website only. If you have a deck file you want mirrored, share it or point me at it and I'll do it in a follow-up.

## Guiding principles applied

1. **Value prop locked at the top:** "Real-time visibility into student understanding — while learning is happening." Stated in eyebrow, H1, subhead, and `<meta>`.
2. **Problem-first hook:** Lead with the pain — instructors find out too late that students are lost — before the solution.
3. **Outcomes before features:** Rewrite section headings and card copy so every block leads with what changes for the instructor/room, not what the product does mechanically.
4. **Pilots surfaced early:** Add a compact "In use today" proof strip immediately below the hero CTAs, and strengthen the existing Results section header + framing.

## Section-by-section copy changes

### 1. `<Helmet>` (metadata)
- Title → `Edvana — See student understanding in real time`
- Description → `Instructors usually find out too late that students are lost. Edvana gives real-time visibility into understanding while class is still happening — so you can adjust before the moment passes.`
- `og:title` / `og:description` matched.

### 2. Hero (`#hero`, lines ~324–376)
- Eyebrow: `Real-time visibility into student understanding`
- H1: `Know who's lost — while class is still happening.`
- Subhead: `Instructors usually find out students didn't get it after the quiz, the exam, or the withdrawal. Edvana shows understanding live, in the room, so you can adjust before the moment passes.`
- Primary CTA label unchanged (`Instructor Sign In`), secondary unchanged.
- Proof points row (three chips) → `Live signal, not next-week data` · `You review every check-in before it sends` · `Works in the classes you already teach`

### 3. NEW "In use today" pilot strip (inserted between hero CTAs and the hero product visual)
A single centered row using existing `landing-card` styling, no new component. Content:
- Eyebrow: `In use today`
- Line: `Running in live sessions across higher-ed writing, STEM, and clinical instruction — with 78–85% average response rates and repeat use every session.`
- Small link/button: `See pilot results ↓` scrolling to `#results`.

This gives pilots real estate above the fold without waiting for the current Results section deep in the page.

### 4. Hero product visual flow-steps bar (lines ~393–398)
Retitle steps to be outcome-flavored:
- 1 `Class is running` · 2 `Edvana drafts a check-in from what you just said` · 3 `Room answers in seconds` · 4 `You see who's lost — now`

### 5. How It Works (`#how-it-works`, lines ~567–641)
- Eyebrow unchanged.
- H2: `From "I hope they got it" to "I can see they got it."`
- Subhead: `Three steps that fit the way you already teach — no prep questions, no separate tool to launch.`
- Card 1 title → `Keep teaching`. Body → `You lecture the way you always do. Edvana listens in the background — no scripts, no pre-built polls, no derailed lesson plans.` Micro → `Zero prep, zero interruption.`
- Card 2 title → `Approve a check-in in one tap`. Body → `Edvana drafts a question from what you just said. You glance, approve, and send — or skip it. Nothing goes to students without you.` Micro → `You're always the last word.`
- Card 3 title → `See who's lost, in time to fix it`. Body → `Watch responses land live. If half the room missed the concept, you know now — not on the midterm.` Micro → `Catch drift before it becomes damage.`

### 6. "Built for the live moment" (`#use-cases`, lines ~643–697)
- Eyebrow: `Why it changes the moment`
- H2: `Finding out later is too late.`
- Subhead: `By the time a quiz score or exam grade tells you students were lost, the class has moved on. Edvana closes that gap to seconds.`
- Card 1: `Catch confusion in real time` — `See misunderstanding while you can still re-explain — not two weeks later on a rubric.`
- Card 2: `Stay in the flow of the class` — `No stopping to build a poll, open another tab, or break momentum. Check-ins slot into the lesson you're already teaching.`
- Card 3: `Turn silence into signal` — `A quiet room isn't a clear room. Edvana surfaces what students actually took away, even when nobody raises a hand.`

### 7. "Why Edvana is different" (`#results`, lines ~699–797)
- Eyebrow unchanged.
- H2: `Polls tell you who clicked. Edvana tells you who understood.`
- Left column heading unchanged. Bullets rewritten to lead with outcome-cost:
  - `You have to guess what to ask before class starts`
  - `You stop teaching to launch an activity`
  - `Response data arrives after the moment is gone`
  - `You learn students were lost from the exam, not the room`
- Right column (Edvana) bullets:
  - `Questions come from what you actually just said`
  - `Check-ins fit the lecture — no context switch`
  - `You see understanding in seconds, not weeks`
  - `Confusion surfaces while you can still fix it`
- Footer line: `Polls measure attendance. Edvana measures whether the class landed — while there's still time to make sure it does.`

### 8. "Built for real sessions" (lines ~799–856)
- Eyebrow unchanged.
- H2: `Built to be used — not abandoned by week three.`
- Subhead: `Every instructor tool promises live insight. Edvana is designed so you'll actually keep using it after the pilot.`
- Cards rewritten to outcomes:
  - `You're always in control` — `No check-in reaches students until you tap send. The room never sees a bad question.`
  - `Fits how faculty actually teach` — `No new lesson plans, no rebuilding your slides, no learning curve mid-semester.`
  - `Pilot in one class, not one department` — `Start with a single course. Expand once the workflow proves itself.`
  - `Low IT lift` — `No LMS migration, no complex rollout, no six-month integration.`

### 9. Results (pilots) section (lines ~858–927)
- Eyebrow: `Pilots in progress`
- H2: `Already running in live classes.`
- Subhead: `Edvana is being used right now in higher-ed and STEM classrooms — the same explanation-heavy settings where students most often fall behind quietly.`
- Keep both existing case cards, but rewrite each `eyebrow` to lead with outcome:
  - Case 1 title unchanged. Stats line: `12 sessions · 78% average response rate · repeat use in 4 of 5 classes`. Add outcome micro-line above quote: `What changed: instructor could tell mid-lecture that students hadn't followed the argument.`
  - Case 2 title unchanged. Stats line: `8 sessions · 85% average response rate · used every session after week 2`. Micro-line: `What changed: students reported staying focused because they knew a check-in was coming.`

### 10. Use Cases Detail (lines ~929–983)
- H2: `Where "found out too late" hurts most.`
- Subhead: `Edvana is built first for classrooms where a single misunderstood concept can compound for weeks.`
- Card bodies re-anchored to the cost of finding out late (higher-ed lectures, clinical reasoning, certification exams, cohort workshops) — one sentence each, outcome-led.

### 11. Final CTA (`#demo`, lines ~988+)
- H2: `Stop finding out on the exam.`
- Subhead: `Book a short demo, or start a pilot in one class. See what real-time understanding looks like in your own room.`
- Button labels unchanged.

## Technical notes

- All edits are string-only inside JSX in `src/pages/Index.tsx`. No new imports, no new components, no CSS changes, no route changes.
- The new "In use today" pilot strip reuses existing `landing-card` / `landing-eyebrow` / `landing-accent` tokens — no styling additions.
- `MarketingLanding.tsx` (a separate `/marketing` variant) is not touched by this plan; happy to mirror the changes there in a follow-up if it's still in rotation.

## Out of scope

- Deck edits (no deck file in repo).
- Any layout, imagery, or component structure changes.
- Copy in `PrivacyPolicy`, `AccessibilityStatement`, `CorporateEvents`, `CorporateEnterprise`, or auth pages.
