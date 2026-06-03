# Fix admin ↔ instructor sync

The dashboard currently asks "which instructors are mine?" via the `admin_instructors` join table keyed on `admin_id = auth.uid()`. That model is wrong for orgs with multiple admins, and the auto-connect trigger that populates it is fragile:

- 3 admins exist in the same org. Even when auto-connect fires, it picks the first admin via `LIMIT 1`, so the other two admins see "0 Instructors".
- For the two accepted invites in question (`geneticsaccount2@gmail.com`, `auburndemo2@gmail.com`), `admin_instructors` has **zero rows** — the trigger ran while `user_roles` for the instructor didn't yet exist (`handle_new_user` inserts the profile before the role row), so `has_role(NEW.id, 'instructor')` returned false and the trigger short-circuited. The invite was still marked `accepted` later (via `PendingOrgInvites`), but its admin-loop also only inserts for one admin.

Both instructor profiles have `org_id` correctly set to the org, so org-level joins are the source of truth — `admin_instructors` is redundant for "is this instructor in my org?".

## Changes

### 1. Dashboard: query instructors by org, not by `admin_instructors`

In `src/pages/AdminDashboard.tsx` (`fetchDashboardData`):
- Replace the `admin_instructors` lookup with: all profiles where `org_id = userOrgId` AND `user_roles.role = 'instructor'`. Implementation: fetch instructor user_ids from `user_roles` joined to `profiles.org_id`, or two queries (`profiles` by `org_id`, then filter by `user_roles.role='instructor'`).
- Everything downstream (`instructor_students`, `student_assignments`, `user_stats`) already keys off `instructorIds` / `userOrgId`, so it inherits the fix automatically.
- Students follow: `instructor_students` is already queried `.in('instructor_id', fetchedInstructorIds).eq('org_id', userOrgId)`, so once instructors resolve, their students resolve too.

### 2. Backfill `admin_instructors` for the existing org

One-time data fix so any other code path still keyed off `admin_instructors` (e.g., admin invite flow internals) is consistent: for every (admin, instructor) pair within the same org, insert a row if missing.

```sql
INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
SELECT a.id, i.id, a.org_id
FROM profiles a
JOIN user_roles ar ON ar.user_id = a.id AND ar.role = 'admin'
JOIN profiles i ON i.org_id = a.org_id AND i.id <> a.id
JOIN user_roles ir ON ir.user_id = i.id AND ir.role = 'instructor'
WHERE a.org_id IS NOT NULL
ON CONFLICT (admin_id, instructor_id) DO NOTHING;
```

### 3. Make future connections fan out to all admins

Update `auto_connect_instructor_to_org` (trigger fn) and `auto_connect_on_seat_allocation` so they `INSERT … SELECT` one row per admin in the org, instead of `LIMIT 1`. Same for the manual `PendingOrgInvites.tsx` accept path — loop over every admin in the org. Removes the "first admin wins" bug for future invites.

Also tighten the trigger guard: `has_role` may be false at profile-INSERT time. Re-check on UPDATE by also accepting cases where `NEW.org_id IS NOT NULL` but `admin_instructors` has no row yet, and bind admin rows then.

## Out of scope

- Larger admin dashboard IA / terminology pass (already flagged from the previous turn).
- Re-architecting away `admin_instructors` — keep the table, just stop using it as the primary "which instructors do I see?" filter.

## Files

- `src/pages/AdminDashboard.tsx` — replace `admin_instructors` lookup with org-scoped instructor query.
- `src/components/instructor/PendingOrgInvites.tsx` — loop all admins on accept.
- New migration — backfill `admin_instructors`; update `auto_connect_instructor_to_org` and `auto_connect_on_seat_allocation` to fan out across all admins.
