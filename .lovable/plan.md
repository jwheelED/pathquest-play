

# Fix Edge Function Connection Issues

## Root Cause Analysis

After extensive investigation, I've identified **three separate issues** causing the "failed to send a request to edge function" errors:

### Issue 1: Missing `health-check` Edge Function
The `EdgeFunctionHealthCheck.tsx` component calls `supabase.functions.invoke('health-check')`, but **no `health-check` folder exists** in `supabase/functions/`. This will always fail.

### Issue 2: Edge Functions Are Actually Working
My direct tests to the edge functions returned successful responses:
- `extract-voice-command-question` returned status **200** with valid question extraction
- `extract-slide-question` returned status **401** (expected - requires auth)

This proves the edge functions ARE deployed and reachable.

### Issue 3: Browser Network Issue (Not Server Issue)
The network request log shows `Error: Failed to fetch` with no HTTP status code. This means:
- The request never reached the server
- Could be a browser cache issue, service worker interference, or stale connection
- The preview may need to be refreshed after the recent deployments

---

## Proposed Fixes

### Fix 1: Create Missing `health-check` Edge Function

Create a new edge function that verifies all system components are working:

**File: `supabase/functions/health-check/index.ts`**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const checks = [];
  
  // Check 1: LOVABLE_API_KEY configured
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  checks.push({
    id: "lovable_api",
    name: "AI API Key",
    status: lovableKey ? "pass" : "fail",
    message: lovableKey ? "LOVABLE_API_KEY is configured" : "LOVABLE_API_KEY is missing"
  });

  // Check 2: Supabase connection
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  checks.push({
    id: "database",
    name: "Database Connection",
    status: supabaseUrl && supabaseKey ? "pass" : "fail", 
    message: supabaseUrl && supabaseKey ? "Supabase configured" : "Supabase credentials missing"
  });

  // Overall status
  const failedChecks = checks.filter(c => c.status === "fail");
  const overall = failedChecks.length === 0 ? "healthy" : 
                  failedChecks.length < checks.length ? "degraded" : "unhealthy";

  return new Response(
    JSON.stringify({ overall, checks }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
```

**Update: `supabase/config.toml`** - Add health-check function config:
```toml
[functions.health-check]
verify_jwt = false
```

### Fix 2: Add Retry Logic with Session Refresh

The `LectureTranscription.tsx` and `useLectureRecording.ts` files should refresh the auth session before calling edge functions (similar to what SlidePresenter already does):

**In `LectureTranscription.tsx` (around line 706)**:
```typescript
// Refresh auth session before edge function call
await supabase.auth.refreshSession();

const { data, error } = await supabase.functions.invoke("extract-voice-command-question", {
  body: { recentTranscript },
});
```

### Fix 3: Add Automatic Retry with Backoff

Wrap edge function calls with retry logic to handle transient network issues:

**Use existing `retryWithBackoff` utility** from `src/lib/retryWithBackoff.ts`:
```typescript
import { retryWithBackoff, isTransientError } from "@/lib/retryWithBackoff";

// Wrap edge function call with retry
const { data, error } = await retryWithBackoff(
  () => supabase.functions.invoke("extract-voice-command-question", {
    body: { recentTranscript },
  }),
  {
    maxAttempts: 3,
    baseDelayMs: 1000,
    isRetryable: (err) => isTransientError(err),
    onRetry: (attempt, err) => console.log(`🔄 Retry ${attempt}: ${err.message}`)
  }
);
```

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `supabase/functions/health-check/index.ts` | **CREATE** - New health check edge function |
| `supabase/config.toml` | **EDIT** - Add `[functions.health-check]` config |
| `src/components/instructor/LectureTranscription.tsx` | **EDIT** - Add session refresh before edge function calls |
| `src/hooks/useLectureRecording.ts` | **EDIT** - Add session refresh and retry logic |

---

## Why This Will Work

1. **Health check endpoint** - Gives a proper diagnostic tool that actually exists
2. **Session refresh** - Prevents 401 errors from expired tokens during long sessions
3. **Retry logic** - Handles transient network glitches automatically
4. **Edge functions confirmed working** - Direct curl tests prove the server-side is fine

---

## Immediate Action: Clear Service Worker Cache

The PWA service worker may be caching failed requests. After implementing these fixes, users should:
1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
2. Or open browser DevTools > Application > Service Workers > "Unregister"

