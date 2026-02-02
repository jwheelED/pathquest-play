
# Fix: Instructor Auth Infinite Loading

## Problem Diagnosed

The "signal is aborted without reason" and infinite loading issue in `InstructorAuth.tsx` is caused by a race condition in React StrictMode:

1. StrictMode mounts the component twice (mount → unmount → mount)
2. On first mount, `checkSession()` starts an async `getSession()` call
3. StrictMode immediately unmounts → sets `isMounted = false`
4. Second mount begins, `hasCheckedSessionRef.current` is still `false`
5. The first async call completes, checks `if (!isMounted) return;` → returns early
6. **Critical bug**: The early return happens BEFORE reaching the `finally` block that sets `setIsInitializing(false)`
7. The spinner keeps spinning forever

## Root Cause

The current code has two problems:

```typescript
// Problem 1: Early returns skip the finally block
if (!isMounted) return; // Returns BEFORE finally runs

// Problem 2: The finally block only runs if isMounted
finally {
  if (isMounted) {
    setIsInitializing(false); // Never reached if unmounted
  }
}
```

## Solution

Apply the same pattern used successfully in `Auth.tsx`:

1. **Always set loading to false in finally** - Remove the `isMounted` check from finally block, but guard state updates with isMounted inside try
2. **Add auth state listener** - Use `onAuthStateChange` to properly handle auth events
3. **Separate initial load from ongoing changes** - Like Auth.tsx does

## Technical Changes

### File: `src/pages/InstructorAuth.tsx`

```typescript
useEffect(() => {
  let isMounted = true;
  
  // Add auth state listener for OAuth callbacks
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (!isMounted) return;
      
      // Handle OAuth redirect (SIGNED_IN from OAuth)
      if (event === 'SIGNED_IN' && session) {
        setTimeout(() => {
          handleAuthenticatedUser(session);
        }, 0);
      }
    }
  );

  const handleAuthenticatedUser = async (session: Session) => {
    // ... existing role check logic
  };

  const checkSession = async () => {
    if (hasCheckedSessionRef.current) {
      setIsInitializing(false);
      return;
    }
    hasCheckedSessionRef.current = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!isMounted) {
        // Ensure we still turn off loading even if unmounted
        return;
      }
      
      if (session) {
        await handleAuthenticatedUser(session);
      }
    } catch (error) {
      // Log non-abort errors
      if (!(error instanceof Error && error.message.includes('abort'))) {
        console.error('Session check error:', error);
      }
    } finally {
      // ALWAYS turn off loading - this is the key fix
      setIsInitializing(false);
    }
  };

  checkSession();

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, [navigate]);
```

## Key Fixes

| Issue | Current Code | Fixed Code |
|-------|--------------|------------|
| Finally block guarded | `if (isMounted) setIsInitializing(false)` | `setIsInitializing(false)` unconditionally |
| No auth listener | Missing `onAuthStateChange` | Added listener for OAuth callbacks |
| Early return leaves spinner | Multiple `if (!isMounted) return` before finally | Move isMounted check, always reach finally |
| hasCheckedSessionRef timing | Set after async calls | Set immediately in checkSession |

## Why This Works

1. **Finally always runs** - Even if errors occur or component unmounts, the loading state gets cleared
2. **Setting state on unmounted component** - React 18+ handles this gracefully (just logs a warning in dev)
3. **Auth listener handles OAuth** - Properly catches the SIGNED_IN event from Google redirect
4. **setTimeout(0) pattern** - Prevents Supabase auth deadlock as documented in our memory

## Testing Checklist

After implementing:
- [ ] Email/password sign in works
- [ ] Google OAuth sign in works  
- [ ] Page doesn't get stuck on "Loading..."
- [ ] Existing instructors redirect to dashboard
- [ ] New instructors redirect to org onboarding
