import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callClaude } from "../_shared/anthropic.ts";
import { GEMINI_FLASH } from "../_shared/models.ts";
import { buildThemes, shouldRegroup, MAX_ANSWERS, type AnswerRow } from "./themes.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Invalid token" }, 401);

    const body = await req.json().catch(() => null) as { questionId?: unknown } | null;
    const questionId = typeof body?.questionId === "string" && UUID.test(body.questionId) ? body.questionId : null;
    if (!questionId) return json({ error: "questionId is required" }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: q } = await db.from("live_questions")
      .select("id, session_id, question_content, live_sessions!inner(instructor_id)")
      .eq("id", questionId).single();
    const owner = (q as { live_sessions?: { instructor_id?: string } } | null)?.live_sessions?.instructor_id;
    if (!q || owner !== user.id) return json({ error: "Not found" }, 404);
    const content = (q.question_content ?? {}) as { ungraded?: boolean; question?: string; questions?: Array<{ question?: string }> };
    if (!content.ungraded) return json({ error: "Question is graded" }, 400);

    const { data: responses } = await db.from("live_responses")
      .select("id, answer").eq("question_id", questionId)
      .order("created_at", { ascending: true }).limit(MAX_ANSWERS);
    const rows: AnswerRow[] = (responses ?? [])
      .map((r: { id: string; answer: unknown }) => ({ id: r.id, answer: String(r.answer ?? "").trim() }))
      .filter((r) => r.answer);

    const { data: stored } = await db.from("live_question_themes")
      .select("response_count, updated_at, themes").eq("question_id", questionId).maybeSingle();
    if (!shouldRegroup(stored, rows.length)) {
      return json({ themes: stored?.themes ?? [], responseCount: stored?.response_count ?? rows.length, skipped: true });
    }

    const questionText = content.questions?.[0]?.question || content.question || "";
    const numbered = rows.map((r, i) => `${i + 1}. ${r.answer.slice(0, 400)}`).join("\n");
    const res = await callClaude({
      model: GEMINI_FLASH,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You group student short answers into 3-6 themes like a poll summary for an instructor. Theme labels are short (2-6 words), neutral and descriptive of the idea, e.g. 'Mentions photosynthesis' or 'Confuses mass and weight'. Never grade. Use plain text, no LaTeX. Each answer belongs to at most one theme. Reply in JSON: {\"themes\":[{\"label\":string,\"answer_numbers\":number[]}]}",
        },
        { role: "user", content: `Question: ${questionText}\n\nAnswers:\n${numbered}` },
      ],
    } as Parameters<typeof callClaude>[0]);
    if (!res.ok) {
      console.error("group-live-answers ai error", res.status, await res.text());
      return json({ themes: stored?.themes ?? [], responseCount: stored?.response_count ?? 0, error: "grouping_failed" }, res.status === 402 || res.status === 429 ? res.status : 502);
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    let parsed: unknown = null;
    try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* falls to Other */ }
    const themes = buildThemes(parsed, rows);

    await db.from("live_question_themes").upsert(
      { question_id: questionId, session_id: q.session_id, themes, response_count: rows.length },
      { onConflict: "question_id" },
    );
    console.log(JSON.stringify({ evt: "themes.grouped", questionId, answers: rows.length, themes: themes.length }));
    return json({ themes, responseCount: rows.length });
  } catch (e) {
    console.error("group-live-answers failed", e);
    return json({ error: "Internal error" }, 500);
  }
});
