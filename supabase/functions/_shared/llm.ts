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

export interface LlmTextPart {
  type: "text";
  text: string;
}
export interface LlmImagePart {
  type: "image_url";
  image_url: { url: string };
}
export type LlmContent = string | Array<LlmTextPart | LlmImagePart>;

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: LlmContent;
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

async function post(
  provider: Provider,
  body: Record<string, unknown>,
): Promise<Response> {
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

/** Low-level chat completion. Returns the assistant message text. */
export async function llmChat(opts: LlmChatOptions): Promise<string> {
  const provider = resolveProvider();
  if (!provider) throw new Error("LLM not configured (set OPENROUTER_API_KEY)");

  const base: Record<string, unknown> = {
    model: opts.model ?? textModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) base.max_tokens = opts.maxTokens;

  const withJson = opts.jsonMode
    ? { ...base, response_format: { type: "json_object" } }
    : base;

  let res = await post(provider, withJson);

  // Some models/routes reject response_format — retry once without it.
  if (!res.ok && opts.jsonMode) {
    const detail = await res.text();
    if (res.status >= 400 && res.status < 500 && /response_format|json/i.test(detail)) {
      res = await post(provider, base);
    } else {
      throw new Error(`LLM API error ${res.status}: ${detail.slice(0, 500)}`);
    }
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LLM API error ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("LLM returned no message content");
  return text;
}

/**
 * Chat completion that must return a JSON object. Tolerates models that wrap
 * JSON in ```json fences or add prose. Throws if nothing parses.
 */
export async function llmJson<T>(opts: LlmChatOptions): Promise<T> {
  const raw = await llmChat({ ...opts, jsonMode: true });
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`LLM did not return valid JSON: ${raw.slice(0, 300)}`);
  }
}

export const llmCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
