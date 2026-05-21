# Critical Paths — Edvana

Load-bearing flows. Any code change touching these files MUST follow the **pre-change checklist** at the bottom of this file.

Tests pinning these invariants live in:
- `src/lib/__tests__/validation.test.ts`
- `src/components/__tests__/ProtectedRoute.test.tsx`

Run before/after editing any auth file: `bun run test:auth`.

---

## 1. Authentication & role assignment

**Files**
- `src/pages/Auth.tsx`, `src/pages/InstructorAuth.tsx`, `src/pages/AdminAuth.tsx`
- `src/components/ProtectedRoute.tsx`
- Postgres trigger `handle_new_user`, RPC `assign_oauth_role`, RPC `has_role`

**Invariants** (each must remain true; tests assert them where possible)

1. Each role (instructor/admin/student) is inserted exactly once per signup. The Postgres trigger and `assign_oauth_role` RPC must not both insert the same role.
2. `onAuthStateChange` listeners must guard against double-resolve. When both `INITIAL_SESSION` (listener) and `getSession()` (fallback) resolve, role-check / navigation runs **once**. Enforced by `hasResolvedRef` in `ProtectedRoute` and the three Auth pages.
3. When `PASSWORD_RECOVERY` fires (or URL hash contains `type=recovery`), no SIGNED_IN navigation may run until the user submits a new password and is signed out. Enforced by `isRecoveryModeRef`.
4. When `handleAuth` is mid-flight (email/password sign-in), the listener must not also navigate. Enforced by `isHandlingAuthRef` / `isSigningInRef` (held until after navigation completes, with a short post-call delay so the async SIGNED_IN event sees the guard as still set).
5. A user signing into the wrong portal (e.g. a student hitting `/instructor/auth`) is signed out and redirected to `/auth`, never stranded on a "Loading…" screen.
6. `Auth.tsx#initializeUser` must only auto-set `onboarded: true` for **student-role** users. Instructors/admins keep their existing `onboarded` state so they aren't bounced past `/instructor/org-onboarding`.
7. Validation schemas in `src/lib/validation.ts` are the single source of truth for sign-up input. UI code must not bypass them.
8. Client-side `user_stats` writes must use `upsert({...}, { onConflict: 'user_id', ignoreDuplicates: true })` — never bare `insert` — because the `handle_new_user` trigger may have already created the row.

## 2. Live session lifecycle
- Files: session creation, join, real-time presence, session end
- Tables: `sessions`, `session_participants`
- **Invariant:** students see instructor state changes within 2 seconds.

## 3. Question pickup & trigger detection
- Hook: `usePassiveQuestionDetection`
- Deepgram interim/final transcript handlers, cooldown logic
- **Invariant:** a question fires once per natural utterance, not on partial chunks.

## 4. Question generation & dispatch
- Edge functions: `generate-mcq-options`, `detect-speaker-questions`
- Frontend: question preview, send-to-students action
- **Invariant:** the question dispatched to students is byte-identical to what the instructor previewed.

## 5. Answer collection & grading
- Student answer submission, grading logic (correct / incorrect / partial), aggregate display
- **Invariant:** every submitted answer is recorded exactly once. No double-submission.

## 6. Transcript persistence
- Deepgram pipeline, `utterances` + `lecture_pause_points` storage
- **Invariant:** no transcript chunks lost on disconnect or session end.

## 7. Billing & tier limits
- Stripe webhooks, usage tracking (teaching hours)
- Tiers: free, Starter, Professional, Department, Institution
- **Invariant:** usage cannot exceed tier limit without an upgrade prompt or hard block.

---

## Pre-change checklist (REQUIRED for any AI/contributor)

Before editing a file listed in any path above, answer in your PR / chat reply:

1. **Which numbered path does this change affect?**
2. **Which invariant could this break?** (cite by number)
3. **Which test covers it?** If none, write the test first, then make the change.
4. **Did you run `bun run test:auth` (or the relevant suite) and confirm it passes?**

## Rules

1. Identify the affected path before writing code.
2. Do not modify code in adjacent paths unless explicitly approved.
3. Changes that touch BOTH a Postgres trigger AND a frontend handler must be paired and reviewed together.
4. After change, list every file modified and why.
5. Any new auth-related ref/guard added to one of the three Auth pages must be mirrored in the other two if applicable.
