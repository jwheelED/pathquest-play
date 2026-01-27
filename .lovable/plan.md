
# Fix: Add Missing CORS Header to All Edge Functions

## Root Cause Confirmed

Your DevTools screenshot shows the **exact problem**:

```
Disallowed Request Header: x-supabase-client-platform
```

The Supabase JavaScript client automatically sends a header called `x-supabase-client-platform` with every request. However, all 10 edge functions have CORS headers that do NOT allow this header, causing the browser to block the preflight request.

This is why:
- It works on iOS (different browser/Supabase client behavior)
- It works on PC (possibly different browser version)
- It fails on laptop (stricter browser CORS enforcement)

---

## The Fix

Update the `corsHeaders` in ALL edge functions to include `x-supabase-client-platform`:

**Current (broken):**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

**Fixed:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
```

---

## Files to Update

| # | File | Line to Change |
|---|------|----------------|
| 1 | `supabase/functions/extract-voice-command-question/index.ts` | Line 6 |
| 2 | `supabase/functions/format-and-send-question/index.ts` | Line 7 |
| 3 | `supabase/functions/extract-slide-question/index.ts` | Line 7 |
| 4 | `supabase/functions/send-slide-question/index.ts` | Line 6 |
| 5 | `supabase/functions/health-check/index.ts` | Line 5 |
| 6 | `supabase/functions/generate-interval-question/index.ts` | Line 5 |
| 7 | `supabase/functions/auto-grade-coding/index.ts` | Line 7 |
| 8 | `supabase/functions/auto-grade-short-answer/index.ts` | Line 7 |
| 9 | `supabase/functions/convert-pptx-to-pdf/index.ts` | Line 6 |
| 10 | `supabase/functions/generate-live-lecture-summary/index.ts` | Line 5 |

---

## Technical Explanation

### Why This Happens

1. The Supabase JS client (v2.58.0) automatically adds `x-supabase-client-platform` to identify the client platform
2. When a browser sees a custom header, it sends a CORS preflight (OPTIONS request)
3. The server must respond with `Access-Control-Allow-Headers` listing ALL headers the client will send
4. If ANY header is missing from the allowed list, the browser blocks the actual request
5. Different browsers enforce this differently (Chrome laptop may be stricter than Safari iOS)

### Why It Worked Before

- The Supabase client may have been updated to add this header recently
- Different browsers have different CORS enforcement levels
- iOS Safari and some Chrome versions may be more lenient

---

## Changes Summary

All 10 edge functions will have their `corsHeaders` updated from:
```typescript
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
```

To:
```typescript
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform"
```

This is a one-line change in each file that adds the missing header to the allowed list.

---

## After Implementation

1. All edge functions will be automatically redeployed
2. Hard refresh your laptop browser (Ctrl+Shift+R)
3. The CORS error will be resolved and requests will succeed
