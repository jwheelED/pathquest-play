import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, studentProgress, assignmentType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create tailored prompt based on student progress and assignment type
    const systemPrompt = assignmentType === 'quiz' 
      ? `You are an educational content creator. Generate a quiz with 5 multiple-choice questions on ${topic}. 
         For each question provide:
         - question: clear question text
         - options: array of 4 options (A, B, C, D)
         - correctAnswer: the correct option letter
         - hint1: conceptual hint about the topic
         - hint2: hint that narrows down the options
         - hint3: hint pointing toward the answer with reasoning
         - solution: full explanation of why the answer is correct
         Return valid JSON: {"questions": [{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswer": "A", "hint1": "...", "hint2": "...", "hint3": "...", "solution": "..."}]}`
      : assignmentType === 'mini_project'
      ? `You are an educational content creator. Generate a mini-project prompt on ${topic} for a ${studentProgress} level student.
         Provide:
         - title: catchy project title
         - prompt: detailed project description and what to build (200-300 words)
         - hint1: conceptual approach to solving the problem
         - hint2: key steps or algorithm outline
         - hint3: pseudo-code or structure guidance
         Return valid JSON: {"title": "...", "prompt": "...", "hint1": "...", "hint2": "...", "hint3": "..."}`
      : `You are an educational content creator. Generate a comprehensive lesson on ${topic}.
         Provide:
         - title: lesson title
         - content: main lesson text (300-400 words), well-structured with paragraphs
         - codeExample: a practical code example (if applicable)
         - explanation: explanation of the code example
         Return valid JSON: {"title": "...", "content": "...", "codeExample": "...", "explanation": "..."}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate content for: ${topic}` }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    // Parse JSON response
    let parsedContent;
    try {
      parsedContent = JSON.parse(generatedContent);
    } catch {
      // If AI didn't return valid JSON, wrap the content
      parsedContent = { content: generatedContent };
    }

    return new Response(JSON.stringify({ content: parsedContent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-content function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
