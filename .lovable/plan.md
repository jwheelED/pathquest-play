## Problem

`AdminDashboard.fetchDashboardData` uses:

```ts
supabase.from("user_roles")
  .select("user_id, profiles!inner(org_id)")
  .eq("role","instructor")
  .eq("profiles.org_id", userOrgId)
```

There is no foreign key from `user_roles.user_id` to `public.profiles.id` (only to `auth.users`), so PostgREST cannot resolve the `profiles!inner` embed. The query returns no rows, leaving `instructorIds = []`. Result: "No instructors connected yet", 0 Students, 0% Avg — even though the database has 38 instructors with `org_id` matching the admin's org.

## Fix (single file: `src/pages/AdminDashboard.tsx`)

Replace the broken embed with two separate, FK-safe queries and intersect them:

1. Fetch all profile ids in the org:
   ```ts
   const { data: orgProfiles } = await supabase
     .from("profiles")
     .select("id")
     .eq("org_id", userOrgId);
   const orgProfileIds = (orgProfiles ?? []).map(p => p.id);
   ```
2. Of those, keep only the ones with the `instructor` role:
   ```ts
   const { data: instructorRoleRows } = await supabase
     .from("user_roles")
     .select("user_id")
     .eq("role", "instructor")
     .in("user_id", orgProfileIds);
   const fetchedInstructorIds = [...new Set((instructorRoleRows ?? []).map(r => r.user_id))];
   ```
3. Keep the rest of the function unchanged (instructor profile names, `instructor_students` lookup, etc.).

This restores parity with the prior working state and stays consistent with how the `Sync Now` RPC already backfills `profiles.org_id` for instructors and students. No DB migration is needed because the underlying data is already populated correctly (verified: 38 instructors have `org_id` set, matching the earlier "38 Instructors / 139 Students" screenshot).

## Out of scope
- Filter bar, smart presets, saved views — unaffected; they continue to consume the corrected `instructorIds`.
- No schema or RLS changes.
