/**
 * simulate-classroom.ts — load test for live question delivery (audit EV-011 / BE-AP-7).
 *
 * For each cohort size it: seeds N synthetic students, enrolls them, publishes
 * QUESTIONS repeated questions, and after each one polls `student_assignments`
 * until delivery settles. It then reconciles EXPECTED deliveries (N × QUESTIONS)
 * against ACTUAL database rows:
 *   - actual < expected  → some students silently missed questions (BE-AP-7)
 *   - actual > expected  → duplicate deliveries (idempotency gap, BE-AP-5)
 * Finally it cleans up every synthetic row it created.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  This WRITES to the target Supabase project: it creates real auth users,
 *     inserts enrollments, and triggers real AI question-generation + fan-out
 *     (which may incur Lovable/AI cost). The fan-out delivers to ALL students
 *     enrolled for the instructor+course — so use a DEDICATED test instructor
 *     and course with no real students, on STAGING. It cleans up after itself,
 *     but a crash mid-run can leave synthetic `loadtest+...@example.com` users.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Run (Deno):
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   INSTRUCTOR_EMAIL=prof@example.com INSTRUCTOR_PASSWORD=... \
 *   # (or instead of email/password: INSTRUCTOR_ACCESS_TOKEN=eyJ...) \
 *   COURSE_ID=<uuid-or-empty> \
 *   SIZES=25,100,200 \
 *   QUESTIONS=5 \
 *   deno run -A scripts/simulate-classroom.ts
 *
 * Exit code is non-zero if any cohort has missing or duplicate deliveries.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = reqEnv("SUPABASE_ANON_KEY");
const COURSE_ID = (Deno.env.get("COURSE_ID") ?? "").trim() || null;
const SIZES = (Deno.env.get("SIZES") ?? "25,100,200")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);
const QUESTIONS = Math.max(1, parseInt(Deno.env.get("QUESTIONS") ?? "5", 10));
const POLL_TIMEOUT_MS = parseInt(Deno.env.get("POLL_TIMEOUT_MS") ?? "30000", 10);
const POLL_INTERVAL_MS = 1000;
// Between repeated sends — lets the prior fan-out settle and avoids hammering AI.
const INTER_QUESTION_MS = parseInt(Deno.env.get("INTER_QUESTION_MS") ?? "1500", 10);

function reqEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    Deno.exit(1);
  }
  return v;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Instructor auth ──────────────────────────────────────────────────────────
async function resolveInstructor(): Promise<{ token: string; id: string }> {
  let token = Deno.env.get("INSTRUCTOR_ACCESS_TOKEN") ?? "";
  if (!token) {
    const email = reqEnv("INSTRUCTOR_EMAIL");
    const password = reqEnv("INSTRUCTOR_PASSWORD");
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      console.error("Instructor sign-in failed:", error?.message);
      Deno.exit(1);
    }
    token = data.session.access_token;
  }
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    console.error("Could not resolve instructor from token:", userErr?.message);
    Deno.exit(1);
  }
  return { token, id: userData.user.id };
}

// ── Synthetic cohort lifecycle ───────────────────────────────────────────────
async function seedStudents(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const email = `loadtest+${crypto.randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: `LoadTest Student ${i}`, load_test: true },
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    ids.push(data.user.id);
  }
  return ids;
}

async function enroll(instructorId: string, studentIds: string[]): Promise<void> {
  // NOTE: adjust columns here if your `instructor_students` schema differs.
  const rows = studentIds.map((student_id) => ({
    instructor_id: instructorId,
    student_id,
    course_id: COURSE_ID,
  }));
  const { error } = await admin.from("instructor_students").insert(rows);
  if (error) throw new Error(`enroll failed: ${error.message}`);
}

async function sendQuestion(token: string, index: number): Promise<{ ms: number; status: number; body: unknown }> {
  const started = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/format-and-send-question`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question_text: `Load test Q${index}: what is the capital of France`,
      suggested_type: "short_answer",
      source: "manual_button",
      course_id: COURSE_ID,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ms: Date.now() - started, status: res.status, body };
}

/**
 * Count lecture_checkin rows created since `sinceIso` for each seeded student.
 * Chunked so neither the `.in(...)` list nor the 1000-row page limit is hit.
 */
async function fetchRowCounts(
  instructorId: string,
  studentIds: string[],
  sinceIso: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(studentIds.map((id) => [id, 0]));
  const chunkSize = Math.max(1, Math.min(100, Math.floor(900 / QUESTIONS)));
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("student_assignments")
      .select("student_id")
      .eq("instructor_id", instructorId)
      .eq("assignment_type", "lecture_checkin")
      .gte("created_at", sinceIso)
      .in("student_id", chunk);
    if (error) throw new Error(`count query failed: ${error.message}`);
    for (const r of data ?? []) counts.set(r.student_id, (counts.get(r.student_id) ?? 0) + 1);
  }
  return counts;
}

/** Poll until every seeded student has at least `minPerStudent` rows, or timeout. */
async function pollUntil(
  instructorId: string,
  studentIds: string[],
  sinceIso: string,
  minPerStudent: number,
): Promise<{ settleMs: number; counts: Map<string, number> }> {
  const start = Date.now();
  let counts = await fetchRowCounts(instructorId, studentIds, sinceIso);
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    if (Math.min(...counts.values()) >= minPerStudent) {
      return { settleMs: Date.now() - start, counts };
    }
    await sleep(POLL_INTERVAL_MS);
    counts = await fetchRowCounts(instructorId, studentIds, sinceIso);
  }
  return { settleMs: Date.now() - start, counts };
}

