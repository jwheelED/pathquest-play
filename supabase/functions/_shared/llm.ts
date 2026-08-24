// Shared LLM client for Edvana Whiteboard Tutor edge functions.
//
// Provider-agnostic OpenAI-compatible Chat Completions wrapper. Works with
// OpenRouter (default) or Moonshot/Kimi, selected purely by which secret is
// set — no code change to switch. All knobs are env-configured:
//
//   OPENROUTER_API_KEY  preferred. When set, calls OpenRouter.
//   MOONSHOT_API_KEY / KIMI_API_KEY  fallback (Moonshot/Kimi).
//   WB_LLM_MODEL        text model id (e.g. an OpenRouter slug). Default openrouter/auto.
//   WB_LLM_VISION_MODEL vision-capable model id. Defaults to WB_LLM_MODEL.
//   WB_LLM_BASE_URL     override the API base entirely.
//   WB_LLM_REFERER / WB_LLM_TITLE  optional OpenRouter attribution headers.

interface Provider {
  key: string;
  baseUrl: string;
  isOpenRouter: boolean;
}

function resolveProvider(): Provider | null {
  const override = Deno.env.get("WB_LLM_BASE_URL");
  const openrouter = Deno.env.get("OPENROUTER_API_KEY");
  if (openrouter) {
    return {
      key: openrouter,
      baseUrl: (override ?? "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      isOpenRouter: true,
    };
  }
  const moonshot = Deno.env.get("MOONSHOT_API_KEY") ?? Deno.env.get("KIMI_API_KEY");
  if (moonshot) {
    return {
      key: moonshot,
      baseUrl: (override ?? "https://api.moonshot.ai/v1").replace(/\/$/, ""),
      isOpenRouter: false,
    };
  }
  return null;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

export interface LlmChatOptions {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

export function textModel(): string {
  return Deno.env.get("WB_LLM_MODEL") ?? "openrouter/auto";
}

export function visionModel(): string {
  return Deno.env.get("WB_LLM_VISION_MODEL") ?? textModel();
}

export function llmConfigured(): boolean {
  return !!resolveProvider();
}

async function post(provider: Provider, body: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.key}`,
  };
  if (provider.isOpenRouter) {
    headers["HTTP-Referer"] = Deno.env.get("WB_LLM_REFERER") ?? "https://edvana.dev";
    headers["X-Title"] = Deno.env.get("WB_LLM_TITLE") ?? "Edvana Whiteboard Tutor";
  }
  return fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Pull the assistant text out of a completion. Content only — never the
 * reasoning/CoT field, which would corrupt JSON parsing. */
function extractText(data: unknown): string {
  const msg = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message;
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? ""))
      .join("");
  }
  return "";
}

/** Extract the first balanced {...} object, ignoring braces inside strings.
 * Tolerates leading/trailing prose and reasoning wrappers. */
function firstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function tryParse<T>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const candidates = [cleaned, firstJsonObject(cleaned)].filter(
    (c): c is string => !!c,
  );
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** One completion request. Returns assistant text (possibly empty). */
async function once(provider: Provider, opts: LlmChatOptions, json: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model ?? textModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (json) body.response_format = { type: "json_object" };

  let res = await post(provider, body);
  // A model/route that rejects response_format: retry once without it.
  if (!res.ok && json) {
    const detail = await res.text();
    if (res.status >= 400 && res.status < 500 && /response_format|json/i.test(detail)) {
      delete body.response_format;
      res = await post(provider, body);
    } else {
      throw new Error(`LLM API error ${res.status}: ${detail.slice(0, 400)}`);
    }
  }
  if (!res.ok) {
    throw new Error(`LLM API error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return extractText(await res.json());
}

/** Plain text completion. */
export async function llmChat(opts: LlmChatOptions): Promise<string> {
  const provider = resolveProvider();
  if (!provider) throw new Error("LLM not configured (set OPENROUTER_API_KEY)");
  const text = await once(provider, opts, !!opts.jsonMode);
  if (!text.trim()) throw new Error("LLM returned empty content");
  return text;
}

/**
 * Completion that MUST yield a JSON object. Retries the whole call a few times
 * because reasoning/preview models intermittently return empty or non-JSON
 * content; each attempt requests strict JSON and is parsed leniently.
 */
export async function llmJson<T>(opts: LlmChatOptions): Promise<T> {
  const provider = resolveProvider();
  if (!provider) throw new Error("LLM not configured (set OPENROUTER_API_KEY)");

  let lastRaw = "";
  let lastErr = "";
  for (let i = 0; i < 3; i++) {
    try {
      const raw = await once(provider, opts, true);
      lastRaw = raw;
      const parsed = tryParse<T>(raw);
      if (parsed) return parsed;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(
    `LLM did not return valid JSON after 3 tries. ${lastErr ? `Last error: ${lastErr}. ` : ""}Sample: ${lastRaw.slice(0, 200)}`,
  );
}

export const llmCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
