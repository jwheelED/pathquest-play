import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: 30 requests per IP per minute
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 30;
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

    const url = new URL(req.url);
    const sessionCode = url.searchParams.get('sessionCode');
    const afterTimestamp = url.searchParams.get('after');

    console.log(`📡 get-live-question: Received request for session: ${sessionCode}, after: ${afterTimestamp || 'none'}`);

    // Input validation
    if (!sessionCode) {
      return new Response(
        JSON.stringify({ error: 'Session code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session code format (6 digits)
    if (!/^\d{6}$/.test(sessionCode)) {
      return new Response(
        JSON.stringify({ error: 'Invalid session code format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate afterTimestamp format if provided (ISO 8601)
    if (afterTimestamp && isNaN(Date.parse(afterTimestamp))) {
      return new Response(
        JSON.stringify({ error: 'Invalid timestamp format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get session
    const { data: session, error: sessionError } = await supabaseClient
      .from('live_sessions')
      .select('id, session_code, is_active, ends_at')
      .eq('session_code', sessionCode)
      .eq('is_active', true)
      .single();

    console.log(`🔍 Session lookup result:`, { found: !!session, error: sessionError?.message, session_id: session?.id });

    if (sessionError || !session) {
      console.log(`❌ Session not found or inactive for code: ${sessionCode}`);
      return new Response(
        JSON.stringify({ error: 'Session not found or inactive', sessionCode }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get latest question (or questions after timestamp if provided)
    let query = supabaseClient
      .from('live_questions')
      .select('*')
      .eq('session_id', session.id)
      .order('sent_at', { ascending: false });

    if (afterTimestamp) {
      query = query.gt('sent_at', afterTimestamp);
    } else {
      query = query.limit(1);
    }

    const { data: questions, error: questionsError } = await query;

    if (questionsError) {
      console.error('❌ Error fetching questions:', questionsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Found ${questions?.length || 0} questions for session ${sessionCode}`);

    return new Response(
      JSON.stringify({ questions: questions || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error in get-live-question:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
