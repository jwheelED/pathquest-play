import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question_text, context } = await req.json();

    if (!question_text) {
      return new Response(JSON.stringify({ error: "question_text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Generating expected answer for question:", question_text.substring(0, 100));

    const systemPrompt = `You are an educational AI assistant. Generate the correct, factual answer to a question.

IMPORTANT: Provide the ACTUAL CORRECT ANSWER, not instructions or meta-text.

Examples:
- Question: "How many bones are in the human body?" → expected_answer: "There are 206 bones in the human body."
- Question: "What is the capital of France?" → expected_answer: "Paris is the capital of France."
- Question: "What is photosynthesis?" → expected_answer: "Photosynthesis is the process by which plants convert sunlight, water, and carbon dioxide into glucose and oxygen."

The expected answer should:
1. Be a direct, factual response (1-3 sentences)
2. State the correct answer clearly
3. Be suitable as a grading reference

Return ONLY valid JSON:
{
  "expected_answer": "The actual correct answer here"
}`;

    const userPrompt = context ? `Context: ${context}\n\nQuestion: ${question_text}` : `Question: ${question_text}`;

    let lastError: Error | null = null;

    // Retry up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Attempt ${attempt} to generate expected answer`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 500,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`AI API error (attempt ${attempt}):`, errorText);
          lastError = new Error(`AI API error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          console.error(`Empty response from AI (attempt ${attempt})`);
          lastError = new Error("Empty response from AI");
          continue;
        }

        console.log("Raw AI response:", content);

        // Clean and parse the response
        let cleanedContent = content.trim();

        // Remove markdown code blocks if present
        if (cleanedContent.startsWith("```json")) {
          cleanedContent = cleanedContent.slice(7);
        } else if (cleanedContent.startsWith("```")) {
          cleanedContent = cleanedContent.slice(3);
        }
        if (cleanedContent.endsWith("```")) {
          cleanedContent = cleanedContent.slice(0, -3);
        }
        cleanedContent = cleanedContent.trim();

        const parsed = JSON.parse(cleanedContent);

        if (!parsed.expected_answer || typeof parsed.expected_answer !== "string") {
          console.error(`Invalid response format (attempt ${attempt}):`, parsed);
          lastError = new Error("Invalid response format");
          continue;
        }

        console.log("Successfully generated expected answer");

        return new Response(JSON.stringify({ expected_answer: parsed.expected_answer }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error(`Error on attempt ${attempt}:`, error);
        lastError = error as Error;

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed - return a helpful fallback
    console.error("All attempts failed, returning placeholder");
    return new Response(
      JSON.stringify({
        expected_answer: "Please provide the key concepts and correct explanation for this question.",
        is_placeholder: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error in generate-expected-answer:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
