// Shared AI adapter — routes to Moonshot/Kimi (primary) or Lovable AI Gateway (fallback).
// Kept under the original filename / export name (`callClaude`) so existing
// call sites continue to work without edits.

const MOONSHOT_API_URL = "https://api.moonshot.ai/v1/chat/completions";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const MOONSHOT_DEFAULT_MODEL = "moonshot-v1-32k";
const LOVABLE_DEFAULT_MODEL = "google/gemini-2.5-flash";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: unknown;
  };
}

interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: unknown;
  response_format?: unknown;
}

interface Provider {
  url: string;
  key: string;
  defaultModel: string;
  name: string;
}

function resolveProvider(): Provider {
  const moonshotKey = Deno.env.get("MOONSHOT_API_KEY") ?? Deno.env.get("KIMI_API_KEY");
  if (moonshotKey) {
    return {
      url: MOONSHOT_API_URL,
      key: moonshotKey,
      defaultModel: MOONSHOT_DEFAULT_MODEL,
      name: "Moonshot",
    };
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    return {
      url: LOVABLE_AI_URL,
      key: lovableKey,
      defaultModel: LOVABLE_DEFAULT_MODEL,
      name: "Lovable",
    };
  }

  throw new Error("No AI provider configured (set MOONSHOT_API_KEY or LOVABLE_API_KEY)");
}

/**
 * Drop-in replacement for the original callClaude.
 * Routes to Moonshot/Kimi when MOONSHOT_API_KEY is set, otherwise falls back
 * to the Lovable AI Gateway. Accepts an OpenAI-style body and returns an
 * OpenAI-shaped Response.
 */
export async function callClaude(body: OpenAIRequest): Promise<Response> {
  let provider: Provider;
  try {
    provider = resolveProvider();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: (e as Error).message } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const requestedModel = body.model;
  const model =
    requestedModel &&
    !requestedModel.startsWith("claude") &&
    !requestedModel.startsWith("google/")
      ? requestedModel
      : provider.defaultModel;

  const gatewayBody: Record<string, unknown> = {
    model,
    messages: body.messages,
  };
  if (typeof body.temperature === "number") gatewayBody.temperature = body.temperature;
  if (typeof body.max_tokens === "number") gatewayBody.max_tokens = body.max_tokens;
  if (body.tools && body.tools.length > 0) gatewayBody.tools = body.tools;
  if (body.tool_choice !== undefined) gatewayBody.tool_choice = body.tool_choice;
  if (body.response_format !== undefined) gatewayBody.response_format = body.response_format;

  const upstream = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(gatewayBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error(`${provider.name} API error:`, upstream.status, errText);
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

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
