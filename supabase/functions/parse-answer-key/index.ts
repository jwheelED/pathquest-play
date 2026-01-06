import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProblemSolution {
  problem_number: string;
  problem_text: string;
  problem_latex: string | null;
  solution_text: string;
  solution_latex: string | null;
  solution_steps: { step: number; explanation: string; latex: string }[];
  final_answer: string;
  final_answer_latex: string | null;
  units: string | null;
  topic_tags: string[];
  keywords: string[];
  difficulty: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { answerKeyId, answer_key_id: legacyId } = await req.json();
    const actualAnswerKeyId = answerKeyId || legacyId;

    if (!actualAnswerKeyId) {
      console.error("Missing required field: answerKeyId");
      return new Response(JSON.stringify({ error: "Missing answerKeyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Fetching answer key ${actualAnswerKeyId} for user ${user.id}`);

    // Fetch the answer key record to get file path and metadata
    const { data: answerKey, error: fetchError } = await supabase
      .from("instructor_answer_keys")
      .select("*")
      .eq("id", actualAnswerKeyId)
      .single();

    if (fetchError || !answerKey) {
      console.error("Failed to fetch answer key:", fetchError);
      return new Response(JSON.stringify({ error: "Answer key not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!answerKey.file_path) {
      console.error("Answer key has no file path");
      return new Response(JSON.stringify({ error: "No file associated with this answer key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase
      .from("instructor_answer_keys")
      .update({ status: "processing" })
      .eq("id", actualAnswerKeyId);

    // Download the file from storage
    console.log(`Downloading file from storage: ${answerKey.file_path}`);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("answer-keys")
      .download(answerKey.file_path);

    if (downloadError || !fileData) {
      console.error("Failed to download file:", downloadError);
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", actualAnswerKeyId);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert file to text content
    let file_content: string;
    const fileType = answerKey.file_type || "";
    
    if (fileType.includes("text") || answerKey.file_name?.endsWith(".txt")) {
      file_content = await fileData.text();
    } else if (fileType.includes("pdf") || answerKey.file_name?.endsWith(".pdf")) {
      // For PDFs, we need to extract text - for now, send the base64 and let AI handle it
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      file_content = `[PDF Document - Base64 Encoded]\n${base64.substring(0, 50000)}...`; // Truncate for API limits
      console.log("PDF detected, using base64 encoding (truncated)");
    } else if (fileType.includes("image") || /\.(png|jpg|jpeg)$/i.test(answerKey.file_name || "")) {
      // For images, use base64 encoding for vision models
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      file_content = `[Image Document - Please extract text from this base64 image]\ndata:${fileType};base64,${base64}`;
      console.log("Image detected, using base64 encoding");
    } else {
      // Try to read as text
      try {
        file_content = await fileData.text();
      } catch {
        console.error("Could not read file as text");
        await supabase
          .from("instructor_answer_keys")
          .update({ status: "error" })
          .eq("id", actualAnswerKeyId);
        return new Response(JSON.stringify({ error: "Unsupported file format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const subject = answerKey.subject;
    const course_context = answerKey.course_context;

    console.log(`Parsing answer key ${actualAnswerKeyId}, subject: ${subject}, content length: ${file_content.length}`);

    // Build the AI prompt for parsing
    const systemPrompt = `You are an expert academic parser specializing in extracting problem-solution pairs from STEM answer keys.

Your task is to parse the provided content and extract structured problem-solution pairs.

For each problem you find, extract:
1. problem_number: The problem number/label (e.g., "1a", "2.3", "Problem 5")
2. problem_text: The complete problem statement in plain text
3. problem_latex: LaTeX representation of any equations in the problem (or null if none)
4. solution_text: Complete solution explanation in plain text
5. solution_latex: LaTeX for any equations in the solution (or null if none)
6. solution_steps: Array of step-by-step breakdown: [{step: 1, explanation: "...", latex: "..."}, ...]
7. final_answer: The definitive final answer
8. final_answer_latex: LaTeX version of the final answer (or null if plain text)
9. units: Physical units if applicable (e.g., "m/s", "J", "N")
10. topic_tags: Array of topic tags (e.g., ["kinematics", "projectile-motion"])
11. keywords: 5-10 trigger words/phrases that would appear when discussing this problem (for transcript matching)
12. difficulty: One of "beginner", "intermediate", "advanced", "expert"

Subject context: ${subject || "general"}
Course context: ${course_context || "not specified"}

IMPORTANT:
- Extract ALL problems you can find in the content
- For complex equations, use proper LaTeX notation
- For physics/engineering: include vectors (\\vec{v}), Greek letters (\\alpha, \\beta), units
- For chemistry: include molecular formulas, reaction equations
- For math: include integrals, matrices, summations, limits
- Generate meaningful keywords that instructors might say when discussing each problem

Return your response as a valid JSON object with this structure:
{
  "problems": [
    {
      "problem_number": "1",
      "problem_text": "...",
      "problem_latex": null,
      "solution_text": "...",
      "solution_latex": null,
      "solution_steps": [],
      "final_answer": "...",
      "final_answer_latex": null,
      "units": null,
      "topic_tags": [],
      "keywords": [],
      "difficulty": "intermediate"
    }
  ],
  "metadata": {
    "total_problems": 0,
    "subjects_detected": [],
    "parsing_notes": ""
  }
}`;

    const userPrompt = `Parse the following answer key content and extract all problem-solution pairs:\n\n${file_content}`;

    console.log("Calling Lovable AI Gateway for parsing...");

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent parsing
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", actualAnswerKeyId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI parsing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content;

    if (!responseContent) {
      console.error("No content in AI response");
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", actualAnswerKeyId);
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("AI response received, parsing JSON...");

    // Parse the AI response
    let parsedResult;
    try {
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      let jsonStr = responseContent;
      const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      parsedResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Raw response:", responseContent.substring(0, 500));
      
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", actualAnswerKeyId);
      
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const problems: ProblemSolution[] = parsedResult.problems || [];
    console.log(`Parsed ${problems.length} problems from answer key`);

    if (problems.length === 0) {
      console.warn("No problems extracted from content");
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "parsed", problem_count: 0 })
        .eq("id", actualAnswerKeyId);
      
      return new Response(JSON.stringify({ 
        success: true, 
        problems_extracted: 0,
        message: "No problems could be extracted from the content" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert problems into database
    const problemInserts = problems.map((problem, index) => ({
      answer_key_id: actualAnswerKeyId,
      problem_number: problem.problem_number || `${index + 1}`,
      problem_text: problem.problem_text,
      problem_latex: problem.problem_latex || null,
      solution_text: problem.solution_text,
      solution_latex: problem.solution_latex || null,
      solution_steps: problem.solution_steps || [],
      final_answer: problem.final_answer,
      final_answer_latex: problem.final_answer_latex || null,
      units: problem.units || null,
      topic_tags: problem.topic_tags || [],
      keywords: problem.keywords || [],
      difficulty: problem.difficulty || "intermediate",
      verified_by_instructor: false,
      order_index: index,
    }));

    console.log("Inserting problems into database...");

    const { error: insertError } = await supabase
      .from("answer_key_problems")
      .insert(problemInserts);

    if (insertError) {
      console.error("Failed to insert problems:", insertError);
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", actualAnswerKeyId);
      
      return new Response(JSON.stringify({ error: "Failed to save extracted problems" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update answer key status
    await supabase
      .from("instructor_answer_keys")
      .update({ 
        status: "parsed",
        problem_count: problems.length 
      })
      .eq("id", actualAnswerKeyId);

    console.log(`Successfully parsed and saved ${problems.length} problems for answer key ${actualAnswerKeyId}`);

    return new Response(JSON.stringify({
      success: true,
      problems_extracted: problems.length,
      metadata: parsedResult.metadata || {},
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in parse-answer-key function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
