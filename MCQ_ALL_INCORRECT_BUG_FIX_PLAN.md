# MCQ "All Answers Incorrect" Bug — Diagnosis & Fix Plan

## 🐛 Bug Description
After several auto-interval questions are sent, MCQ questions start marking ALL answers as incorrect — including the actual correct answer.

---

## 🔍 Root Causes Identified

### Root Cause #1 (Critical): Options dropped between edge functions
**Impact: HIGH — causes double AI generation, inconsistent correctAnswer**

When `generate-interval-question` returns a valid MCQ with `options` and `correct_answer`, the client's `handleQuestionSend` (LectureTranscription.tsx line 1660) does NOT forward them:

```js
// ❌ CURRENT — options, correct_answer, explanation are MISSING
await handleQuestionSend({
  question_text: data.question_text,
  suggested_type: data.suggested_type,
  confidence: data.confidence,
  source: "auto_interval",
});
```

As a result, `format-and-send-question` receives `options: undefined` and `correct_answer: undefined`. The condition at line 749:
```js
if (options && Array.isArray(options) && options.length === 4 && correct_answer)
```
...evaluates false, so it falls through to **regenerate the MCQ entirely** via a second AI call (`generateMCQ`). This second call:
- May produce different options from the first
- May return a `correctAnswer` letter that doesn't match the actual correct option
- Is subject to rate limits, timeouts, and degraded AI responses
- Wastes latency and AI credits

**Same bug exists in:**
- `useLectureRecording.ts` line 1225 (manual test path)
- Voice command detection paths (lines 796, 934)

### Root Cause #2: Shuffle `indexOf` bug with duplicate options
**Impact: MEDIUM — causes wrong answer mapping when options have identical text**

Both shuffle implementations use `rawOptions.indexOf(correctText)` to find where the correct option moved after shuffling:

```js
// generate-interval-question (line 528) AND format-and-send-question (line 31)
const newIdx = rawOptions.indexOf(correctText);
```

`Array.indexOf()` returns the index of the **first** match. If AI generates two options with identical text (which happens with math/numeric questions), the correct answer silently maps to the wrong position.

**Example:**
```
Options: ["2x", "2x", "4x", "x²"]  // AI duplicated "2x"
Correct: "A" (index 0 = "2x")
After shuffle: ["4x", "2x", "x²", "2x"]  // correct "2x" is at index 3
indexOf("2x") → returns 1 (WRONG — should be 3)
correctAnswer → "B" instead of "D"
```

### Root Cause #3: No post-shuffle validation
**Impact: MEDIUM — allows silently corrupted questions to be sent**

After shuffling, there is zero validation that:
1. `correctAnswer` is a valid letter (A-D)
2. The option at `correctAnswer` position actually contains the correct text
3. All 4 options are unique

If any of these fail, the question is sent with a broken answer key.

### Root Cause #4: AI response format instability
**Impact: LOW-MEDIUM — occasional malformed correctAnswer from AI**

The AI sometimes returns `correctAnswer` as full text ("B. The mitochondria") instead of just the letter ("B"). While `shuffleMCQOptions` handles this case (returns unchanged when correctIdx is -1), the normalization in `submit-live-response` may still produce correct results. However, combined with Root Cause #1 (double generation), format inconsistencies compound.

---

## 🔧 Fix Plan

### Fix 1: Pass pre-generated options through to format-and-send-question
**Files:** `src/components/instructor/LectureTranscription.tsx`, `src/hooks/useLectureRecording.ts`

**Change:** In ALL `handleQuestionSend` call sites for auto-generated questions, include `options`, `correct_answer`, and `explanation` from the generation response:

```js
// ✅ FIXED — pass through pre-generated MCQ data
await handleQuestionSend({
  question_text: data.question_text,
  suggested_type: data.suggested_type,
  confidence: data.confidence,
  source: "auto_interval",
  options: data.options,
  correct_answer: data.correct_answer,
  explanation: data.explanation,
});
```

This eliminates the double-generation entirely. `format-and-send-question` will hit the pre-generated path (line 749) and use the already-validated options.

**Call sites to fix:**
1. LectureTranscription.tsx line 1660 (auto-interval)
2. LectureTranscription.tsx line 796 (voice command)
3. LectureTranscription.tsx line 934 (slide question)
4. useLectureRecording.ts line 1225 (manual test)

### Fix 2: Use `findIndex` with tracking instead of `indexOf`
**Files:** `supabase/functions/generate-interval-question/index.ts`, `supabase/functions/format-and-send-question/index.ts`

Replace `indexOf` with a tracked index approach that survives duplicates:

```js
// ✅ Track correct option by index through shuffle, not by text matching
const correctIdx = letters.indexOf(correctAnswer);
const rawOpts = options.map((o, i) => ({ text: o.replace(/^[A-D][\).\-\s]+\s*/i, '').trim(), wasCorrect: i === correctIdx }));

// Fisher-Yates shuffle on the augmented array
for (let i = rawOpts.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [rawOpts[i], rawOpts[j]] = [rawOpts[j], rawOpts[i]];
}

const newCorrectIdx = rawOpts.findIndex(o => o.wasCorrect);
const newCorrectLetter = letters[newCorrectIdx];
const newOptions = rawOpts.map((o, i) => `${letters[i]}. ${o.text}`);
```

### Fix 3: Add post-shuffle validation
**Files:** Both shuffle locations

After shuffling, validate the result before returning:

```js
// ✅ Validate shuffle result
if (newCorrectIdx === -1 || newCorrectIdx >= 4) {
  console.error('🚫 Shuffle validation failed — returning unshuffled');
  return mcq; // Return original
}

// Verify correct text is at the new position
if (newOptions[newCorrectIdx].replace(/^[A-D][\).\-\s]+\s*/i, '').trim() !== correctText) {
  console.error('🚫 Shuffle text mismatch — returning unshuffled');
  return mcq;
}
```

### Fix 4: Deduplicate options before sending
**Files:** Both shuffle locations

```js
// ✅ Deduplicate options (if AI generated duplicates)
const uniqueTexts = new Set(rawOpts.map(o => o.text));
if (uniqueTexts.size < 4) {
  console.warn('⚠️ Duplicate options detected — skipping shuffle');
  return mcq;
}
```

---

## 📊 Expected Impact

| Fix | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Fix 1: Pass options through | Eliminates double-generation, prevents most occurrences | Small | P0 |
| Fix 2: Track index through shuffle | Prevents wrong mapping with duplicates | Small | P0 |
| Fix 3: Post-shuffle validation | Safety net for edge cases | Small | P1 |
| Fix 4: Deduplicate options | Prevents rare AI edge case | Small | P1 |

---

## 🧪 Testing Scenarios

1. **Auto-interval MCQ**: Verify options from generate-interval-question are used directly (no second AI call)
2. **Voice command MCQ**: Same verification
3. **Duplicate options**: Mock AI returning duplicate options, verify correct answer mapping
4. **Edge case formats**: Test correctAnswer as "B", "B.", "B) text", full text
5. **Long sessions**: Verify 10+ consecutive auto questions all grade correctly

---

## 📝 Files to Modify

1. `src/components/instructor/LectureTranscription.tsx` — Pass options/correct_answer in handleQuestionSend calls
2. `src/hooks/useLectureRecording.ts` — Same fix for manual test path  
3. `supabase/functions/generate-interval-question/index.ts` — Fix shuffle with index tracking
4. `supabase/functions/format-and-send-question/index.ts` — Fix shuffle with index tracking + validation
