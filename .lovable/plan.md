

# Bug Fix Plan: Verified Issues

After reviewing every file referenced in the bug report, here is what is actually broken and worth fixing, versus what is overstated or false.

---

## What is ACTUALLY broken

### Fix 1: Auto-Grade Short Answer NULL Crash (CRITICAL)
**File:** `supabase/functions/auto-grade-short-answer/index.ts`

Line 69 does `expectedAnswer.length > 5000` -- but `expectedAnswer` can be `null` or `undefined` (the function explicitly allows empty expected answers on line 50). This will crash the function with a TypeError.

**Fix:** Change line 69 to guard with optional chaining:
```typescript
if (expectedAnswer && expectedAnswer.length > 5000) {
```
Similarly, line 93 (`hasInvalidChars(expectedAnswer)`) needs the same guard.

---

### Fix 2: Flawed Similarity Algorithm (MEDIUM, not critical)
**File:** `src/hooks/useVoiceCommandDetection.ts`

The `calculateSimilarity` function uses `longer.includes(shorter[i])` which counts *any* occurrence of a character anywhere in the string. This means:
- "aaaa" vs "abcd" would get 100% (all 'a' chars found via includes)
- Completely unrelated strings with common letters score high

In practice, the regex patterns and `includes()` checks fire first, so this is a fallback that rarely triggers. But it should be replaced with a proper algorithm.

**Fix:** Replace with Levenshtein-distance-based similarity:
```typescript
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  // Levenshtein distance
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) { costs[j] = j; }
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1])
          newValue = Math.min(newValue, lastValue, costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return 1 - costs[shorter.length] / longer.length;
}
```

---

### Fix 3: Auth Refresh Hook Cleanup (MINOR)
**File:** `src/hooks/useAuthRefresh.ts`

Two small issues:
- When `checkSession` detects no session (lines 66-67), it clears intervals but doesn't null the refs, so the `useEffect` cleanup might double-clear.
- The `toast` function in the dependency array can trigger unnecessary effect re-runs.

**Fix:** Null out refs after clearing in `checkSession`, and use a ref for the toast function to stabilize the dependency array.

---

## What is NOT broken (or overstated)

| Reported Issue | Verdict |
|---|---|
| Race condition in voice command state | **False** -- uses refs, not state; updates are synchronous |
| Deepgram memory leak | **Minor** -- `disconnect()` cleans up properly; only the reconnect setTimeout is non-cancellable |
| LaTeX XSS | **False** -- KaTeX is inherently safe and does not execute JS |
| Insufficient transcript buffer | **Already handled** -- memory management architecture already trims to 40K chars |
| Hardcoded cooldowns | **By design** -- these are intentional constants, not bugs |
| Race condition in auto-question toggle | **Unverified** -- no evidence of actual breakage |

---

## Summary of Changes

| File | Change | Priority |
|---|---|---|
| `supabase/functions/auto-grade-short-answer/index.ts` | Add null guards on `expectedAnswer.length` and `hasInvalidChars(expectedAnswer)` | Critical |
| `src/hooks/useVoiceCommandDetection.ts` | Replace character-includes similarity with Levenshtein distance | Medium |
| `src/hooks/useAuthRefresh.ts` | Null refs after internal clear; stabilize toast dependency | Low |

Three files changed. No database migrations needed. No new dependencies.

