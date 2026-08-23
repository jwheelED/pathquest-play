// Shared Kimi (Moonshot) client for Edvana Whiteboard Tutor edge functions.
//
// Kimi exposes an OpenAI-compatible Chat Completions API, so this is a thin
// fetch wrapper. Everything is env-configured so the exact K2 / K2.6 model IDs
// and endpoint can be set as Supabase secrets without code changes:
//
//   KIMI_API_KEY      (required)  your Moonshot key
//   KIMI_BASE_URL     default https://api.moonshot.ai/v1
//   KIMI_MODEL_TEXT   default kimi-k2-0711-preview
//   KIMI_MODEL_VISION default moonshot-v1-8k-vision-preview

export interface KimiTextPart {
  type: "text";
  text: string;
}
export interface KimiImagePart {
  type: "image_url";
  image_url: { url: string };
}
export type KimiContent = string | Array<KimiTextPart | KimiImagePart>;

export interface KimiMessage {
  role: "system" | "user" | "assistant";
  content: KimiContent;
}

export interface KimiChatOptions {
  messages: KimiMessage[];
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

function baseUrl(): string {
  return (Deno.env.get("KIMI_BASE_URL") ?? "https://api.moonshot.ai/v1").replace(/\/$/, "");
}

export function textModel(): string {
  return Deno.env.get("KIMI_MODEL_TEXT") ?? "kimi-k2-0711-preview";
}

export function visionModel(): string {
  return Deno.env.get("KIMI_MODEL_VISION") ?? "moonshot-v1-8k-vision-preview";
}

export function kimiConfigured(): boolean {
  return !!Deno.env.get("KIMI_API_KEY");
}

/** Low-level chat completion. Returns the assistant message text. */
export async function kimiChat(opts: KimiChatOptions): Promise<string> {
  const apiKey = Deno.env.get("KIMI_API_KEY");
  if (!apiKey) throw new Error("KIMI_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: opts.model ?? textModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Kimi API error ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Kimi API returned no message content");
  }
  return text;
}

/**
 * Chat completion that must return a JSON object. Tolerates models that wrap
 * JSON in ```json fences. Throws if the payload can't be parsed.
 */
export async function kimiJson<T>(opts: KimiChatOptions): Promise<T> {
  const raw = await kimiChat({ ...opts, jsonMode: true });
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Last resort: extract the first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`Kimi did not return valid JSON: ${raw.slice(0, 300)}`);
  }
}

export const kimiCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
