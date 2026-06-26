import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkJoinRateLimit, type RateState } from "../_shared/joinRateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Abuse controls (BE-AP-6) ─────────────────────────────────────────────────
// Per-IP rate limit. Deliberately generous: a whole lecture hall often shares
// one campus-NAT public IP, so a strict "5/min" would lock out a legitimate
// class. This value still stops a script registering thousands in seconds; the
// per-session cap below is the real backstop.
const joinRateStore = new Map<string, RateState>();
const MAX_JOINS_PER_IP = 30;
const JOIN_WINDOW_MS = 60_000; // 1 minute

// Hard ceiling on participants per session. A leaked 6-digit code can't inflate
// the presenter view / poll aggregates beyond this.
const MAX_PARTICIPANTS_PER_SESSION = 500;

// Defensive bound on nickname length.
const MAX_NICKNAME_LENGTH = 50;

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('cf-connecting-ip') ||
         req.headers.get('x-real-ip') ||
         'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1) Rate-limit by IP before doing any DB work.
    const clientIP = getClientIP(req);
    const rate = checkJoinRateLimit(joinRateStore, clientIP, Date.now(), {
      maxPerWindow: MAX_JOINS_PER_IP,
      windowMs: JOIN_WINDOW_MS,
    });
    if (!rate.allowed) {
      console.warn(`⛔ Join rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many join attempts. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { sessionCode, nickname } = await req.json();

    if (!sessionCode || !nickname || !nickname.trim()) {
      return new Response(
        JSON.stringify({ error: 'sessionCode and nickname are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Intentionally NOT enforcing nickname uniqueness — two students may
    // legitimately pick the same display name. Identity rests on the
    // server-generated participant id (a UUID), never the nickname.
    const cleanNickname = nickname.trim().slice(0, MAX_NICKNAME_LENGTH);

    // Find active session by code
    const { data: session, error: sessionError } = await adminClient
      .from('live_sessions')
      .select('id, is_active, ends_at')
      .eq('session_code', sessionCode)
      .maybeSingle();

    if (sessionError) {
      console.error('Error finding session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to find session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Session not found. Check the code and try again.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Honor both the explicit active flag and the expiry timestamp so a stale
    // code can't be used after the session window closes (expiring codes).
    const expired = session.ends_at ? new Date(session.ends_at).getTime() < Date.now() : false;
    if (!session.is_active || expired) {
      return new Response(
        JSON.stringify({ error: 'This session has ended.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enforce the per-session participant cap. (A small over-count is possible
    // under concurrent joins; that's acceptable for an abuse ceiling.)
    const { count, error: countError } = await adminClient
      .from('live_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);

    if (!countError && (count ?? 0) >= MAX_PARTICIPANTS_PER_SESSION) {
      console.warn(`⛔ Session ${session.id} at capacity (${count}) — rejecting join from ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'This session is full.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert participant (id is a server-generated UUID).
    const { data: participant, error: insertError } = await adminClient
      .from('live_participants')
      .insert({
        session_id: session.id,
        nickname: cleanNickname,
      })
      .select('id, nickname')
      .single();

    if (insertError) {
      console.error('Error inserting participant:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to join session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ participant }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
