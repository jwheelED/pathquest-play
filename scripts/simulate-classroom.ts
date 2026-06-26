/**
 * simulate-classroom.ts — Step 5 (BE-AP-7) load-test harness.
 *
 * Proves whether question delivery (`format-and-send-question`) actually reaches
 * EVERY student at scale, instead of trusting the old "first 10 verified" check.
 * For each cohort size it: seeds N synthetic students, enrolls them, sends one
 * live question, polls `student_assignments` until delivery settles, reports
 * expected-vs-delivered + latency, then cleans everything up.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  This WRITES to the target Supabase project: it creates real auth users,
 *     inserts enrollments, and triggers a real AI question-generation + fan-out
 *     (which may incur Lovable/AI cost). Run it against STAGING, not production,
 *     unless you understand the impact. It cleans up after itself, but a crash
 *     mid-run can leave synthetic `loadtest+...@example.com` users behind.
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
 *   deno run -A scripts/simulate-classroom.ts
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
const POLL_TIMEOUT_MS = parseInt(Deno.env.get("POLL_TIMEOUT_MS") ?? "30000", 10);
const POLL_INTERVAL_MS = 1000;

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

async function sendQuestion(token: string): Promise<{ ms: number; status: number; body: unknown }> {
  const started = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/format-and-send-question`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question_text: "Load test: what is the capital of France",
      suggested_type: "short_answer",
      source: "manual_button",
      course_id: COURSE_ID,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ms: Date.now() - started, status: res.status, body };
}

/** Poll until every seeded student has a fresh assignment, or timeout. */
async function pollDelivery(
  instructorId: string,
  studentIds: string[],
  sinceIso: string,
): Promise<{ delivered: number; missing: string[]; settleMs: number }> {
  const started = Date.now();
  const expected = new Set(studentIds);
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const { data, error } = await admin
      .from("student_assignments")
      .select("student_id")
      .eq("instructor_id", instructorId)
      .eq("assignment_type", "lecture_checkin")
      .gte("created_at", sinceIso)
      .in("student_id", studentIds);
    if (error) throw new Error(`poll failed: ${error.message}`);
    const delivered = new Set((data ?? []).map((r) => r.student_id).filter((id) => expected.has(id)));
    if (delivered.size >= expected.size) {
      return { delivered: delivered.size, missing: [], settleMs: Date.now() - started };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  // Final read after timeout.
  const { data } = await admin
    .from("student_assignments")
    .select("student_id")
    .eq("instructor_id", instructorId)
    .eq("assignment_type", "lecture_checkin")
    .gte("created_at", sinceIso)
    .in("student_id", studentIds);
  const deliveredSet = new Set((data ?? []).map((r) => r.student_id).filter((id) => expected.has(id)));
  const missing = studentIds.filter((id) => !deliveredSet.has(id));
  return { delivered: deliveredSet.size, missing, settleMs: Date.now() - started };
}

async function cleanup(instructorId: string, studentIds: string[]): Promise<void> {
  await admin.from("student_assignments").delete().eq("instructor_id", instructorId).in("student_id", studentIds);
  await admin.from("instructor_students").delete().eq("instructor_id", instructorId).in("student_id", studentIds);
  for (const id of studentIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const instructor = await resolveInstructor();
  console.log(`Instructor: ${instructor.id}  Course: ${COURSE_ID ?? "(none/legacy)"}  Sizes: ${SIZES.join(", ")}\n`);

  const results: Array<{ n: number; delivered: number; missing: number; invokeMs: number; settleMs: number }> = [];

  for (const n of SIZES) {
    console.log(`\n=== Cohort N=${n} ===`);
    let studentIds: string[] = [];
    try {
      console.log(`  seeding ${n} students…`);
      studentIds = await seedStudents(n);
      await enroll(instructor.id, studentIds);

      const sinceIso = new Date(Date.now() - 1000).toISOString();
      console.log(`  sending question…`);
      const send = await sendQuestion(instructor.token);
      console.log(`  invoke: ${send.status} in ${send.ms}ms`, send.status >= 400 ? send.body : "");

      const poll = await pollDelivery(instructor.id, studentIds, sinceIso);
      const ok = poll.missing.length === 0;
      console.log(
        `  ${ok ? "✅" : "❌"} delivered ${poll.delivered}/${n}` +
          (ok ? "" : ` — ${poll.missing.length} MISSING (sample: ${poll.missing.slice(0, 5).join(", ")})`) +
          `  [settle ${poll.settleMs}ms]`,
      );
      results.push({ n, delivered: poll.delivered, missing: poll.missing.length, invokeMs: send.ms, settleMs: poll.settleMs });
    } catch (err) {
      console.error(`  ERROR for N=${n}:`, err instanceof Error ? err.message : err);
    } finally {
      if (studentIds.length) {
        console.log(`  cleaning up ${studentIds.length} students…`);
        await cleanup(instructor.id, studentIds).catch((e) => console.error("  cleanup error:", e));
      }
    }
  }

  console.log(`\n──────── SUMMARY ────────`);
  console.log("N\tdelivered\tmissing\tinvoke(ms)\tsettle(ms)");
  for (const r of results) {
    console.log(`${r.n}\t${r.delivered}\t\t${r.missing}\t${r.invokeMs}\t\t${r.settleMs}`);
  }
  const anyMissing = results.some((r) => r.missing > 0);
  console.log(`\n${anyMissing ? "❌ Tail-of-class delivery FAILURES reproduced." : "✅ 100% delivery across all cohorts."}`);
  Deno.exit(anyMissing ? 1 : 0);
}

main();
