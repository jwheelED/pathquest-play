// OpenRouter adapter — used for evaluating the free `stealth/ox-alpha` model.
// Mirrors the shape of `_shared/anthropic.ts` (callClaude) so call sites can
// swap between providers with a one-line import change. OpenRouter is
// OpenAI-compatible, so the request/response bodies are identical.
//
// NOTE: `stealth/ox-alpha` is an anonymous, prompt-logging preview model and is
// expected to be short-lived. Scoped to the generate-detailed-explanation canary
// only — the rest of the app still routes through the Kimi adapter.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "stealth/ox-alpha";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: any;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: any;
  };
}

interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: any;
  response_format?: any;
}

/**
 * OpenAI-compatible call to OpenRouter. Accepts an OpenAI-style body and returns
 * an OpenAI-shaped Response, so existing `choices[0].message...` parsing works
 * unchanged. Honors an explicit caller `model`; otherwise uses DEFAULT_MODEL.
 */
export async function callOpenRouter(body: OpenAIRequest): Promise<Response> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "OPENROUTER_API_KEY is not configured" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const model = typeof body.model === "string" && body.model.length > 0
    ? body.model
    : DEFAULT_MODEL;

  const apiBody: Record<string, unknown> = {
    model,
    messages: body.messages,
  };
  if (typeof body.temperature === "number") apiBody.temperature = body.temperature;
  if (typeof body.max_tokens === "number") apiBody.max_tokens = body.max_tokens;
  if (body.tools && body.tools.length > 0) apiBody.tools = body.tools;
  if (body.tool_choice !== undefined) apiBody.tool_choice = body.tool_choice;
  if (body.response_format !== undefined) apiBody.response_format = body.response_format;

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      // Optional OpenRouter attribution headers (used for their dashboard/rankings).
      "HTTP-Referer": "https://edvana.app",
      "X-Title": "Edvana",
    },
    body: JSON.stringify(apiBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("OpenRouter API error:", upstream.status, errText);
    const status =
      upstream.status === 429 ? 429 :
      upstream.status === 402 ? 402 :
      upstream.status === 401 || upstream.status === 403 ? 402 :
      upstream.status;
    return new Response(
      JSON.stringify({ error: { message: errText, status: upstream.status } }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  // OpenRouter returns OpenAI-shaped JSON — pass it straight through.
  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
