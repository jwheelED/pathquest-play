// Shared AI adapter — proxies callers to the Lovable AI Gateway (Gemini).
// Kept under the original filename / export name (`callClaude`) so existing
// call sites continue to work without edits. Despite the legacy name, this
// now routes to Google Gemini via the Lovable AI Gateway.

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// NOTE: "google/gemini-3.5-flash" never existed — the typo silently fell back
// through the gateway and added latency to every default-model call. Fixed to
// the real fast model exposed by Lovable.
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

  // callClaude always routes through the Lovable AI Gateway (Gemini), which
  // handles tool_choice natively. The Moonshot shim lives in callAiProvider
  // (aiProvider.ts) for functions that call Moonshot directly.
  const hasTools = body.tools && body.tools.length > 0;
  const shimToolCall = false;

  let toolFnName: string | undefined;
  const messages = [...body.messages] as Record<string, unknown>[];

  if (shimToolCall) {
    const tool = body.tools![0];
    toolFnName = tool.function.name;
    const schema = JSON.stringify(tool.function.parameters);
    const jsonInstruction = `\nRespond with ONLY a JSON object (no markdown, no code fences) matching this schema:\n${schema}`;
    // Append to existing system message or add one
    const sysIdx = messages.findIndex((m) => m.role === "system");
    if (sysIdx >= 0) {
      messages[sysIdx] = { ...messages[sysIdx], content: (messages[sysIdx].content as string) + jsonInstruction };
    } else {
      messages.unshift({ role: "system", content: jsonInstruction.trim() });
    }
  }

  const gatewayBody: Record<string, unknown> = {
    model,
    messages,
  };
  if (typeof body.temperature === "number") gatewayBody.temperature = body.temperature;
  if (typeof body.max_tokens === "number") gatewayBody.max_tokens = body.max_tokens;

  if (shimToolCall) {
    gatewayBody.response_format = { type: "json_object" };
  } else {
    if (hasTools) gatewayBody.tools = body.tools;
    if (body.tool_choice !== undefined) gatewayBody.tool_choice = body.tool_choice;
    if (body.response_format !== undefined) gatewayBody.response_format = body.response_format;
  }

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

  // Repackage JSON-mode text response as a tool_call so callers see the same
  // shape they would from a provider with native tool support.
  if (shimToolCall && data.choices?.[0]?.message?.content && toolFnName) {
    const raw = data.choices[0].message.content as string;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    data.choices[0].message.tool_calls = [
      {
        id: `shim_${Date.now()}`,
        type: "function",
        function: { name: toolFnName, arguments: cleaned },
      },
    ];
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
