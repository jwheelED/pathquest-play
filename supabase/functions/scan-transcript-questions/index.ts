import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callClaude } from "../_shared/anthropic.ts";
import { GEMINI_FLASH, DEFAULT_REASONING_EFFORT } from "../_shared/models.ts";
import { buildScanMessages, parseScanResult, SCAN_TOOL, type ScanFormat } from "./scanner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FORMATS: ScanFormat[] = ["multiple_choice", "short_answer", "poll", "coding"];

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

    const res = await callClaude({
      model: GEMINI_FLASH,
      reasoning_effort: DEFAULT_REASONING_EFFORT,
      messages: buildScanMessages({ contextText, newText, recentlySent, formatPreference, courseType: body?.courseType ?? null }),
      tools: [SCAN_TOOL],
      tool_choice: { type: "function", function: { name: "report_question" } },
    });

    if (!res.ok) {
      console.warn(`[scan-transcript-questions] AI status ${res.status}`);
      return json({ detected: false, reason: res.status === 429 ? "rate_limited" : res.status === 402 ? "credits" : "ai_error", failed: true });
    }
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: unknown = null;
    try { parsed = typeof args === "string" ? JSON.parse(args) : args; } catch { parsed = null; }
    const result = parseScanResult(parsed, formatPreference);
    console.log(`[scan-transcript-questions] ${Date.now() - started}ms detected=${result.detected}`);
    return json({ ...result, latencyMs: Date.now() - started });
  } catch (err) {
    console.error("[scan-transcript-questions] error", err);
    return json({ detected: false, reason: "internal", failed: true });
  }
});
