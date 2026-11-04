---
name: fix-bug
description: >-
  Diagnose and fix a bug the user reports. Use when the user presents a bug,
  error, crash, failing test, or unexpected behavior and wants it fixed. The
  skill finds the ROOT CAUSE (not just the symptom), explains it, proposes a fix
  (pausing for approval only on risky/ambiguous fixes), applies it, adds a
  recurrence guard (regression test, runtime assertion, type guard, or lint rule
  — whichever fits the bug), then verifies and honestly reports whether the bug
  is actually fixed.
---

# Fix a bug

You are fixing a specific bug the user has presented. Follow this process in
order. Be transparent at every step and never claim a fix works without
evidence.

## Operating principles
- **Root cause, not symptom.** Find *why* the bug happens, then fix that. A patch
  that hides the symptom is not a fix — say so if that's all that's possible.
- **Evidence over confidence.** Only call something "fixed" after you've observed
  it pass (a test, a re-run, a trace). If you can't verify, say so plainly.
- **Show your reasoning.** The user wants to understand the cause and the fix,
  not just receive a diff.
- **Smallest correct change.** Prefer a tight, reversible fix over a refactor.

## Step 1 — Understand & reproduce
1. Restate the bug in one sentence: observed behavior vs. expected behavior.
2. If the report is missing what you need, ask for it (repro steps, exact error
   text / stack trace, the affected page/function, when it started). Don't
   over-ask if you already have enough to start.
3. **Locate the code.** Use Grep/Glob/Read to find the relevant path(s).
4. **Reproduce it** before theorizing, by the cheapest means available:
   - run the failing unit/integration test, or write a quick one that triggers it;
   - run `npm test` / `npm run build`, or trace the code path by reading it;
   - for edge functions (Deno), exercise the extracted pure handler (see the
     pattern in `supabase/functions/__tests__/` + `*/handler.ts`).
   If you genuinely cannot reproduce, say so and proceed on a clearly-labeled
   hypothesis — and lower your confidence in the final report accordingly.

## Step 2 — Root-cause analysis
State, with `file:line` references:
- **What's actually happening** in the code (the mechanism).
- **Why** it produces the bug (the underlying cause).
- The distinction between the symptom and the cause if they differ.
Keep it concrete and short. No hand-waving.

## Step 3 — Propose the fix (and decide whether to pause)
Describe the fix you intend to make. If there are real alternatives with
tradeoffs, list them briefly with a recommendation.

**Autonomy rule — pause only for risky fixes.** Decide:
- **Proceed without stopping** when the fix is small and contained (a localized
  logic/typing error, a single function, a clear off-by-one, a missing guard).
- **STOP and get approval first** (present options via AskUserQuestion or a clear
  question) when the fix is any of:
  - schema/DB-touching (a migration, a new column/constraint, RLS) — note this
    repo treats `supabase/migrations/` and `src/integrations/supabase/types.ts`
    as **do-not-hand-edit**; schema changes ship as migrations;
  - security- or auth-sensitive;
  - a broad refactor or edits a large "god file"
    (e.g. `format-and-send-question/index.ts`, `LectureCheckInResults.tsx`);
  - a change to public/observable behavior or an API contract;
  - ambiguous root cause (more than one plausible culprit) or multiple
    reasonable fixes with meaningfully different consequences.
When in doubt, lean toward a quick check-in over a surprising change.

## Step 4 — Apply the fix
Make the change. Follow repo conventions: TypeScript, no new `any`
(CLAUDE.md rule), TanStack Query for server state, edge logic in
`supabase/functions`. Touch as few files as needed.

## Step 5 — Add a recurrence guard (pick what fits the bug)
Add something to the codebase so this bug cannot silently come back, and
**state which mechanism you chose and why.** Choose per-bug:
- **Regression test** *(default when the bug is unit-testable)* — write it so it
  **fails on the old code and passes on the fix** (red→green). Put it next to the
  existing suites (`src/__tests__/`, `supabase/functions/__tests__/`). This is
  almost always the right call for logic, parsing, grading, detection, and
  handler-level bugs.
- **Runtime assertion / validation / guard clause** — when the invariant can't be
  cleanly unit-tested (e.g. an external-data shape, a "this should never be
  null here" condition). Fail loud and early with a clear message.
- **Type-level guard** — when the bug is a shape/contract error: tighten the
  types, introduce a discriminated union, or remove an `as any` cast so the
  compiler catches a recurrence.
- **Lint rule / config** — when the bug is a systemic pattern that will recur
  across files (e.g. a banned API, a required call). Only when a single test
  wouldn't generalize.
Prefer the test; escalate to the others only when a test genuinely won't capture
it. It's fine to add more than one (e.g. a test *and* a type tightening).

## Step 6 — Verify, then report honestly
Re-run the evidence and check for collateral damage:
- the new regression test passes; the original repro no longer triggers;
- `npm test` is green (don't break the other 180+ tests);
- `npm run build` / `tsc` clean for the files you touched.

Then report with one of these honest verdicts — **never overstate**:
- ✅ **Fixed and verified** — cite the evidence (test X now passes; repro no
  longer reproduces; suite green).
- ⚠️ **Partially fixed / not fully verified** — explain exactly what works, what
  doesn't, and why you couldn't fully confirm (e.g. couldn't reproduce locally,
  needs a real Supabase/Deno run, depends on prod data).
- ❌ **Not fixed** — say so, with what you learned and the next thing to try.

## Step 7 — Summary
Close with a tight recap:
- **Root cause:** … (`file:line`)
- **Fix:** what changed and where.
- **Guard:** which mechanism + why that one.
- **Verification:** the verdict above + evidence.
- **Follow-ups / risks:** anything deferred, or watch-outs.
Leave committing to the user unless they ask you to commit/push.
