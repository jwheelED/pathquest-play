import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callClaude } from "../_shared/anthropic.ts";
import { GEMINI_FLASH_LITE, GROQ_LLAMA_FAST } from "../_shared/models.ts";
import { buildScanMessages, parseJsonText, parseScanResult, SCAN_TOOL, type ScanFormat } from "./scanner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FORMATS: ScanFormat[] = ["multiple_choice", "short_answer", "poll", "coding"];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq normally answers in well under a second; if it stalls, Gemini takes over.
const GROQ_TIMEOUT_MS = 2500;

type Msg = { role: "system" | "user"; content: string };

/** Llama 3.1 8B on Groq in JSON mode. Returns parsed output, or null to fall back. */
async function scanWithGroq(messages: Msg[]): Promise<{ parsed: unknown } | { failed: string }> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return { failed: "no_key" };
  const schema = JSON.stringify(SCAN_TOOL.function.parameters);
  const jsonMessages = messages.map((m, i) =>
    i === 0
      ? { ...m, content: `${m.content.replace(/Call report_question with detected:false if no question was asked\./, "")}\nRespond with ONLY a JSON object (no markdown) matching this schema: ${schema}\nUse {"detected": false} if no question was asked.` }
      : m,
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GROQ_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_LLAMA_FAST,
        messages: jsonMessages,
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[scan-transcript-questions] Groq status ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { failed: `groq_${res.status}` };
    }
    const data = await res.json();
    const parsed = parseJsonText(data?.choices?.[0]?.message?.content);
    return parsed ? { parsed } : { failed: "groq_bad_json" };
  } catch (err) {
    const reason = err instanceof DOMException && err.name === "AbortError" ? "groq_timeout" : "groq_error";
    console.warn(`[scan-transcript-questions] ${reason}`);
    return { failed: reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback: fastest Gemini on the Lovable AI Gateway, no thinking. */
async function scanWithGemini(messages: Msg[]): Promise<{ parsed: unknown } | { failed: string; status: number }> {
  const res = await callClaude({
    model: GEMINI_FLASH_LITE,
    messages,
    tools: [SCAN_TOOL],
    tool_choice: { type: "function", function: { name: "report_question" } },
  });
  if (!res.ok) {
    return { failed: res.status === 429 ? "rate_limited" : res.status === 402 ? "credits" : "ai_error", status: res.status };
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = typeof args === "string" ? parseJsonText(args) : args ?? null;
  return { parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: isInstructor } = await admin.rpc("has_role", { _user_id: userId, _role: "instructor" });
    if (!isInstructor) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const newText = typeof body?.newText === "string" ? body.newText.trim().slice(0, 2000) : "";
    const contextText = typeof body?.contextText === "string" ? body.contextText.slice(-4000) : "";
    const recentlySent = Array.isArray(body?.recentlySent)
      ? body.recentlySent.filter((s: unknown) => typeof s === "string").slice(0, 5).map((s: string) => s.slice(0, 300))
      : [];
    const formatPreference = FORMATS.includes(body?.formatPreference) ? (body.formatPreference as ScanFormat) : null;
    if (newText.split(/\s+/).filter(Boolean).length < 2) return json({ detected: false, reason: "too_short" });

    const messages = buildScanMessages({ contextText, newText, recentlySent, formatPreference, courseType: body?.courseType ?? null });

    let provider = "groq";
    let out: { parsed: unknown } | { failed: string; status?: number } = await scanWithGroq(messages);
    if ("failed" in out) {
      const groqReason = out.failed;
      provider = "gemini";
      out = await scanWithGemini(messages);
      if (groqReason !== "no_key") console.log(`[scan-transcript-questions] fell back to Gemini (${groqReason})`);
    }

    if ("failed" in out) {
      console.warn(`[scan-transcript-questions] AI failed: ${out.failed}`);
      return json({ detected: false, reason: out.failed, failed: true, provider });
    }
    const result = parseScanResult(out.parsed, formatPreference);
    const latencyMs = Date.now() - started;
    console.log(`[scan-transcript-questions] ${provider} ${latencyMs}ms detected=${result.detected}`);
    return json({ ...result, provider, latencyMs });
  } catch (err) {
    console.error("[scan-transcript-questions] error", err);
    return json({ detected: false, reason: "internal", failed: true });
  }
});
