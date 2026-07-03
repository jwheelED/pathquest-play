# Edvana audit — current-state dispositions (EV-000)

Reconciles the Designli **Edvana Technical Assessment (May 2026)** backlog
(EV-000…EV-027) against what is actually in `main` today. Maintained as the
version-controlled companion to `Edvana_Engineering_Backlog.xlsm`.

## Provenance
- **Source audit:** Designli, *Edvana Technical Assessment*, May 2026 — **static
  analysis only, no dynamic testing**. The source does not state the exact
  reviewed commit. _(Action: record the reviewed SHA + production Supabase
  project id once confirmed with Designli / from history.)_
- **Pre-remediation `main`:** `39836dd`
- **Current `main` (after PR #71):** `04eec48`
- **Remediation commits (PR #71):** `0357e3e` (Step 2 detection), `e990f15`
  (Step 4 session creation), `43bbda4` (Step 5 delivery verification),
  `54fab16` (Step 6 join protection), `a102c50` (Step 7 logging). Step 1 (DB
  baseline) landed earlier on `main` (`f2d5782`, `5d90323`, `76972a9`).

## Read this before trusting a "Done"
Per the CTO Handoff framework, **Done = merged code _plus_ linked evidence.**
Important caveats that apply to every "Done" below:
- **Merged ≠ deployed.** The edge-function changes (Steps 4–7) are not live until
  someone runs `supabase functions deploy` for `format-and-send-question`,
  `join-live-session`, `create-live-session` (+ the new `_shared/*` modules).
- **`SENTRY_DSN` is unset**, so edge-function Sentry alerting is currently a
  no-op (structured `console.error`/JSON logs still fire).
- **No item is dynamically validated yet** — every row in the audit Validation
  Matrix is still *Not Run*. "Done" here means "code merged," not "proven in a
  classroom test."

## Disposition table

| EV | Item | Priority | Status | Evidence | Dynamic validation |
|----|------|----------|--------|----------|--------------------|
| EV-000 | Audit provenance & current-state diff | P0 | **In progress** | this file | n/a (doc) |
| EV-001 | Verified backups + restore drill | P0 | **Partial** | backups exported in Step 1 (`76972a9`); **restore drill not performed** | Not Run |
| EV-002 | Baseline DB into migrations | P0 | **Done** | Step 1 baseline migration on `main` | Not Run (fresh-rebuild proof pending) |
| EV-003 | Remove literal `?` gate | P0 | **Done** | `0357e3e` — `_shared/questionDetection.ts`, hook; unit tests | Not Run (corpus replay pending) |
| EV-004 | Flatten confidence filters + telemetry | P0 | **Partial** | telemetry `trackQuestionDetectionDrop` (`0357e3e`); **thresholds not consolidated to one place / not replay-tuned** | Not Run |
| EV-005 | live_responses = source of truth | P0 | **Done** | pre-existing `LiveSessionResults.tsx` + `LiveResponsesEmpty.tsx` | Not Run (reconciliation test pending) |
| EV-006 | Capture `user_id` on live_participants | P0 | **Not Started** | — | Not Run |
| EV-007 | Exactly-once live response | P0 | **Partial** | DB unique constraint `live_responses_question_participant_unique` already in baseline; **`submit-live-response` still SELECT-then-INSERT, no dup cleanup** | Not Run |
| EV-008 | One session-creation path | P0 | **Done** | `e990f15` — `create-live-session` optional args + `InstructorDashboard` routed through it; `as any` removed | Not Run |
| EV-009 | Idempotency for question delivery | P0 | **Not Started** | idempotency_key still in `content` JSON, no unique index | Not Run |
| EV-010 | Verify whole class + retry | P0 | **Partial** | `43bbda4` — full-cohort `summarizeDelivery`, verified counts, partial_failure alert; **durable retry / DLQ not built** | Not Run |
| EV-011 | Load/reconnect/failure harness | P0 | **Partial** | `scripts/simulate-classroom.ts` (deliver/count/latency); **no reconnect/late-join/dup-tap/AI-failure; not run; not a CI job** | Not Run |
| EV-012 | Characterization tests + CI gate | P0 | **Done\*** | CI gate `.github/workflows/ci.yml` + characterization tests for `join-live-session` / `create-live-session` / `submit-live-response` (handlers extracted behind thin shells; `supabase/functions/__tests__/`, 180 tests total). **\*Enable branch protection** on `main` to make the gate actually block merge | Not Run |
| EV-013 | Join rate-limit / cap / identity | P1 | **Done** | `54fab16` — `join-live-session` + `_shared/joinRateLimit.ts`; unit tests | Not Run (stress test pending) |
| EV-014 | Structured logging + correlation | P1 | **Done** | `a102c50` — `_shared/log.ts` + `join-live-session`, `format-and-send-question`; broad 33-fn rollout pending | Not Run |
| EV-015 | Incremental realtime, polling fallback | P1 | **Not Started** | — | Not Run |
| EV-016 | Pin one Supabase SDK version | P1 | **Not Started** | no `deno.json` / import map; mixed specifiers remain | Not Run |
| EV-017 | Graceful AI degradation + provider boundary | P1 | **Not Started** | — | Not Run |
| EV-018 | Trustworthy usage records | P1 | **Not Started** | `usage_records` still unwritten | Not Run |
| EV-019 | Verify RLS on live tables | P1 | **Not Started** | — | Not Run |
| EV-020 | Incident runbook + alert policy | P1 | **Not Started** | — | n/a (doc) |
| EV-021 | Refactor `format-and-send-question` | P2 | **Not Started** (deferred until EV-009/010/012) | — | Not Run |
| EV-022 | Restore type safety, no-explicit-any | P2 | **Not Started** | 3 known type errors remain; `any` cleanup not started | Not Run |
| EV-023 | Bundle waste / dead routes / backend | P2 | **Partial** | `backend/` FastAPI boilerplate already absent (BE-AP-10 resolved); **lazy-loading + dead route removal not done** | Not Run |
| EV-024 | Offline submission detection | P2 | **Not Started** | — | Not Run |
| EV-025 | In-flow question-format toggle + UX | P2 | **Not Started** | — | Not Run |
| EV-026 | Billing automation (after metering) | P2 | **Not Started** | — | Not Run |
| EV-027 | Observability IDs → env | P3 | **Partial** | edge `SENTRY_DSN` is env-based; **frontend `src/main.tsx` still hardcodes PostHog key + Sentry DSN** | Not Run |

## Next-step recommendation (sequenced)
1. **Finish EV-012** — enable branch protection on `main`; add edge-function
   characterization tests.
2. **EV-009** delivery idempotency (indexed column + unique constraint + upsert),
   then complete **EV-010** durable retry.
3. **EV-001** restore drill; **EV-006** user_id bridge; **EV-007** ON CONFLICT.
4. **EV-019** RLS verification (security before paid pilot), **EV-017** AI
   fallback, **EV-018** usage metering, **EV-020** runbook.

Deferred until P0 passes: EV-021, EV-022, EV-023, EV-024, EV-025, EV-026.
