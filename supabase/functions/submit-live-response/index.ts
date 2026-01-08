import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: 20 submissions per IP per minute
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRequestCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    ipRequestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  record.count++;
  return true;
}

// Get client IP from request headers
function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         req.headers.get('x-real-ip') || 
         'unknown';
}

// Validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Calculate points based on correctness and confidence
function calculatePoints(
  isCorrect: boolean,
  confidenceLevel: string | null,
  confidenceMultiplier: number,
  baseReward: number
): number {
  if (!confidenceLevel) {
    // No confidence betting - just return base reward or 0
    return isCorrect ? baseReward : 0;
  }

  if (isCorrect) {
    // Correct answer: multiply base reward by confidence multiplier
    return Math.round(baseReward * confidenceMultiplier);
  } else {
    // Wrong answer: penalty based on confidence level
    switch (confidenceLevel) {
      case 'low':
        // Small penalty for playing it safe
        return -Math.round(baseReward * 0.25);
      case 'medium':
        // No penalty for medium confidence
        return 0;
      case 'high':
      case 'very_high':
        // Bigger penalty for high confidence wrong answers
        return -Math.round(baseReward * confidenceMultiplier * 0.5);
      default:
        return 0;
    }
  }
}

// Simple similarity calculation for fallback
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Word-level matching
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) {
    // Character-level for short answers
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    return longer.includes(shorter) ? 0.8 : 0;
  }
  
  let matches = 0;
  for (const word of words1) {
    if (words2.has(word)) matches++;
  }
  
  return matches / Math.max(words1.size, words2.size);
}

