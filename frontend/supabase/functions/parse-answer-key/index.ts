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
  has_solution: boolean;
  solution_text: string | null;
  solution_latex: string | null;
  solution_steps: { step: number; explanation: string; latex: string }[];
  final_answer: string | null;
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

    // Detect file type and prepare content for AI
    const fileType = answerKey.file_type || "";
    const fileName = answerKey.file_name || "";
    const isImage = fileType.includes("image") || /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);
    const isPdf = fileType.includes("pdf") || fileName.endsWith(".pdf");
    
    let messageContent: any;

    if (isImage) {
      // For images, use proper multimodal content array for vision models
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const mimeType = fileType || "image/png";
      
      console.log(`Image detected (${mimeType}), using multimodal content for vision model`);
      
      messageContent = [
        { 
          type: "text", 
          text: buildUserPrompt(answerKey.subject, answerKey.course_context) 
        },
        { 
          type: "image_url", 
          image_url: { 
            url: `data:${mimeType};base64,${base64}` 
          }
        }
      ];
    } else if (isPdf) {
      // For PDFs, extract base64 and send as document context
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const truncatedBase64 = base64.substring(0, 50000); // API limits
      
      console.log("PDF detected, using base64 encoding (truncated for API limits)");
      
      messageContent = buildUserPrompt(answerKey.subject, answerKey.course_context) + 
        `\n\n[PDF Document - Base64 Encoded]\n${truncatedBase64}...`;
    } else {
      // For text files, read as text
      let fileText: string;
      try {
        fileText = await fileData.text();
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
      
      messageContent = buildUserPrompt(answerKey.subject, answerKey.course_context) + 
        `\n\n${fileText}`;
    }

    const subject = answerKey.subject;
    const course_context = answerKey.course_context;

    console.log(`Parsing answer key ${actualAnswerKeyId}, subject: ${subject}, is_image: ${isImage}`);

    // Build the AI prompt for flexible parsing (supports both problems+solutions AND problem-only)
    const systemPrompt = `You are an expert academic parser specializing in extracting problems from STEM documents.

Your task is to parse the provided content and extract ALL problems you find. The content may contain:
- Problems WITH full worked solutions
- Problems with ONLY final answers (no steps)
- Problems with NO answers at all (problem statements only)

For EACH problem you find, extract what is AVAILABLE:

1. problem_number: The problem number/label (e.g., "1a", "2.3", "Problem 5", "5a")
2. problem_text: The complete problem statement in plain text (include all given information, values, conditions)
3. problem_latex: LaTeX representation of any equations in the problem (or null if none)
4. has_solution: boolean - true if ANY solution/answer is provided, false if problem-only
5. solution_text: Complete solution explanation in plain text (null if not available)
6. solution_latex: LaTeX for any equations in the solution (null if none)
7. solution_steps: Array of step-by-step breakdown: [{step: 1, explanation: "...", latex: "..."}] (empty array if not available)
8. final_answer: The definitive final answer if provided (null if not available)
9. final_answer_latex: LaTeX version of the final answer (null if plain text or not available)
10. units: Physical units if applicable (e.g., "m/s", "J", "N")
11. topic_tags: Array of topic tags (e.g., ["circular-motion", "energy-conservation", "roller-coaster"])
12. keywords: 5-10 trigger words/phrases for transcript matching - words an instructor would say when discussing this problem
13. difficulty: One of "beginner", "intermediate", "advanced", "expert"

Subject context: ${subject || "general"}
Course context: ${course_context || "not specified"}

CRITICAL RULES:
- Extract EVERY distinct problem or sub-part (a, b, c, etc.) as a SEPARATE entry
- If a problem has multiple parts (a, b, c), create individual entries for EACH part
- If NO solution/answer is shown, set has_solution: false and leave solution fields null
- For IMAGES: carefully read ALL text including diagrams, figure labels, axis labels, and annotations
- For physics/engineering problems: extract all given values (mass, radius, height, velocity, etc.)
- Generate meaningful keywords even for problem-only entries based on the physics concepts involved
- For complex equations, use proper LaTeX notation (\\vec{v}, \\alpha, \\frac{}, etc.)

Return your response as a valid JSON object with this structure:
{
  "problems": [
    {
      "problem_number": "1",
      "problem_text": "...",
      "problem_latex": null,
      "has_solution": false,
      "solution_text": null,
      "solution_latex": null,
      "solution_steps": [],
      "final_answer": null,
      "final_answer_latex": null,
      "units": null,
      "topic_tags": [],
      "keywords": [],
      "difficulty": "intermediate"
    }
  ],
  "metadata": {
    "total_problems": 0,
    "problems_with_solutions": 0,
    "problems_without_solutions": 0,
    "subjects_detected": [],
    "parsing_notes": ""
  }
}`;

    console.log("Calling Lovable AI Gateway for parsing...");

    // Build the messages array based on content type
    const messages = [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: messageContent 
      },
    ];

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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
    const metadata = parsedResult.metadata || {};
    
    console.log(`Parsed ${problems.length} problems from answer key`);
    console.log(`  - With solutions: ${metadata.problems_with_solutions || 'unknown'}`);
    console.log(`  - Without solutions: ${metadata.problems_without_solutions || 'unknown'}`);

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

    // Insert problems into database with proper handling of nullable fields
    const problemInserts = problems.map((problem, index) => ({
      answer_key_id: actualAnswerKeyId,
      problem_number: problem.problem_number || `${index + 1}`,
      problem_text: problem.problem_text,
      problem_latex: problem.problem_latex || null,
      has_solution: problem.has_solution ?? false,
      solution_text: problem.has_solution ? (problem.solution_text || null) : null,
      solution_latex: problem.has_solution ? (problem.solution_latex || null) : null,
      solution_steps: problem.solution_steps || [],
      final_answer: problem.has_solution ? (problem.final_answer || null) : null,
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
      problems_with_solutions: metadata.problems_with_solutions || 0,
      problems_without_solutions: metadata.problems_without_solutions || 0,
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

// Helper function to build user prompt
function buildUserPrompt(subject: string | null, courseContext: string | null): string {
  return `Parse this content and extract all problems with their solutions (if available).
Subject: ${subject || 'general'}
Course context: ${courseContext || 'not specified'}

Extract every problem you find, including sub-parts (a, b, c, etc.) as separate entries.
For problem-only content (no solutions shown), set has_solution: false.`;
}
