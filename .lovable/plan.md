

## Plan: Fix Question on Deck wrong answers + slow generation

### Root causes

**Wrong answers (screenshot — "Needs current verification" × 4):**
`LiveCopilotHero.tsx` calls `generate-mcq-options` at lines 653–654 and 749–750 with **no `prior_context`** field. The candidate's `.priorContext` (which holds "the mitochondria produces ATP") is dropped. The edge function — correctly applying our new system prompt — sees an unresolvable "it" with no transcript anchor and falls back to the verification-safe path. Logs confirm this exactly: two parallel calls fire on the same question, one with `focused=84 chars` (QuestionOnDeck — correct), one with `focused=0 chars` (LiveCopilotHero — broken). The broken one is what renders.

**Slow on-deck after Nova-3:**
Same root cause × 2. `LiveCopilotHero` and `QuestionOnDeck` independently call the same edge function for the same question — that's a duplicate Anthropic round-trip per detection. Nova-3's slightly different chunk pacing makes this more visible. Removing the duplicate halves the perceived latency.

### Fix

**File: `src/components/instructor/LiveCopilotHero.tsx`**

1. **Lines 643–681 (auto-preview effect)** — Pass `questionCandidate?.priorContext` as `prior_context` and use the joined transcript history (`transcriptChunks.join(' ').slice(-6000)`) as `source_transcript` instead of just `lastChunk`. This brings parity with `QuestionOnDeck`.
2. **Lines 741–775 (regen handler)** — Same fix.
3. **Optional latency win** — Add a guard so `LiveCopilotHero` skips its own generation when it's about to render `QuestionOnDeck` below it (which already does the work). For now, the safer scoped fix is just to make both calls succeed quickly with the right context — duplicate elimination is a follow-up if latency persists.

### Out of scope

- No changes to the edge function (already optimized last turn).
- No changes to `QuestionOnDeck` (already correct).
- No changes to the trigger-capture pipeline (already wires `priorContext` correctly).
- No Deepgram / Nova-3 config changes — the latency is from the duplicate AI call, not transcription.

