// Splits an uploaded worksheet into numbered items and fills in missing
// answers/choices so "send question N" can dispatch them instantly in class.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callClaude } from "../_shared/anthropic.ts";
import { GEMINI_FLASH } from "../_shared/models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BANNED = /^(none of the above|all of the above|not specified|both a and b)$/i;

interface RawItem {
  number: number;
  part?: string;
  prompt: string;
  question_type: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  ai_filled?: boolean;
}

const TOOL = {
  type: "function",
  function: {
    name: "save_worksheet",
    description: "Return whether the text is a worksheet and its numbered items.",
    parameters: {
      type: "object",
      properties: {
        is_worksheet: { type: "boolean" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              number: { type: "integer" },
              part: { type: "string", description: "Sub-part letter like 'a', or empty" },
              prompt: { type: "string" },
              question_type: { type: "string", enum: ["multiple_choice", "short_answer"] },
              options: { type: "array", items: { type: "string" } },
              correct_answer: { type: "string" },
              explanation: { type: "string" },
              ai_filled: { type: "boolean", description: "true if you wrote the answer or choices yourself" },
            },
            required: ["number", "prompt", "question_type", "correct_answer"],
          },
        },
      },
      required: ["is_worksheet", "items"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.slice(7));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const materialId = typeof body.materialId === "string" ? body.materialId : "";
    const force = body.force === true; // instructor flipped the toggle on
    if (!/^[0-9a-f-]{36}$/i.test(materialId)) return json({ error: "materialId is required" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: material } = await admin
      .from("lecture_materials")
      .select("id, instructor_id, course_id, title, parsed_text, is_worksheet")
      .eq("id", materialId)
      .maybeSingle();
    if (!material || material.instructor_id !== userId) return json({ error: "Not found" }, 404);
    if (material.is_worksheet === false && !force) return json({ is_worksheet: false, items: 0 });
    const text = (material.parsed_text as string | null) ?? "";
    if (text.length < 30) return json({ is_worksheet: false, items: 0, reason: "no_text" });

    const res = await callClaude({
      model: GEMINI_FLASH,
      reasoning_effort: "medium",
      messages: [
        {
          role: "system",
          content:
            "You split classroom worksheets into numbered questions. " +
            (force
              ? "The instructor confirmed this IS a worksheet; set is_worksheet true. "
              : "Set is_worksheet true only if the text contains numbered questions/problems for students; lecture notes or slides are false. ") +
            "Keep the original numbering; sub-parts (a, b, c) become separate items with the same number. " +
            "Keep the prompt wording as written. Use plain Unicode math (x², √), never LaTeX. " +
            "If the worksheet gives choices, keep them and use multiple_choice. If it has no choices, write 4 realistic choices " +
            "(one correct, three plausible misconceptions; never 'None of the above', 'All of the above' or 'Not specified') and set ai_filled true. " +
            "Use short_answer only for open-ended prompts (explain, describe, prove) and give a model answer. " +
            "correct_answer must exactly equal one of the options for multiple_choice. Give a one-sentence explanation.",
        },
        { role: "user", content: `Title: ${material.title ?? ""}\n\n${text}` },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "save_worksheet" } },
    });
    if (!res.ok) return json({ error: "AI request failed" }, res.status === 429 || res.status === 402 ? res.status : 502);
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = typeof args === "string" ? JSON.parse(args) : args;
    const isWorksheet = force || parsed?.is_worksheet === true;
    const rawItems: RawItem[] = Array.isArray(parsed?.items) ? parsed.items : [];

    const seen = new Set<string>();
    const rows = isWorksheet
      ? rawItems
          .filter((i) => Number.isInteger(i.number) && i.number > 0 && typeof i.prompt === "string" && i.prompt.trim())
          .map((i) => {
            const part = (i.part ?? "").trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
            let options = Array.isArray(i.options) ? i.options.map(String).filter((o) => o.trim() && !BANNED.test(o.trim())) : null;
            let type = i.question_type === "short_answer" ? "short_answer" : "multiple_choice";
            if (type === "multiple_choice" && (!options || options.length < 2 || !options.includes(i.correct_answer ?? ""))) {
              type = "short_answer";
              options = null;
            }
            return {
              material_id: material.id,
              course_id: material.course_id,
              instructor_id: userId,
              number: i.number,
              part,
              prompt: i.prompt.trim(),
              question_type: type,
              options: type === "multiple_choice" ? options : null,
              correct_answer: i.correct_answer ?? null,
              explanation: i.explanation ?? null,
              ai_filled: i.ai_filled === true,
            };
          })
          .filter((r) => {
            const k = `${r.number}-${r.part}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
      : [];

    // Replace AI rows but keep items the instructor edited.
    const { data: edited } = await admin
      .from("worksheet_items").select("number, part").eq("material_id", material.id).eq("edited", true);
    const keep = new Set((edited ?? []).map((e) => `${e.number}-${e.part}`));
    await admin.from("worksheet_items").delete().eq("material_id", material.id).eq("edited", false);
    const toInsert = rows.filter((r) => !keep.has(`${r.number}-${r.part}`));
    if (toInsert.length) {
      const { error } = await admin.from("worksheet_items").insert(toInsert);
      if (error) console.error("insert worksheet_items", error);
    }
    await admin.from("lecture_materials").update({ is_worksheet: isWorksheet && rows.length > 0 }).eq("id", material.id);
    console.log(`📝 worksheet ${material.id}: is=${isWorksheet} items=${rows.length}`);
    return json({ is_worksheet: isWorksheet && rows.length > 0, items: rows.length });
  } catch (e) {
    console.error("extract-worksheet error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
