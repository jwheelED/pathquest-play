import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedMCQ {
  question_text: string;
  question_latex: string | null;
  choices: { letter: string; text: string; latex?: string }[];
  correct_answer: { letter: string; text: string };
  explanation: string | null;
  explanation_latex: string | null;
  topic_tags: string[];
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

    const { answerKeyId } = await req.json();

    if (!answerKeyId) {
      console.error("Missing required field: answerKeyId");
      return new Response(JSON.stringify({ error: "Missing answerKeyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Extracting MCQs from answer key ${answerKeyId} for user ${user.id}`);

    // Fetch the answer key record
    const { data: answerKey, error: fetchError } = await supabase
      .from("instructor_answer_keys")
      .select("*")
      .eq("id", answerKeyId)
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
      .eq("id", answerKeyId);

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
        .eq("id", answerKeyId);
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
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      file_content = `[PDF Document - Base64 Encoded]\n${base64.substring(0, 50000)}...`;
      console.log("PDF detected, using base64 encoding (truncated)");
    } else if (fileType.includes("image") || /\.(png|jpg|jpeg)$/i.test(answerKey.file_name || "")) {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      file_content = `[Image Document - Please extract text from this base64 image]\ndata:${fileType};base64,${base64}`;
      console.log("Image detected, using base64 encoding");
    } else {
      try {
        file_content = await fileData.text();
      } catch {
        console.error("Could not read file as text");
        await supabase
          .from("instructor_answer_keys")
          .update({ status: "error" })
          .eq("id", answerKeyId);
        return new Response(JSON.stringify({ error: "Unsupported file format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const subject = answerKey.subject;
    const course_context = answerKey.course_context;

    console.log(`Extracting MCQs from answer key ${answerKeyId}, subject: ${subject}, content length: ${file_content.length}`);

    // Build the AI prompt for EXTRACTING existing MCQs (not generating new ones)
    const systemPrompt = `You are an expert at extracting multiple-choice questions from educational documents.

Your task is to EXTRACT (not create or generate) the EXACT multiple-choice questions that already exist in the provided content.

CRITICAL RULES:
1. Only extract questions that are ALREADY in the document
2. Do NOT create, generate, or modify any questions
3. Do NOT paraphrase or reword questions
4. Extract the exact text as written in the document
5. Preserve all formatting, special characters, and technical notation

For each MCQ found in the document, extract:
1. question_text: The EXACT question as written (plain text)
2. question_latex: LaTeX version of any equations in the question (or null)
3. choices: Array of the EXACT answer options as written
4. correct_answer: The marked correct answer (letter and text)
5. explanation: Any explanation provided in the document (or null if none)
6. explanation_latex: LaTeX for explanation equations (or null)
7. topic_tags: 2-4 relevant topic tags
8. difficulty: One of "beginner", "intermediate", "advanced", "expert"

Subject context: ${subject || "general"}
Course context: ${course_context || "not specified"}

Look for common patterns indicating MCQs:
- Numbered/lettered choices (A, B, C, D or 1, 2, 3, 4)
- Answer keys marking correct answers
- Questions ending with "?" or "Choose the correct answer"
- Circle/check marks indicating correct responses

Return your response as a valid JSON object:
{
  "mcqs": [
    {
      "question_text": "What is the capital of France?",
      "question_latex": null,
      "choices": [
        {"letter": "A", "text": "London"},
        {"letter": "B", "text": "Paris"},
        {"letter": "C", "text": "Berlin"},
        {"letter": "D", "text": "Madrid"}
      ],
      "correct_answer": {"letter": "B", "text": "Paris"},
      "explanation": "Paris is the capital and largest city of France.",
      "explanation_latex": null,
      "topic_tags": ["geography", "europe"],
      "difficulty": "beginner"
    }
  ],
  "metadata": {
    "total_extracted": 0,
    "extraction_notes": ""
  }
}

If the document does not contain any multiple-choice questions, return:
{
  "mcqs": [],
  "metadata": {
    "total_extracted": 0,
    "extraction_notes": "No multiple-choice questions found in document"
  }
}`;

    const userPrompt = `Extract ALL existing multiple-choice questions from this document. Remember: EXTRACT only, do not create new questions:\n\n${file_content}`;

    console.log("Calling Lovable AI Gateway for MCQ extraction...");

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
        temperature: 0.1, // Very low temperature for accurate extraction
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", answerKeyId);

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
      
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
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
        .eq("id", answerKeyId);
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("AI response received, parsing JSON...");

    // Parse the AI response
    let parsedResult;
    try {
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
        .eq("id", answerKeyId);
      
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mcqs: ExtractedMCQ[] = parsedResult.mcqs || [];
    console.log(`Extracted ${mcqs.length} MCQs from answer key`);

    if (mcqs.length === 0) {
      console.warn("No MCQs extracted from content");
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "parsed", problem_count: 0 })
        .eq("id", answerKeyId);
      
      return new Response(JSON.stringify({ 
        success: true, 
        mcqs_extracted: 0,
        message: "No multiple-choice questions found in the document" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert MCQs directly into answer_key_mcqs table
    const mcqInserts = mcqs.map((mcq, index) => {
      // Get distractors (choices that are not the correct answer)
      const distractors = mcq.choices
        .filter(c => c.letter !== mcq.correct_answer.letter)
        .map(c => ({ text: c.text, reason: null }));

      return {
        answer_key_id: answerKeyId,
        problem_id: null, // No associated problem for directly extracted MCQs
        question_text: mcq.question_text,
        question_latex: mcq.question_latex || null,
        correct_answer: mcq.correct_answer.text,
        correct_answer_latex: null,
        distractors: distractors,
        explanation: mcq.explanation || null,
        explanation_latex: mcq.explanation_latex || null,
        source_type: "extracted",
        verified: true, // Extracted MCQs are ready to use immediately
      };
    });

    console.log("Inserting extracted MCQs into database...");

    const { error: insertError } = await supabase
      .from("answer_key_mcqs")
      .insert(mcqInserts);

    if (insertError) {
      console.error("Failed to insert MCQs:", insertError);
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "error" })
        .eq("id", answerKeyId);
      
      return new Response(JSON.stringify({ error: "Failed to save extracted MCQs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update answer key status
    await supabase
      .from("instructor_answer_keys")
      .update({ 
        status: "parsed",
        problem_count: mcqs.length,
        content_type: "mcqs"
      })
      .eq("id", answerKeyId);

    console.log(`Successfully extracted and saved ${mcqs.length} MCQs for answer key ${answerKeyId}`);

    return new Response(JSON.stringify({
      success: true,
      mcqs_extracted: mcqs.length,
      metadata: parsedResult.metadata || {},
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in extract-mcqs-from-file function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
