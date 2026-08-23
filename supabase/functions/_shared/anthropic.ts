// Shared AI adapter — routes callers to the Moonshot (Kimi) API.
// Kept under the original filename / export name (`callClaude`) so existing
// call sites continue to work without edits. Despite the legacy name, this
// routes to Moonshot's Kimi models via their OpenAI-compatible API.

const MOONSHOT_URL = "https://api.moonshot.ai/v1/chat/completions";
// Single swappable default model. Kimi K2.6 is a large model; latency-sensitive
// live-lecture paths can override per call (e.g. a faster/turbo Kimi variant)
// by passing an explicit `kimi-...` / `moonshot-...` model in the request body.
const DEFAULT_MODEL = "kimi-k2.6";

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
 * Drop-in replacement for `fetch("https://api.moonshot.ai/v1/chat/completions", ...)`.
 * Accepts an OpenAI-style body and returns an OpenAI-shaped Response. Routes to
 * Moonshot's Kimi models.
 *
 * Model resolution: an explicit Kimi/Moonshot model (`kimi-...` or `moonshot-...`)
 * is honored; any other value — legacy provider-prefixed ids like `google/...`,
 * `openai/...`, `gpt-...`, `claude-...`, or an unset model — is overridden with
 * DEFAULT_MODEL, since those ids do not exist on Moonshot.
 */
export async function callClaude(body: OpenAIRequest): Promise<Response> {
  const MOONSHOT_API_KEY = Deno.env.get("MOONSHOT_API_KEY");
  if (!MOONSHOT_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "MOONSHOT_API_KEY is not configured" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const requestedModel = body.model;
  const isMoonshotModel =
    typeof requestedModel === "string" &&
    (requestedModel.startsWith("kimi-") || requestedModel.startsWith("moonshot-"));
  const model = isMoonshotModel ? requestedModel! : DEFAULT_MODEL;

  const apiBody: Record<string, unknown> = {
    model,
    messages: body.messages,
  };
  // Kimi K2.6 only accepts temperature = 1 and 400s on any other value, so force
  // it for that model regardless of what the caller passed. Other models keep the
  // caller's value.
  if (model === "kimi-k2.6") {
    apiBody.temperature = 1;
  } else if (typeof body.temperature === "number") {
    apiBody.temperature = body.temperature;
  }
  if (typeof body.max_tokens === "number") apiBody.max_tokens = body.max_tokens;
  if (body.tools && body.tools.length > 0) apiBody.tools = body.tools;
  if (body.tool_choice !== undefined) apiBody.tool_choice = body.tool_choice;
  if (body.response_format !== undefined) apiBody.response_format = body.response_format;

  const upstream = await fetch(MOONSHOT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MOONSHOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(apiBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("Moonshot API error:", upstream.status, errText);
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

  // Moonshot returns OpenAI-shaped JSON — pass it straight through.
  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
