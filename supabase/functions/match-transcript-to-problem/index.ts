import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MatchResult {
  problem_id: string;
  problem_number: string;
  problem_text: string;
  final_answer: string;
  confidence: number;
  matched_keywords: string[];
  has_verified_mcq: boolean;
  mcq_id: string | null;
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

    const { transcript, min_confidence = 0.3 } = await req.json();

    if (!transcript) {
      return new Response(JSON.stringify({ error: "Missing transcript" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Matching transcript to problems for instructor ${user.id}`);
    console.log(`Transcript length: ${transcript.length} characters`);

    // Fetch all verified problems for this instructor with their MCQs
    const { data: problems, error: problemsError } = await supabase
      .from("answer_key_problems")
      .select(`
        id,
        problem_number,
        problem_text,
        final_answer,
        units,
        keywords,
        topic_tags,
        verified_by_instructor,
        answer_key_mcqs (
          id,
          verified
        ),
        instructor_answer_keys!inner (
          instructor_id
        )
      `)
      .eq("instructor_answer_keys.instructor_id", user.id)
      .eq("verified_by_instructor", true);

    if (problemsError) {
      console.error("Error fetching problems:", problemsError);
      return new Response(JSON.stringify({ error: "Failed to fetch problems" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!problems || problems.length === 0) {
      console.log("No verified problems found for instructor");
      return new Response(JSON.stringify({ 
        matches: [],
        message: "No verified problems available for matching" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${problems.length} verified problems to match against`);

    // Normalize transcript for matching
    const normalizedTranscript = transcript.toLowerCase().trim();
    const transcriptWords = new Set(
      normalizedTranscript
        .split(/\s+/)
        .map((w: string) => w.replace(/[^\w]/g, ""))
        .filter((w: string) => w.length > 2)
    );

    // Score each problem based on keyword matches
    const matches: MatchResult[] = [];

    for (const problem of problems) {
      const keywords = problem.keywords || [];
      const topicTags = problem.topic_tags || [];
      const allKeywords = [...keywords, ...topicTags];

      if (allKeywords.length === 0) continue;

      // Count keyword matches
      const matchedKeywords: string[] = [];
      for (const keyword of allKeywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        
        // Check for exact word match or phrase match
        if (normalizedTranscript.includes(normalizedKeyword)) {
          matchedKeywords.push(keyword);
        } else {
          // Check for word-by-word match for multi-word keywords
          const keywordWords = normalizedKeyword.split(/\s+/);
          const allWordsMatch = keywordWords.every((kw: string) => transcriptWords.has(kw));
          if (allWordsMatch && keywordWords.length > 1) {
            matchedKeywords.push(keyword);
          }
        }
      }

      if (matchedKeywords.length === 0) continue;

      // Calculate confidence score
      // Higher confidence for more keyword matches, weighted by total keywords
      const keywordMatchRatio = matchedKeywords.length / allKeywords.length;
      
      // Boost confidence if problem number is mentioned
      const problemNumber = problem.problem_number?.toLowerCase() || "";
      const mentionsProblemNumber = problemNumber && (
        normalizedTranscript.includes(`problem ${problemNumber}`) ||
        normalizedTranscript.includes(`question ${problemNumber}`) ||
        normalizedTranscript.includes(`number ${problemNumber}`)
      );
      
      let confidence = keywordMatchRatio * 0.8;
      if (mentionsProblemNumber) {
        confidence += 0.2;
      }
      
      // Cap at 1.0
      confidence = Math.min(confidence, 1.0);

      if (confidence >= min_confidence) {
        // Check for verified MCQ
        const verifiedMcqs = problem.answer_key_mcqs?.filter((m: any) => m.verified) || [];
        const hasVerifiedMcq = verifiedMcqs.length > 0;
        const mcqId = hasVerifiedMcq ? verifiedMcqs[0].id : null;

        matches.push({
          problem_id: problem.id,
          problem_number: problem.problem_number || "Unknown",
          problem_text: problem.problem_text,
          final_answer: `${problem.final_answer}${problem.units ? ` ${problem.units}` : ""}`,
          confidence: Math.round(confidence * 1000) / 1000,
          matched_keywords: matchedKeywords,
          has_verified_mcq: hasVerifiedMcq,
          mcq_id: mcqId,
        });
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    console.log(`Found ${matches.length} matching problems above confidence threshold ${min_confidence}`);

    return new Response(JSON.stringify({
      matches,
      transcript_length: transcript.length,
      problems_checked: problems.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in match-transcript-to-problem function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
