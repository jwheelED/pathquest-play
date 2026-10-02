// Shared AI provider resolution for functions that call the LLM directly.
// Prioritizes Moonshot/Kimi, falls back to Lovable AI Gateway.

export interface AiProvider {
  url: string;
  key: string;
  defaultModel: string;
  name: string;
}

export function resolveAiProvider(): AiProvider {
  const moonshotKey = Deno.env.get("MOONSHOT_API_KEY") ?? Deno.env.get("KIMI_API_KEY");
  if (moonshotKey) {
    return {
      url: "https://api.moonshot.ai/v1/chat/completions",
      key: moonshotKey,
      defaultModel: "kimi-k2.6",
      name: "Moonshot",
    };
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovableKey,
      defaultModel: "google/gemini-2.5-flash",
      name: "Lovable",
    };
  }

  throw new Error("No AI provider configured (set MOONSHOT_API_KEY or LOVABLE_API_KEY)");
}

interface ToolDef {
  type: "function";
  function: { name: string; description?: string; parameters: unknown };
}

interface AiRequestBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools?: ToolDef[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
  response_format?: unknown;
}

/**
 * Send a chat-completion request that works across providers. When the
 * provider is Moonshot and tools are present, automatically converts to
 * JSON mode (response_format) and repackages the response as a tool_call
 * so callers see a consistent shape.
 */
export async function callAiProvider(
  ai: AiProvider,
  body: AiRequestBody,
): Promise<Response> {
  const useMoonshot = ai.name === "Moonshot";
  const hasTools = body.tools && body.tools.length > 0;
  const shimToolCall = useMoonshot && hasTools;

  let toolFnName: string | undefined;
  const messages = body.messages.map((m) => ({ ...m }));

  if (shimToolCall) {
    const tool = body.tools![0];
    toolFnName = tool.function.name;
    const schema = JSON.stringify(tool.function.parameters);
    const jsonInstruction = `\nRespond with ONLY a JSON object (no markdown, no code fences) matching this schema:\n${schema}`;
    const sysIdx = messages.findIndex((m) => m.role === "system");
    if (sysIdx >= 0) {
      messages[sysIdx] = { ...messages[sysIdx], content: messages[sysIdx].content + jsonInstruction };
    } else {
      messages.unshift({ role: "system", content: jsonInstruction.trim() });
    }
  }

  const reqBody: Record<string, unknown> = {
    model: body.model,
    messages,
  };
  if (typeof body.temperature === "number") reqBody.temperature = body.temperature;
  if (typeof body.max_tokens === "number") reqBody.max_tokens = body.max_tokens;

  if (shimToolCall) {
    reqBody.response_format = { type: "json_object" };
  } else {
    if (hasTools) reqBody.tools = body.tools;
    if (body.tool_choice !== undefined) reqBody.tool_choice = body.tool_choice;
    if (body.response_format !== undefined) reqBody.response_format = body.response_format;
  }

  const upstream = await fetch(ai.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ai.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  if (!upstream.ok) {
    return upstream;
  }

  const data = await upstream.json();

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
