# Diagnosis: "What advantage does that give it?" never reaches Question on Deck

## Root cause

The trigger-capture rewrite is doing its job — it arms on `what advantage`, rescues the `If a cell has…` premise, passes its semantic gate, and fires the candidate. You can confirm this in the console: you'll see `🎯 [trigger-armed] word="what advantage"` and `🎯 Trigger capture emitted question: "What advantage does that give it?"`.

The problem is what happens **next**. In `src/components/instructor/LectureTranscription.tsx` (line 324) the trigger capture doesn't emit straight to the UI — it pipes its candidate through the *old* passive detection hook:

```ts
setTriggerCaptureComplete((candidate) => {
  ...
  checkPassiveQuestion(candidate.text, priorContext);   // ← second gate
});
```

And `usePassiveQuestionDetection.checkUtterance` still has the original narrow allow-list patterns (`src/hooks/usePassiveQuestionDetection.ts` lines 124–139):

```ts
/\bwhat\s+(is|are|was|were|do|does|did|would|could|should|about|happens|happened|causes|type|kind|percentage|number|part|if|makes|caused)\b/i
```

`what advantage` is not in that list, so `hasInterrogativeTrigger("What advantage does that give it?")` returns `false`, and the candidate is silently dropped with the log line:

```
🔍 [passive] skipped "What advantage does that give it?" — no interrogative trigger
```

(The same narrow lists would also drop `what mechanism…`, `why evolutionarily…`, `how come…`, `which advantage…`, etc. — i.e. every example we broadened in the trigger-capture hook.)

A secondary, smaller issue: `checkPassiveQuestion` also re-applies its own 1.5 s cooldown and `lastQuestionSentTime` cooldown, plus a `trailingSilenceMs` (1.2 s) timer before promoting to visible. So even if we broadened the allow-list, a trigger capture immediately after a manual send would still be dropped.

## Fix

Trigger captures have already passed a stricter pipeline (broad trigger + premise rescue + semantic completeness gate + rhetorical/greeting check + 5-word minimum + 900 ms silence). Re-running them through a narrower allow-list is wrong. Two surgical changes:

### 1. Bypass the redundant gate for trigger-captured candidates

In `src/hooks/usePassiveQuestionDetection.ts`, add a small public method that promotes a fully-vetted candidate straight into the pending → visible pipeline, skipping `extractQuestions`, `hasInterrogativeTrigger`, and rhetorical re-checks but still respecting `trailingSilenceMs` so the on-deck card behaves consistently:

```ts
const acceptVettedCandidate = useCallback(
  (text: string, priorContext?: string) => {
    if (!enabled || !text) return;
    const now = Date.now();
    // Skip cooldown checks — trigger capture has its own 12s cooldown.
    const newCandidate: PassiveQuestionCandidate = {
      text,
      detectedAt: now,
      id: `tq-${++candidateIdCounter}`,
      priorContext: priorContext || undefined,
    };
    pendingRef.current = newCandidate;
    setPendingCandidate(newCandidate);
    setPendingStartedAt(now);
    armSilenceTimer();
  },
  [enabled, armSilenceTimer]
);
```

Export it from the hook return.

### 2. Route trigger captures through the new bypass

In `src/components/instructor/LectureTranscription.tsx` (~line 314–326), swap the bridge:

```ts
setTriggerCaptureComplete((candidate) => {
  console.log('🎯 Trigger capture emitted question:', candidate.text);
  pendingPriorContextRef.current = candidate.priorContext ?? null;
  resetPassiveDetection?.();
  const priorContext =
    candidate.priorContext || (intervalTranscriptRef.current || '').trim();
  acceptVettedCandidate(candidate.text, priorContext);   // ← new path
});
```

### 3. (Defense-in-depth) Broaden the passive-detection allow-list too

So that the *organic* passive path (Deepgram emitting a sentence with `?`) also stops missing `what advantage / why evolutionarily / how come / which advantage`. Mirror the trigger-capture regexes in `usePassiveQuestionDetection.ts`:

```ts
const TRIGGER_PATTERNS = [
  /\bwhat\s+\w+/i,
  /\bwhy\s+\w+/i,
  /\bhow\s+\w+/i,
  /\bwhen\s+\w+/i,
  /\bwhere\s+\w+/i,
  /\bwho\s+\w+/i,
  /\bwhich\s+\w+/i,
  /\btell\s+me\s+(what|why|how|when|where|who|which|about|if)\b/i,
  /\b(anyone|anybody|someone|somebody)\s+(know|tell|explain|guess|say|remember|recall)\b/i,
  /\b(can|could|would)\s+(someone|anyone|anybody|somebody)\s+(tell|explain|describe|say|name|identify|guess)\b/i,
  /\bdo\s+you\s+(know|think|see|understand|remember|recall|recognize)\b/i,
  /\bwhat\s+would\s+happen\b/i,
  /\bsuppose\s+that\b/i,
];
```

The existing `RHETORICAL_BLOCKLIST`, `GREETING_PATTERNS`, `minWordCount`, and `trailingSilenceMs` continue to suppress greetings and conversational filler — same protections we already validated in the trigger-capture hook.

## What you'll see after the fix

Console for the same utterance:
```
🎯 [trigger-armed] word="what advantage"
🎯 [slice-split] question="what advantage does that give it" context="If a cell has a high surface-area-to-volume ratio,"
🚦 [gate-pass] 6 words
🎯 Trigger capture emitted question: If a cell has a high surface-area-to-volume ratio, what advantage does that give it?
✅ [passive] promoted pending → candidate
```
And the card appears on deck with the premise prepended.

## Files touched
- `src/hooks/usePassiveQuestionDetection.ts` — add `acceptVettedCandidate`, broaden `TRIGGER_PATTERNS`.
- `src/components/instructor/LectureTranscription.tsx` — replace the bridge call (one line).

No DB, no edge-function, no public-API changes.