async function cleanup(instructorId: string, studentIds: string[]): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize);
    await admin.from("student_assignments").delete().eq("instructor_id", instructorId).in("student_id", chunk);
    await admin.from("instructor_students").delete().eq("instructor_id", instructorId).in("student_id", chunk);
  }
  for (const id of studentIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

interface CohortResult {
  n: number;
  expected: number;
  actual: number;
  missing: number;
  duplicates: number;
  studentsShort: number;
  studentsDup: number;
  invokeAvgMs: number;
  settleMaxMs: number;
}

async function runCohort(instructor: { token: string; id: string }, n: number): Promise<CohortResult | null> {
  console.log(`\n=== Cohort N=${n} · ${QUESTIONS} questions ===`);
  let studentIds: string[] = [];
  try {
    console.log(`  seeding ${n} students…`);
    studentIds = await seedStudents(n);
    await enroll(instructor.id, studentIds);

    const cohortStart = new Date(Date.now() - 1000).toISOString();
    const invokeMs: number[] = [];
    let settleMaxMs = 0;

    for (let k = 1; k <= QUESTIONS; k++) {
      const send = await sendQuestion(instructor.token, k);
      invokeMs.push(send.ms);
      if (send.status >= 400) {
        console.log(`  Q${k}: invoke ${send.status} in ${send.ms}ms`, send.body);
      }
      // Wait until every student has at least k rows (i.e. received question k).
      const { settleMs, counts } = await pollUntil(instructor.id, studentIds, cohortStart, k);
      settleMaxMs = Math.max(settleMaxMs, settleMs);
      const received = [...counts.values()].filter((c) => c >= k).length;
      const ok = received === n;
      console.log(
        `  Q${k}: invoke ${send.ms}ms · settle ${settleMs}ms · ` +
          `${ok ? "✅" : "⚠️"} ${received}/${n} students have ≥${k} rows`,
      );
      if (k < QUESTIONS) await sleep(INTER_QUESTION_MS);
    }

    // Final reconciliation: expected N×QUESTIONS rows; compare to actual.
    const counts = await fetchRowCounts(instructor.id, studentIds, cohortStart);
    const expected = n * QUESTIONS;
    let actual = 0;
    let missing = 0;
    let duplicates = 0;
    let studentsShort = 0;
    let studentsDup = 0;
    const shortSample: string[] = [];
    for (const [id, c] of counts) {
      actual += c;
      if (c < QUESTIONS) {
        missing += QUESTIONS - c;
        studentsShort++;
        if (shortSample.length < 5) shortSample.push(`${id}:${c}`);
      } else if (c > QUESTIONS) {
        duplicates += c - QUESTIONS;
        studentsDup++;
      }
    }

    const clean = missing === 0 && duplicates === 0;
    console.log(
      `  ${clean ? "✅" : "❌"} expected ${expected} rows, got ${actual} ` +
        `(missing ${missing}, duplicate ${duplicates})` +
        (studentsShort ? ` · short students: ${shortSample.join(", ")}` : ""),
    );

    return {
      n, expected, actual, missing, duplicates, studentsShort, studentsDup,
      invokeAvgMs: Math.round(invokeMs.reduce((a, b) => a + b, 0) / invokeMs.length),
      settleMaxMs,
    };
  } catch (err) {
    console.error(`  ERROR for N=${n}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (studentIds.length) {
      console.log(`  cleaning up ${studentIds.length} students…`);
      await cleanup(instructor.id, studentIds).catch((e) => console.error("  cleanup error:", e));
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const instructor = await resolveInstructor();
  console.log(
    `Instructor: ${instructor.id}  Course: ${COURSE_ID ?? "(none/legacy)"}  ` +
      `Sizes: ${SIZES.join(", ")}  Questions/cohort: ${QUESTIONS}`,
  );

  const results: CohortResult[] = [];
  for (const n of SIZES) {
    const r = await runCohort(instructor, n);
    if (r) results.push(r);
  }

  console.log(`\n──────── SUMMARY (expected = N × ${QUESTIONS} questions) ────────`);
  console.log("N\texpected\tactual\tmissing\tduplicate\tinvoke~ms\tsettle_max_ms");
  for (const r of results) {
    console.log(
      `${r.n}\t${r.expected}\t\t${r.actual}\t${r.missing}\t${r.duplicates}\t\t${r.invokeAvgMs}\t\t${r.settleMaxMs}`,
    );
  }

  const anyMissing = results.some((r) => r.missing > 0);
  const anyDup = results.some((r) => r.duplicates > 0);
  if (anyMissing) console.log("\n❌ Tail-of-class delivery FAILURES reproduced (missing rows).");
  if (anyDup) console.log("❌ DUPLICATE deliveries detected (idempotency gap — BE-AP-5).");
  if (!anyMissing && !anyDup) console.log("\n✅ Exactly-once delivery across all cohorts.");
  Deno.exit(anyMissing || anyDup ? 1 : 0);
}

main();
