
# Diagnosis: Laptop-Specific Edge Function Failures

## Root Cause Found: **Ad Blocker (uBlock Origin) Blocking Supabase Requests**

Based on your answers, the issue is clear:
- **Different browser** on laptop (likely with extensions)
- **Same network** as other devices
- **Ad blocker installed** on the laptop browser

### Why Ad Blockers Block Supabase

Ad blockers like uBlock Origin maintain filter lists that can accidentally block:
- Requests to `*.supabase.co` domains (seen as "tracking" or "analytics")
- Third-party API requests from any domain
- Requests containing certain patterns in URLs (like `/functions/v1/`)

When blocked, the browser shows "Failed to fetch" with **no HTTP status code** - exactly what your logs show.

---

## Evidence Summary

| Factor | Your Situation | Conclusion |
|--------|----------------|------------|
| Edge functions tested via server | ✅ All return 200 OK | Server is healthy |
| Same network, different devices | ✅ Phone/PC work | Not a network/firewall issue |
| Different browser on laptop | ✅ Confirmed | Browser-specific issue |
| Ad blocker on laptop | ✅ Confirmed | **Most likely cause** |
| Request shows "Failed to fetch" | ✅ No status code | Request blocked before sending |

---

## Fix Options

### Option 1: Whitelist Supabase in Your Ad Blocker (Recommended)

**For uBlock Origin:**
1. Click the uBlock icon in the toolbar
2. Click the power button to disable it for this site, OR
3. Open settings → My Filters → Add these rules:
   ```
   @@||supabase.co^$domain=lovableproject.com
   @@||supabase.co^$domain=edvana.dev
   @@||supabase.co^$domain=lovable.app
   ```

**For AdBlock/AdBlock Plus:**
1. Click the extension icon
2. Select "Don't run on pages on this site"
3. Or add `supabase.co` to your allowlist

### Option 2: Use a Different Browser Profile

Create a new browser profile without extensions for development/testing.

### Option 3: Disable Ad Blocker Temporarily

Turn off the ad blocker while using Edvana, then re-enable when done.

---

## Secondary Issue: Missing `auto-release-answers` Edge Function

The network logs show repeated calls to an edge function that doesn't exist:

```
POST https://otsmjgrhyteyvpufkwdh.supabase.co/functions/v1/auto-release-answers
Error: Failed to fetch
```

This is called in `AnswerReleaseCard.tsx` lines 100 and 429 but the function was never created. While this doesn't cause your main issue (the ad blocker does), it should be fixed to prevent unnecessary errors.

### Proposed Code Fix

Remove the edge function health check and replace with database-based status check.

**File: `src/components/instructor/AnswerReleaseCard.tsx`**

Change the `checkCronHealth` function to not call the non-existent function:

```typescript
// REMOVE these lines (98-105):
const checkCronHealth = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('auto-release-answers');
    setCronHealthy(!error && data?.success === true);
  } catch {
    setCronHealthy(false);
  }
};

// REPLACE with:
const checkCronHealth = async () => {
  // Auto-release is handled by database RPC, not edge function
  // Check if RPC exists by calling it with empty array
  try {
    const { error } = await supabase.rpc('auto_release_expired_answers');
    setCronHealthy(!error);
  } catch {
    setCronHealthy(false);
  }
};
```

Also update line 429 to remove the edge function call.

---

## Not the Cause (Ruled Out)

| Suspected Cause | Why It's Not the Issue |
|-----------------|------------------------|
| CloudConvert pricing | Only used for PPTX→PDF, not general edge functions |
| GitHub branches | You're testing the same deployed version on all devices |
| Supabase maintenance | Server tests return 200 OK |
| Expired tokens | Auth logs show successful requests |
| Service Worker cache | Would affect all browsers on same device |
| PWA offline mode | Network requests are reaching the browser |

---

## Action Items

1. **Immediate**: Whitelist `*.supabase.co` in your laptop's ad blocker
2. **Code Fix**: Remove/replace the `auto-release-answers` edge function calls in `AnswerReleaseCard.tsx`
3. **Verification**: After whitelisting, hard refresh (Ctrl+Shift+R) and test again

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/instructor/AnswerReleaseCard.tsx` | Replace edge function calls with RPC call to fix the secondary missing function error |
