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
      defaultModel: "moonshot-v1-32k",
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
