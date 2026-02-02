
# Fix PostHog Display Name (UUID → User Name)

## Problem
PostHog shows user IDs like `019c1022-4573-74c8-8205-ebc06ce6ac25` instead of user names because:
1. We only pass `email` to `posthog.identify()`, not `name`
2. The user's `full_name` is in the `profiles` table, which we're not querying

## Solution
Update the PostHog identification to fetch the user's profile and pass their `full_name` as the display name.

---

## Implementation

### File: `src/App.tsx`

**Current code (lines 47-64):**
```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (session?.user) {
        posthog.identify(session.user.id, {
          email: session.user.email,
          role: session.user.user_metadata?.role,
        });
      } else if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    }
  );
  return () => subscription.unsubscribe();
}, []);
```

**Updated code:**
```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (session?.user) {
        // Fetch user's profile to get their full name
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .maybeSingle();
        
        // Identify user in PostHog with name for better display
        posthog.identify(session.user.id, {
          email: session.user.email,
          name: profile?.full_name || session.user.email, // Use name for display
          role: session.user.user_metadata?.role,
        });
      } else if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    }
  );
  return () => subscription.unsubscribe();
}, []);
```

---

## What Changes

| Property | Before | After |
|----------|--------|-------|
| Display Name | `019c1022-4573-74c8-8205-ebc06ce6ac25` | `Eric Burkholder` |
| Email | ✅ Captured | ✅ Captured |
| Role | ✅ Captured | ✅ Captured |

## Technical Notes

1. **Async callback**: The auth state change handler becomes `async` to await the profile fetch
2. **Fallback**: If profile doesn't exist yet (new user), falls back to email as the display name
3. **PostHog property**: Uses `name` (not `$name`) which PostHog auto-maps to `$name` for display

## Build Error (Separate Issue)

The console warning about "Function components cannot be given refs" is a React warning, not a breaking error. It comes from React Router's internal handling of route elements but doesn't affect functionality. If you'd like, I can address this in a follow-up fix.
