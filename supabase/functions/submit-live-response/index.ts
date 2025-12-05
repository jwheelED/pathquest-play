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
    
    // For MCQ: Extract letter prefix from answer (e.g., "A. Some text" → "A")
    let studentAnswer = answer;
    if (question.question_content.type === "multiple_choice" && typeof answer === "string") {
      // Extract just the letter if answer starts with "A.", "B.", "C.", or "D."
      const letterMatch = answer.match(/^([A-D])\./);
      if (letterMatch) {
        studentAnswer = letterMatch[1]; // Just the letter
      }
    }
    
    // Compare (now: "C" === "C" = TRUE!)
    const isCorrect = studentAnswer === correctAnswer;
    
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

    // Submit response with confidence data
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
      JSON.stringify({ response, isCorrect, pointsEarned }),
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