// AI grading for short answer questions
async function gradeShortAnswer(
  studentAnswer: string,
  expectedAnswer: string,
  questionText: string
): Promise<{ grade: number; feedback: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, using fallback grading");
    const similarity = calculateSimilarity(studentAnswer, expectedAnswer);
    const grade = Math.round(similarity * 100);
    return {
      grade,
      feedback: grade >= 70 ? "Answer matches expected content." : "Answer differs from expected."
    };
  }

  const systemPrompt = `You are a fast educational grader for live classroom responses. Compare the student's answer to the expected answer.

GRADING CRITERIA:
- Accept equivalent meanings and different wording that conveys the same concept
- Don't penalize minor spelling or grammar errors
- Focus on whether key concepts are present
- Award partial credit generously for partial understanding
- Consider synonyms and paraphrasing as correct

Return a grade from 0-100 and brief feedback (1-2 sentences max).`;

  const userPrompt = `Question: ${questionText}
Expected Answer: ${expectedAnswer}
Student Answer: ${studentAnswer}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "grade_answer",
            description: "Grade the student's short answer response",
            parameters: {
              type: "object",
              properties: {
                grade: {
                  type: "number",
                  description: "Grade from 0-100"
                },
                feedback: {
                  type: "string",
                  description: "Brief feedback (1-2 sentences)"
                }
              },
              required: ["grade", "feedback"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "grade_answer" } },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("AI grading API error:", response.status);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return {
        grade: Math.min(100, Math.max(0, result.grade)),
        feedback: result.feedback || ""
      };
    }
    
    throw new Error("Invalid AI response format");
  } catch (error) {
    console.error("AI grading failed, using fallback:", error);
    const similarity = calculateSimilarity(studentAnswer, expectedAnswer);
    const grade = Math.round(similarity * 100);
    return {
      grade,
      feedback: grade >= 70 ? "Answer matches expected content." : "Answer differs from expected."
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check rate limit
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP)) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { 
      questionId, 
      participantId, 
      answer, 
      responseTimeMs,
      confidenceLevel,
      confidenceMultiplier,
      baseReward 
    } = await req.json();

    // Input validation
    if (!questionId || !participantId || !answer) {
      return new Response(
        JSON.stringify({ error: 'Question ID, participant ID, and answer are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID formats
    if (!isValidUUID(questionId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid question ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUUID(participantId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid participant ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate answer length (max 5000 characters)
    if (typeof answer !== 'string' || answer.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'Answer must be a string of 5000 characters or less' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate confidence level if provided
    const validConfidenceLevels = ['low', 'medium', 'high', 'very_high'];
    if (confidenceLevel && !validConfidenceLevels.includes(confidenceLevel)) {
      return new Response(
        JSON.stringify({ error: 'Invalid confidence level' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate confidence multiplier if provided
    const safeMultiplier = typeof confidenceMultiplier === 'number' && 
                          confidenceMultiplier >= 0.5 && 
                          confidenceMultiplier <= 3 
                          ? confidenceMultiplier : 1;

    // Validate base reward if provided
    const safeBaseReward = typeof baseReward === 'number' && 
                          baseReward >= 0 && 
                          baseReward <= 100 
                          ? baseReward : 10;

    // Validate response time if provided
    const safeResponseTimeMs = typeof responseTimeMs === 'number' && 
                               responseTimeMs >= 0 && 
                               responseTimeMs <= 300000 
                               ? responseTimeMs : null;

    // Get question to check correct answer
    const { data: question, error: questionError } = await supabaseClient
      .from('live_questions')
      .select('question_content')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      return new Response(
        JSON.stringify({ error: 'Question not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify participant exists
    const { data: participant, error: participantError } = await supabaseClient
      .from('live_participants')
      .select('id, session_id')
      .eq('id', participantId)
      .single();

    if (participantError || !participant) {
      return new Response(
        JSON.stringify({ error: 'Participant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already answered
    const { data: existing } = await supabaseClient
      .from('live_responses')
      .select('id')
      .eq('question_id', questionId)
      .eq('participant_id', participantId)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Already answered this question' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const correctAnswer = question.question_content.correctAnswer || question.question_content.correct_answer;
    const questionType = question.question_content.type;
    const questionText = question.question_content.question || "";
    
    let isCorrect = false;
    let aiGrade: number | null = null;
    let aiFeedback: string | null = null;
    let studentAnswer = answer;
    
    if (questionType === "multiple_choice") {
      // For MCQ: Extract letter prefix from answer (e.g., "A. Some text" → "A")
      if (typeof answer === "string") {
        const letterMatch = answer.match(/^([A-D])\./);
        if (letterMatch) {
          studentAnswer = letterMatch[1]; // Just the letter
        }
      }
      // Compare (now: "C" === "C" = TRUE!)
      isCorrect = studentAnswer === correctAnswer;
    } else if (questionType === "short_answer") {
      // For short answer: Use AI grading
      console.log(`AI grading short answer: "${answer}" vs expected "${correctAnswer}"`);
      const gradeResult = await gradeShortAnswer(answer, correctAnswer, questionText);
      aiGrade = gradeResult.grade;
      aiFeedback = gradeResult.feedback;
      isCorrect = aiGrade >= 70; // 70%+ = correct
      console.log(`AI grade: ${aiGrade}, feedback: ${aiFeedback}, isCorrect: ${isCorrect}`);
    } else {
      // Default fallback for unknown types
      isCorrect = studentAnswer === correctAnswer;
    }
    
    // Calculate points earned based on confidence
    const pointsEarned = calculatePoints(
      isCorrect,
      confidenceLevel || null,
      safeMultiplier,
      safeBaseReward
    );
    
    // Add logging for debugging
    console.log(`Grading: student answered "${studentAnswer}", correct answer is "${correctAnswer}", result: ${isCorrect}`);
    console.log(`Confidence: ${confidenceLevel}, multiplier: ${safeMultiplier}, points earned: ${pointsEarned}`);

    // Submit response with confidence data and AI grading info
    const { data: response, error: responseError } = await supabaseClient
      .from('live_responses')
      .insert({
        question_id: questionId,
        participant_id: participantId,
        answer,
        is_correct: isCorrect,
        response_time_ms: safeResponseTimeMs,
        confidence_level: confidenceLevel || null,
        confidence_multiplier: safeMultiplier,
        points_earned: pointsEarned,
        ai_grade: aiGrade,
        ai_feedback: aiFeedback,
      })
      .select()
      .single();

    if (responseError) {
      console.error('Error submitting response:', responseError);
      return new Response(
        JSON.stringify({ error: 'Failed to submit response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        response, 
        isCorrect, 
        pointsEarned,
        aiGrade,
        aiFeedback
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in submit-live-response:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});