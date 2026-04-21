// Shared Anthropic Claude adapter that mimics OpenAI chat completions response shape.
// This lets us swap from Lovable AI Gateway → Anthropic with minimal call-site changes.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

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
 * Convert OpenAI-style messages to Anthropic format.
 * Anthropic separates `system` (top-level string) from `messages` (user/assistant only).
 */
function convertMessages(messages: OpenAIMessage[]): { system: string; messages: any[] } {
  let system = "";
  const converted: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system += (system ? "\n\n" : "") + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      continue;
    }

    // Handle vision content (array of {type:"text"|"image_url"} parts) → Anthropic content blocks
    if (Array.isArray(msg.content)) {
      const blocks = msg.content.map((part: any) => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        if (part.type === "image_url") {
          const url: string = part.image_url?.url ?? "";
          // Data URL: data:image/png;base64,XXXX
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              type: "image",
              source: { type: "base64", media_type: match[1], data: match[2] },
            };
          }
          // Plain URL
          return { type: "image", source: { type: "url", url } };
        }
        return part;
      });
      converted.push({ role: msg.role, content: blocks });
    } else {
      converted.push({ role: msg.role, content: msg.content });
    }
  }

  return { system, messages: converted };
}

/**
 * Drop-in replacement for `fetch("https://ai.gateway.lovable.dev/v1/chat/completions", ...)`.
 * Accepts an OpenAI-style body and returns a Response whose JSON body matches OpenAI's
 * chat-completion shape (choices[0].message.content + tool_calls).
 */
export async function callClaude(body: OpenAIRequest): Promise<Response> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "ANTHROPIC_API_KEY is not configured" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { system, messages } = convertMessages(body.messages);

  const anthropicBody: any = {
    model: body.model && body.model.startsWith("claude") ? body.model : DEFAULT_MODEL,
    max_tokens: body.max_tokens ?? 4096,
    messages,
  };
  if (system) anthropicBody.system = system;
  if (typeof body.temperature === "number") anthropicBody.temperature = body.temperature;

  // Convert OpenAI tools → Anthropic tools
  if (body.tools && body.tools.length > 0) {
    anthropicBody.tools = body.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: t.function.parameters,
    }));

    // Force a specific tool if tool_choice specifies one
    if (body.tool_choice && typeof body.tool_choice === "object" && body.tool_choice.function?.name) {
      anthropicBody.tool_choice = { type: "tool", name: body.tool_choice.function.name };
    } else if (body.tool_choice === "required") {
      anthropicBody.tool_choice = { type: "any" };
    } else {
      anthropicBody.tool_choice = { type: "auto" };
    }
  }

  // If JSON output was requested via response_format and no tools provided, hint via system.
  if (!body.tools && body.response_format?.type === "json_object") {
    anthropicBody.system = (anthropicBody.system ? anthropicBody.system + "\n\n" : "") +
      "You must respond with ONLY valid JSON, no prose, no markdown fences.";
  }

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(anthropicBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("Anthropic API error:", upstream.status, errText);
    // Pass through a useful error code for callers that branch on 429/402.
    const status =
      upstream.status === 429 ? 429 :
      upstream.status === 401 || upstream.status === 403 ? 402 :
      upstream.status;
    return new Response(
      JSON.stringify({ error: { message: errText, status: upstream.status } }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = await upstream.json();

  // Extract text + tool calls from Anthropic content blocks
  let textContent = "";
  const toolCalls: any[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }

  // Build OpenAI-shaped response
  const openAIShape = {
    id: data.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: data.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: data.stop_reason === "tool_use" ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: data.usage?.input_tokens ?? 0,
      completion_tokens: data.usage?.output_tokens ?? 0,
      total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };

  return new Response(JSON.stringify(openAIShape), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
