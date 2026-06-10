# Proposed (staged) migrations

SQL in this folder is **staged for review, not yet applied.** It lives here —
not in `supabase/migrations/` — because that folder is marked do-not-edit in
`CLAUDE.md`; your team owns the controlled migration process.

## Why these exist

The admin **Support Workflow** can mask individual student identities and offers
a role-gated "Reveal" action (FERPA §99.31 — legitimate educational interest).
In the app today that gate is **inert**: no role can reveal, and the reveal
"audit log" is per-browser `localStorage`. These migrations supply the two
server-side pieces needed to make it real, **without touching the core
`app_role` enum**:

| File | Adds |
|------|------|
| `20260608_staff_roles_and_reveal_audit.sql` | `staff_role` enum + `user_staff_roles` table (reveal-eligible roles: advisor / instructor_of_record / support_staff), `has_staff_role()` / `has_any_staff_role()` helpers, and the `support_reveal_audit` table — all with RLS mirroring existing conventions. |

The application code already reads these (best-effort) and degrades safely while
they are absent:
- `AdminDashboard.tsx` → `checkSession()` queries `user_staff_roles` to resolve
  `viewerRole`; with no table it resolves to `"admin"` (names stay masked).
- `SupportQueueTable.tsx` → `logReveal()` attempts an insert into
  `support_reveal_audit`, falling back to the local log until the table exists.

So merging the app PR is safe on its own; reveal capability simply stays off
until this migration is applied.

## How to apply (team process)

1. Review the SQL.
2. Move/copy it into `supabase/migrations/` with a CLI-generated timestamp
   (e.g. `supabase migration new staff_roles_and_reveal_audit`, then paste).
3. `supabase db push` (or your normal pipeline) against staging, then prod.
4. Regenerate types: `supabase gen types typescript ...` → refresh
   `src/integrations/supabase/types.ts` (also do-not-edit by hand). Once typed,
   the `as any` casts on `user_staff_roles` / `support_reveal_audit` in the app
   code can be dropped.
5. Grant staff roles to the appropriate users (no end-user INSERT policy on
   `user_staff_roles` is created by default — assignment is an admin action).

## Validation done

Referenced objects were confirmed present on the project
(`get_user_org_id`, `has_role`, `app_role`, `profiles.org_id`); neither
`staff_role` nor `support_reveal_audit` exists yet, so the migration is
non-conflicting. The SQL was **not** executed — nothing has been applied.
