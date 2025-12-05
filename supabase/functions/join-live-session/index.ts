import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: 10 joins per IP per minute
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 10;
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

    const { sessionCode, nickname } = await req.json();

    console.log(`join-live-session: Attempting to join with code: ${sessionCode}, nickname: ${nickname}`);

    // Input validation
    if (!sessionCode || !nickname) {
      return new Response(
        JSON.stringify({ error: 'Session code and nickname are required' }),
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

    // Validate nickname (1-50 characters, alphanumeric and basic punctuation only)
    if (nickname.length < 1 || nickname.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Nickname must be 1-50 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize nickname - only allow safe characters
    const sanitizedNickname = nickname.replace(/[<>\"'&]/g, '').trim();
    if (sanitizedNickname.length < 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid nickname' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session exists and is active
    const { data: session, error: sessionError } = await supabaseClient
      .from('live_sessions')
      .select('id, is_active, ends_at, session_code')
      .eq('session_code', sessionCode)
      .eq('is_active', true)
      .single();

    console.log(`join-live-session: Query result - session:`, session, 'error:', sessionError);

    if (sessionError || !session) {
      console.error(`join-live-session: Session not found or inactive for code: ${sessionCode}`);
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive session code' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if session has expired
    if (new Date(session.ends_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Session has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check participant limit (max 500 per session)
    const { count: participantCount } = await supabaseClient
      .from('live_participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.id);

    if (participantCount && participantCount >= 500) {
      return new Response(
        JSON.stringify({ error: 'Session is full' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create participant with sanitized nickname
    const { data: participant, error: participantError } = await supabaseClient
      .from('live_participants')
      .insert({
        session_id: session.id,
        nickname: sanitizedNickname,
      })
      .select()
      .single();

    if (participantError) {
      console.error('Error creating participant:', participantError);
      return new Response(
        JSON.stringify({ error: 'Failed to join session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Participant ${sanitizedNickname} joined session ${sessionCode}`);

    return new Response(
      JSON.stringify({ participant, session }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in join-live-session:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
