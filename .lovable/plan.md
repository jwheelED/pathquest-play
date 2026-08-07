# Instructor signup bouncing to student login

Yes — the bug is real, but only on one path: **"Continue with Google" on the instructor portal.** Email/password instructor signup works correctly (verified: recent instructor signups all have the `instructor` role and land on onboarding).

## What actually happens on Google signup

1. The instructor page calls Google sign-in with `queryParams: { role: 'instructor' }`. That value goes to Google, **not** into Supabase user metadata.
2. The signup trigger reads `raw_user_meta_data->>'role'`, finds nothing, and defaults the new account to **student**.
3. Back on `/instructor/auth`, the page looks for an instructor role, finds none, and falls into the rescue branch that re-assigns the instructor role — but that branch only runs if `?code=` is still in the URL. The Supabase client strips the code from the URL as soon as it exchanges it, so the rescue almost never fires.
4. Fallback runs instead: sign out + redirect to `/auth` (the student sign-in) with "This account isn't registered as an instructor."
5. Because the account is now permanently stored as a student, every later attempt repeats step 4 — matching "it continually reroutes me."

The same flaw exists on the admin portal's Google button (`/admin/auth`), so admins signing up with Google get bounced the same way.

## Fix

**1. Carry the intent through the OAuth round-trip**
Before redirecting to Google, record the intended role (e.g. `sessionStorage` key set on the instructor and admin auth pages, cleared after use). Remove the misleading `queryParams: { role }`.

**2. Rescue based on intent, not URL contents**
In the post-sign-in handler on `/instructor/auth` and `/admin/auth`: when the signed-in user has no matching role, check the stored intent plus "account created within the last few minutes" instead of requiring `?code=` in the URL. If the intent matches, call the existing `assign_oauth_role` RPC, then continue to onboarding.

**3. Recover already-broken accounts**
Any user who lands on the instructor portal, has only a `student` role, has never enrolled in a class, and shows an OAuth (Google) identity is a victim of this bug. For those, prompt "Convert this account to an instructor account?" rather than silently signing them out. Only sign out and redirect when there is genuine student activity on the account.

**4. Make the bounce message honest**
When redirecting a real student away from the instructor portal, keep them signed in and send them to `/dashboard` instead of signing them out to `/auth`.

## Technical notes

- Files: `src/pages/InstructorAuth.tsx` (OAuth button ~line 488, role check ~lines 88–140), `src/pages/AdminAuth.tsx` (same two spots), `src/pages/Auth.tsx` (student OAuth button — leave behavior, but it should also stop setting an unused `role` query param).
- No schema change required: `assign_oauth_role(p_user_id, p_role)` and `handle_new_user()` already exist and work; only the client-side intent plumbing is broken.
- No data backfill is proposed — existing mis-roled accounts get fixed in-app via step 3 on their next sign-in attempt.
