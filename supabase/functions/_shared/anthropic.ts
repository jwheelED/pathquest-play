// Shared AI adapter — proxies callers to the Lovable AI Gateway (Gemini).
// Kept under the original filename / export name (`callClaude`) so existing
// call sites continue to work without edits. Despite the legacy name, this
// now routes to Google Gemini via the Lovable AI Gateway.

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

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
 * Drop-in replacement for `fetch("https://ai.gateway.lovable.dev/v1/chat/completions", ...)`.
 * Accepts an OpenAI-style body and returns an OpenAI-shaped Response. Routes to
 * Google Gemini via the Lovable AI Gateway.
 *
 * If a caller passes `model: "claude-..."` (legacy), we override it with the
 * default Gemini model. Callers may pass any `google/...` or `openai/...` model
 * string supported by the gateway and it will be honored.
 */
export async function callClaude(body: OpenAIRequest): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "LOVABLE_API_KEY is not configured" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const requestedModel = body.model;
  const model =
    requestedModel && !requestedModel.startsWith("claude")
      ? requestedModel
      : DEFAULT_MODEL;

  const gatewayBody: Record<string, unknown> = {
    model,
    messages: body.messages,
  };
  if (typeof body.temperature === "number") gatewayBody.temperature = body.temperature;
  if (typeof body.max_tokens === "number") gatewayBody.max_tokens = body.max_tokens;
  if (body.tools && body.tools.length > 0) gatewayBody.tools = body.tools;
  if (body.tool_choice !== undefined) gatewayBody.tool_choice = body.tool_choice;
  if (body.response_format !== undefined) gatewayBody.response_format = body.response_format;

  const upstream = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(gatewayBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("Lovable AI Gateway error:", upstream.status, errText);
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

  // Gateway already returns OpenAI-shaped JSON — pass it straight through.
  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
