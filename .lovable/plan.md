
# Live Copilot Reliability Plan

Three independent failure modes are causing the unreliability you're seeing. Each needs its own fix — they compound, but they aren't the same bug.

## Failure 1 — Wrong correct answer in MCQs

**Where it happens:** `supabase/functions/generate-mcq-options/index.ts`

**Root causes**
- Single-pass generation. The model picks options and the correct letter in one shot, with no self-check against the transcript.
- "Resolution" rule is in the prompt but never validated — if the model misresolves a pronoun ("E" → energy instead of "dominant allele"), nothing catches it.
- No structured guarantee that `correct_answer` is supported by `prior_context`. Distractor relevance and answer correctness are entrusted to one model call.
- Model is `google/gemini-2.5-flash` (default). Fast but the weakest reasoning tier — most mistakes are reasoning errors, not knowledge errors.

**Fix approach**
1. Two-stage generation:
   - Stage A — extract: pull the *answer* from `prior_context` first. If transcript supports it, lock it. If not, mark `source: "general_knowledge" | "needs_verification"`.
   - Stage B — generate: produce 4 options *given* the locked answer. Model only chooses distractors, not which letter is correct.
2. Post-generation validator (deterministic, no LLM):
   - Confirm `correct_answer` letter maps to the option whose text matches the Stage-A locked answer.
   - Reject + retry once if mismatch, instead of shipping a wrong key.
3. Upgrade the reasoning model for this one call to `google/gemini-2.5-pro` (or `openai/gpt-5-mini`). MCQ correctness is the highest-leverage place to spend tokens. Keep flash for everything else.
4. Add a "transcript citation" field the model must fill — the exact span from `prior_context` that justifies the answer. Empty citation = reject and fall back to `needs_verification`.

## Failure 2 — Misinterpreted question context / missing prior context

**Where it happens:** `src/hooks/useQuestionTriggerCapture.ts` + `usePassiveQuestionDetection.ts` + the slice handed to `generate-mcq-options`.

**Root causes**
- `getSliceAroundTrigger` cuts at the last `.`/`?`/`!` before the trigger word. Deepgram punctuation is unreliable mid-lecture, so the "boundary" frequently lands in the wrong place — half the relevant teaching ends up in `priorContext`, half is missing.
- `lookbackMs = 30_000` is fixed. Long conceptual setups (>30s) get truncated; short setups get padded with unrelated material.
- `priorContext` is only sliced up to 1500 chars and only the *tail* — when the antecedent for "it/this/that" is earlier in the explanation, it's gone.
- Two parallel detectors (`usePassiveQuestionDetection` text-based + `useQuestionTriggerCapture` interrogative-based) can both fire on the same utterance with different slices. Whichever wins the race is what the AI sees.

**Fix approach**
1. Replace the punctuation-boundary heuristic with a **topic-segment slice**: walk back from the trigger and include all chunks until you hit either (a) a long pause (>4s gap between chunks already in the buffer), or (b) a clear topic-shift marker ("alright, moving on", "next topic", "so now"). This handles missing punctuation.
2. Make `lookbackMs` dynamic: keep growing the context window until you hit ~1200–1800 tokens of content, capped at 90s. Short bursts get less, long setups get more.
3. Send both ends of the lookback to the AI, not just the tail. Use a head + tail summary if it exceeds budget. Add an explicit token budget instead of a char cap.
4. Pick one detector as authoritative for live mode (recommend `useQuestionTriggerCapture` — semantic gate is stronger). Make the other one a *fallback only* triggered after N seconds of silence. Today they fight.
5. Log `priorContext`, the resolved slice boundaries, and the trigger word in PostHog on every dispatch so you can audit misfires after class.

## Failure 3 — Slow / unreliable pickup of asked questions

**Where it happens:** Trigger-capture state machine + Deepgram interim/final flow.

**Root causes**
- `silenceGapMs = 2500`, `minSilenceMs = 1200`, `extensionMs = 2500`, up to `maxExtensions = 2`. Worst case the gate waits ~7s after the question ends before finalizing. Then the MCQ call adds 2–4s. Total: 9–11s perceived latency.
- Completion gate holds on any "dangling token" — common Deepgram artifact at the end of an utterance ("...what is the function of"). It then waits for an extension that may never come, then rejects.
- Triggers only fire on a strict regex list (e.g., `what + is/are/do/does/...`). Many real questions ("Tell me what happens when...", "Anyone know why...", "Could someone explain how...") don't match and never fire.
- No interim/final distinction in the buffer — interim chunks get buffered, then replaced silently by finals. The slice can include text that was never actually said.

**Fix approach**
1. Tighten the gate budget: `silenceGapMs` 2500 → 1200, `extensionMs` 2500 → 1200, `maxExtensions` 2 → 1. Cuts worst-case latency roughly in half. Trade-off is some early-firing on long pauses; mitigated by the topic-segment slice in Failure 2.
2. Speculative pre-fetch: as soon as a trigger arms, kick off MCQ generation with the *current* slice in parallel with the silence wait. If the gate ultimately rejects, throw away the result. If it passes, the answer is already arriving. This alone saves 2–4s on the happy path.
3. Broaden trigger detection beyond starts-of-utterance regex. Add detection for embedded interrogatives ("...so tell me what...", "...why do you think..."), question-mark-only fallback, and a lightweight LLM-based intent classifier as third-tier (cheap nano model, only runs on chunks the regex missed).
4. Replace interim/final dual-write with a single canonical buffer keyed by Deepgram utterance ID — when a final arrives, atomically replace its interim. Eliminates phantom text in slices.
5. Add a visible "listening / drafting / ready" indicator on the instructor UI so the wait feels deterministic instead of broken.

## Suggested rollout order

1. **Failure 1, step 2 (validator)** — biggest correctness win, isolated change, ~1 hour.
2. **Failure 3, step 2 (speculative pre-fetch)** — biggest perceived-speed win, no semantic risk.
3. **Failure 2, step 1 (topic-segment slice)** — biggest context-quality win, requires careful testing against recorded sessions.
4. **Failure 1, step 1 (two-stage generation)** + model upgrade.
5. Remaining items as polish.

## Technical notes

- Files in scope: `src/hooks/useQuestionTriggerCapture.ts`, `src/hooks/usePassiveQuestionDetection.ts`, `supabase/functions/generate-mcq-options/index.ts`, `supabase/functions/format-and-send-question/index.ts`, plus wherever the trigger result is dispatched in the live recording UI (`useLectureRecording.ts`).
- No DB schema changes needed for steps 1–3. Step 5 (PostHog logging) reuses existing `posthogTracking.ts`.
- Model upgrade affects cost: pro is ~10× flash per MCQ. At ~20 MCQs/hour that is still <$0.05/hour incremental. Worth it.
- Speculative pre-fetch will roughly double MCQ generation calls (one wasted per ~30% of triggers). Budget accordingly.

## Out of scope (flagged, not changed)

- Deepgram model/endpointing tuning — separate path (Path 6 in CRITICAL_PATHS).
- Anti-hallucination / repetition filters in `transcriptSanitizer.ts` — already reasonable.
- Slide-question path (`send-slide-question`) — different flow, not implicated here.

Want me to proceed with all five steps in order, or just the top 3?
