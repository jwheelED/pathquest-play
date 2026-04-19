

## Problem Analysis (from logs + code review)

Reviewed `src/hooks/useQuestionTriggerCapture.ts` and the call site in `LectureTranscription.tsx`. Found **three concrete bugs** behind the "first ask gets missed, second works" pattern:

### Bug A — Cooldown is set on *arm*, not on *successful pass*

In `feedChunk` (line 486), the moment a trigger word matches, we do:
```ts
lastTriggerTimeRef.current = now;       // ← 15s cooldown starts HERE
pendingTriggerRef.current = { ... };
```
Then 4.5s later `finalizeCapture` runs the gate. If the gate **rejects** (e.g. "what does it" caught mid-sentence as too short, or the slice trimmed wrong), the cooldown is **still active for ~10 more seconds**. When the instructor immediately repeats themselves, the trigger scanner sees the cooldown is active → returns early → second ask is silently dropped too. The user's experience: "first miss, then nothing happens, then eventually it works."

### Bug B — No re-trigger lock during pending capture

While `pendingTriggerRef` is set, `feedChunk` returns `true` and skips passive detection — good. But there is **no protection against the same utterance arming twice** if the buffer scan finds another trigger word later in the same sentence (e.g. "what does it produce, and how does it work?" — both `what does` and `how does` match). The first arm sets pending; subsequent chunks with sentence-end finalize, the gate passes → `pendingTriggerRef` cleared → next chunk sees `cooldownMs` only. If `cooldownMs` was reset (Bug A fix), a re-arm could happen on the SAME generated question's tail.

### Bug C — No minimum silence before finalize

`finalizeCapture` runs the moment the 4.5s completion timer fires OR a sentence-ending chunk arrives after `minHoldMs` (800ms). There is **no check that the buffer has actually gone quiet** — chunks may still be arriving rapid-fire. The gate evaluates a slice that may be missing the last 1–2 chunks Deepgram is about to finalize. This is why short questions like *"what does it produce?"* sometimes pass the gate with insufficient surrounding context, then fail downstream at Gemini ("not enough context").

### Bug D (related) — Passive detection cooldown poisons retries

`usePassiveQuestionDetection` has its own independent 15s cooldown (`lastDetectionTimeRef`). If the first chunk of the instructor's utterance ("So we just said the mitochondria produces ATP") triggers passive detection and creates a candidate, the candidate may be auto-dismissed silently — but `lastDetectionTimeRef` is now set, blocking the trigger pipeline's downstream `checkPassiveQuestion()` call too. Second ask 5s later → both pipelines locked out.

---

## Fix Plan

All changes in `src/hooks/useQuestionTriggerCapture.ts` plus one tiny coordination fix in `LectureTranscription.tsx`.

### 1. Move cooldown to *successful pass*, not *arm*

Replace `lastTriggerTimeRef.current = now` at arm time with setting it **only after a `pass` verdict**, just before `onCaptureCompleteRef.current?.(candidate)`. Rejected captures (gate `reject` or empty slice) leave the cooldown untouched, so the instructor's immediate retry can arm again.

### 2. Add a `lastSuccessTs` cooldown lock distinct from arm-time

Introduce `lastSuccessTimeRef`. Cooldown check at the top of `feedChunk` becomes:
```ts
if (now - lastSuccessTimeRef.current < cooldownMs) return false;
```
This is the **debounce-after-success lock** the user asked for.

### 3. Add minimum-silence check before finalize

Track `lastChunkTs` on every `feedChunk` call. In `finalizeCapture`, if `now - lastChunkTs < minSilenceMs` (default **1200ms**), do **not** finalize yet — schedule one more 800ms wait (counted as an extension). This prevents finalizing while Deepgram is still emitting.

New option:
```ts
minSilenceMs: 1200   // require this much silence before finalizing
```

### 4. Hard re-trigger lock while pending

Move the trigger scan AFTER an explicit `pendingTriggerRef.current` early-return. Already done structurally, but add a flag `isFinalizingRef` set true during the `finalizeCapture` body so concurrent timer + sentence-end races can't double-emit the same candidate. Clear it in all exit paths.

### 5. Coordinate with passive detection

In `LectureTranscription.tsx` (line 2493–2498), after a successful trigger capture emits a candidate via `checkPassiveQuestion`, **also** reset `usePassiveQuestionDetection`'s internal cooldown so a follow-up retry by the instructor (in the rare case the gate still rejects) isn't blocked by stale passive state. Expose `resetDetection` and call it in the `setTriggerCaptureComplete` callback after handing off.

Additionally: when the trigger pipeline **rejects** a capture (gate-reject), it should NOT leak into passive detection. Today it doesn't (only successful captures call `checkPassiveQuestion`), but verify the path returns early cleanly.

### 6. Logging additions (debug)

- `🚦 [cooldown-block] remaining=Xms` when post-success lock is active
- `🤫 [silence-wait] lastChunk=Xms ago, deferring finalize` when min-silence not met
- `🔒 [finalize-lock] already finalizing, skip`

These will make the next debug session trivial.

---

## Tunables (final defaults)

| Option | Default | Purpose |
|---|---|---|
| `cooldownMs` | 12000 (down from 15000) | Post-success debounce lock |
| `minSilenceMs` | 1200 | Min quiet time before finalize |
| `completionTimeoutMs` | 4500 | Unchanged |
| `minHoldMs` | 800 | Unchanged |
| `extensionMs` | 2500 | Unchanged |
| `maxExtensions` | 2 | Unchanged |

Lowering `cooldownMs` to 12s is safer now that it only counts from successful pass.

---

## Files touched

- `src/hooks/useQuestionTriggerCapture.ts` — refactor cooldown, add `minSilenceMs`, `lastSuccessTimeRef`, `isFinalizingRef`, `lastChunkTimeRef`; add new logs.
- `src/components/instructor/LectureTranscription.tsx` — pass `minSilenceMs: 1200` option; reset passive detection cooldown after successful trigger capture handoff.
- `src/hooks/useLectureRecording.ts` — mirror the option change for consistency.

No edge function, DB, or API changes. Candidate shape unchanged.

## Validation

Test the exact failing case:
- Say *"So we just said the mitochondria produces ATP, what does it produce?"* once.
- Console should show: `[trigger-armed] word="what does"` → `[silence-wait]` (if mid-stream) → `[gate-pass]` → emitted.
- If first attempt fails (gate-reject), repeat immediately. Console should show NO `[cooldown-block]` — second arm proceeds normally.
- After a successful capture, console shows `[cooldown-block] remaining=...` for ~12s on subsequent triggers. Confirms re-trigger lock works.

