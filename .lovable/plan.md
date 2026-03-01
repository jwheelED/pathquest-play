
Goal: fix the persistent “Failed to send a request to the Edge Function” error for file uploads.

What I found from logs and code
1. The current runtime error is not a generic network issue; it is a hard crash in the Edge Function runtime:
   - `[unenv] fs.readFile is not implemented yet!`
   - Stack trace references `@smithy/shared-ini-file-loader` and `@smithy/node-config-provider`.
2. That stack trace is specific to AWS SDK-for-Node dependency resolution, which means the deployed function is still executing an old AWS SDK-based bundle.
3. The repository code for `supabase/functions/upload-to-cloudinary/index.ts` is now the manual AWS Signature V4 + fetch implementation (no `@aws-sdk/client-s3` imports), so code and deployed runtime are out of sync.
4. A direct function call currently returns `502 Bad Gateway`, consistent with boot-time/runtime crash before normal request handling.

Root cause
- The deployed `upload-to-cloudinary` function version is stale (or deployment did not switch active version), so Supabase is still running the previous AWS SDK-based code path that is incompatible with Deno Edge runtime.

Fix plan (implementation sequence)
1. Confirm deployment mismatch before changing behavior
   - Trigger one controlled request to `/upload-to-cloudinary`.
   - Capture fresh logs timestamp to confirm crash still points to `@smithy/*`.
   - This establishes a known baseline and avoids chasing secondary issues.

2. Stabilize function source for deployment
   - Keep the fetch-based R2 uploader as the canonical implementation.
   - Remove the unused `HmacSha256` import to reduce any unnecessary module load surface.
   - Add structured error logs around:
     - secret presence checks,
     - signed request creation,
     - R2 response status/body.
   - Preserve CORS behavior and response schema so existing frontend calls remain unchanged.

3. Force function runtime refresh
   - Explicitly deploy `upload-to-cloudinary` (do not rely on implicit auto-sync in this recovery case).
   - If stale bundle persists, perform a hard reset:
     - delete deployed function,
     - redeploy from current source.
   - Rationale: this clears stuck deployment/version state and guarantees the active artifact matches repo code.

4. Validate edge behavior outside UI
   - Call function directly and verify:
     - no boot-time `@smithy/*` errors,
     - function returns expected JSON error for missing file instead of 502 crash,
     - OPTIONS preflight responds with correct CORS headers.

5. Validate end-to-end from app UI
   - Test upload path used by:
     - `SimplifiedStudyMaterials.tsx`
     - `StudyMaterialUpload.tsx`
     - `QuickUploadSheet.tsx`
   - Confirm network request reaches function and receives JSON response.
   - Confirm DB insert and post-upload question generation still trigger.

6. Add guardrails for faster future diagnosis
   - Improve frontend toast for function invocation failures to show actionable detail (edge error message/status).
   - Keep function name unchanged (`upload-to-cloudinary`) to avoid refactoring multiple callers, but annotate in code that it now targets R2 to prevent confusion.

Technical notes
- No database schema changes are required.
- No additional secrets are required beyond the R2 secrets already added.
- Expected successful outcome: boot errors disappear, 502 is replaced by normal function responses, and uploads work again.

Acceptance criteria
1. Edge logs for `upload-to-cloudinary` show no `fs.readFile` / `@smithy/*` runtime errors.
2. Direct function call no longer returns 502 due to crash.
3. At least one real file upload from the UI succeeds and returns a valid public R2 URL.
4. Existing upload entry points continue working without client API contract changes.
