

## Fix: Instructor Redirect to Onboarding Bug

### Root Cause

The instructor "Genetics Professor" has `org_id = NULL` in their profile. The sign-in redirect logic checks `if (!profile?.org_id)` and sends them to `/instructor/org-onboarding` every time they log in, even though they are fully onboarded with courses.

This check exists in **three separate places** in `InstructorAuth.tsx`:
- Line 100: `onAuthStateChange` handler
- Line 160: `getSession` handler on mount
- Line 298: `handleAuth` sign-in function

### Fix

Change the redirect logic in all three places to prioritize the `onboarded` flag and course existence over `org_id`. An instructor who has `onboarded = true` and at least one course should always go to the dashboard, regardless of `org_id`.

**New logic (replacing the current 3-way check in each location):**

```text
// If instructor is fully onboarded with courses -> dashboard
// If instructor has no org -> org onboarding
// If instructor has org but not onboarded -> onboarding
// Otherwise -> dashboard
```

Specifically, in the `handleAuth` function (lines 283-306), the logic already queries for courses but then applies a confusing compound condition. This will be simplified.

In the `onAuthStateChange` and `getSession` handlers (lines 91-107 and 153-167), the logic does NOT check for courses at all and just looks at `org_id` first. These will be updated to also check `onboarded` first.

### Changes to `src/components/instructor/InstructorAuth.tsx`

**All three redirect decision blocks** will be replaced with this unified logic:

```typescript
if (profile?.onboarded === true) {
  // Already onboarded - go straight to dashboard
  navigate("/instructor/dashboard");
} else if (!profile?.org_id) {
  navigate("/instructor/org-onboarding");
} else {
  navigate("/instructor/onboarding");
}
```

This ensures that any instructor with `onboarded = true` (like the Genetics Professor) always reaches the dashboard, even if their `org_id` is null. New instructors who haven't completed onboarding will still be routed through the setup flow.

### Files Modified
- `src/pages/InstructorAuth.tsx` -- update redirect logic in 3 locations

