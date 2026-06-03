# Admin Dashboard Org UX Revamp

Two focused fixes around organization identity. No structural redesign of the rest of the admin dashboard in this pass — we can do a broader pass after these land.

## 1. Remove "Slug" from the admin view, add rename UI

Problem: `Slug: default` is meaningless to a dean/chair. Slug is an internal URL-safe identifier, not something an admin should think about.

Changes in `src/components/admin/OrganizationSetup.tsx`:
- Remove the "Slug:" row from the Organization Info card entirely (it stays in the DB, just hidden from the UI).
- Add an inline "Edit" affordance next to the org name (pencil icon → input + Save/Cancel) that lets the admin rename the organization.
- On save: `UPDATE organizations SET name = ... WHERE id = org.id`, then refresh local state and toast. Slug is left untouched — admins never see or edit it.
- Keep the "Create Your Organization" form for first-time setup, but drop the "Organization Slug" input. Auto-generate the slug from the name (`name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`) behind the scenes, with a uniqueness retry suffix if needed.

RLS: there is no current UPDATE policy on `public.organizations`. Add a migration:
```sql
CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') AND id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin') AND id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

GRANT UPDATE (name) ON public.organizations TO authenticated;
```
Only the `name` column is grantable to authenticated — slug stays admin-API/service-role only.

## 2. Fix "Unknown Organization" on instructor invite cards

Problem: `src/components/instructor/PendingOrgInvites.tsx` fetches `instructor_invites` for the user's email, then tries `SELECT id, name FROM organizations WHERE id IN (...)`. The current SELECT grant on `organizations` is column-scoped to `authenticated`, but there is no RLS SELECT policy that lets a not-yet-member instructor read a row by id — so the join returns nothing and we fall back to "Unknown Organization".

Fix with a `SECURITY DEFINER` RPC so we don't have to widen org visibility globally:
```sql
CREATE OR REPLACE FUNCTION public.get_invited_org_names(_email text)
RETURNS TABLE(org_id uuid, org_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name
  FROM instructor_invites i
  JOIN organizations o ON o.id = i.org_id
  WHERE i.email = lower(_email) AND i.status = 'pending';
$$;
GRANT EXECUTE ON FUNCTION public.get_invited_org_names(text) TO authenticated;
```
The RPC only exposes `(org_id, name)` for orgs that actually invited the caller's email — no broader leakage.

In `PendingOrgInvites.tsx`:
- Also filter `instructor_invites` by the caller's email (currently it pulls every pending invite the RLS lets through).
- Replace the `organizations` lookup with `supabase.rpc('get_invited_org_names', { _email: user.email })` and build the name map from that.
- Drop the "Unknown Organization" fallback string; if a name still can't be resolved (shouldn't happen), hide that invite rather than showing a confusing placeholder.

## Out of scope (call out for follow-up)

The broader "make the admin dashboard easier to understand / more important for what an admin wants" pass — reorganizing cards, prioritizing at-risk students / instructor performance / usage trends, terminology cleanup elsewhere — is intentionally not in this plan. After these two fixes ship, I'll come back with a layout/IA proposal for the dashboard itself.

## Files touched

- `src/components/admin/OrganizationSetup.tsx` — remove slug row + slug input, add rename UI, auto-slug on create.
- `src/components/instructor/PendingOrgInvites.tsx` — use RPC, filter by email, drop fallback.
- New migration — `organizations` UPDATE policy + `name`-only grant, `get_invited_org_names` RPC.
