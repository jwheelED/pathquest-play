

## Fix: Password Reset "Auth Session Missing" Error

### Diagnosis

The auth logs reveal the exact sequence of events:

1. Recovery email is sent successfully (status 200 on `/recover`)
2. User clicks the link, Supabase verifies the token and exchanges it for a session (status 303 on `/verify`, login event fires)
3. **Problem**: The second `useEffect` (line 248) has its own `onAuthStateChange` listener that races against the first one. When the recovery token exchange creates a session, this second listener fires with a `SIGNED_IN` event, sees a valid session, and immediately calls `navigateByRole()` -- redirecting the user away from the password reset form before they can use it. This also causes `fetchSession()` to set `session` state, which renders the "You are signed in" view instead of the recovery form.

The `isRecoveryMode` guard on line 250 doesn't help because React state updates are asynchronous -- by the time the first `useEffect` sets `isRecoveryMode = true`, the second `useEffect` has already captured the stale `false` value in its closure and proceeds with navigation.

Additionally, the logs show repeated "One-time token not found" errors, indicating the token is consumed on the first request but subsequent requests (from email client link previews or re-renders) fail.

### Root Cause Summary

Two competing `onAuthStateChange` subscriptions create a race condition where the navigation listener wins before the recovery listener can suppress it.

### Solution

Merge both `useEffect` hooks into a single consolidated auth state handler that:
1. Detects `PASSWORD_RECOVERY` event FIRST and sets recovery mode
2. Only runs session/navigation logic when NOT in recovery mode
3. Uses a mutable ref (not state) for the recovery flag so the check is instant, not subject to React's async state batching

### Changes

**`src/pages/Auth.tsx`** -- Rewrite auth lifecycle:

- Add a `useRef(false)` for `isRecoveryModeRef` alongside the existing state, so the flag can be checked synchronously inside the listener callback
- Merge the two `useEffect` hooks into one that:
  - Checks URL hash for `type=recovery` on mount, sets both ref and state
  - Sets up a single `onAuthStateChange` that handles `PASSWORD_RECOVERY` by setting the ref+state and returning early
  - For all other events, checks the ref (not state) before proceeding with session/navigation logic
- Remove the separate `fetchSession()` call -- instead handle initial session inside the same listener using Supabase's `INITIAL_SESSION` event
- In the render, use `isRecoveryMode` state (not ref) for UI display since React needs state for re-renders

### Technical Detail

```text
Before (two competing effects):

  useEffect #1 (line 28):  detects recovery --> sets state (async)
  useEffect #2 (line 248): checks state (stale!) --> navigates away

After (single effect with ref):

  useEffect (merged):
    1. Check hash for recovery --> set ref immediately
    2. onAuthStateChange:
       - PASSWORD_RECOVERY? --> set ref, set state, return
       - ref is true? --> skip navigation
       - otherwise --> normal session/navigation logic
```

