import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkJoinRateLimit, type RateState } from "../_shared/joinRateLimit.ts";
import { createLogger } from "../_shared/log.ts";
import { initSentry } from "../_shared/sentry.ts";

// Initialize Sentry once at cold start (no-op unless SENTRY_DSN is set).
initSentry();

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

  const startedAt = Date.now();
  const clientIP = getClientIP(req);
  // Request-scoped structured logger. Every line carries this request_id so a
  // single join can be traced end-to-end (BE-AP-13). Never log the nickname or
  // other potentially-sensitive content.
  const log = createLogger({ operation: 'join-live-session', client_ip: clientIP });

  try {
    // 1) Rate-limit by IP before doing any DB work.
    const rate = checkJoinRateLimit(joinRateStore, clientIP, Date.now(), {
      maxPerWindow: MAX_JOINS_PER_IP,
      windowMs: JOIN_WINDOW_MS,
    });
    if (!rate.allowed) {
      log.warn('join rate limit exceeded', { error_category: 'rate_limited', success: false });
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
      log.info('join rejected: missing fields', { error_category: 'bad_request', success: false });
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
      log.error('session lookup failed', { error_category: 'db_session_lookup', success: false });
      return new Response(
        JSON.stringify({ error: 'Failed to find session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session) {
      log.info('join rejected: session not found', { error_category: 'not_found', success: false });
      return new Response(
        JSON.stringify({ error: 'Session not found. Check the code and try again.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Bind the session id so the rest of this flow is correlated to it.
    const slog = log.child({ session_id: session.id });

    // Honor both the explicit active flag and the expiry timestamp so a stale
    // code can't be used after the session window closes (expiring codes).
    const expired = session.ends_at ? new Date(session.ends_at).getTime() < Date.now() : false;
    if (!session.is_active || expired) {
      slog.info('join rejected: session ended', { error_category: 'session_ended', expired, success: false });
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
      slog.warn('join rejected: session at capacity', { error_category: 'session_full', count, success: false });
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
      slog.error('participant insert failed', { error_category: 'db_insert', success: false });
      return new Response(
        JSON.stringify({ error: 'Failed to join session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    slog.info('participant joined', {
      participant_id: participant.id,
      duration_ms: Date.now() - startedAt,
      success: true,
    });
    return new Response(
      JSON.stringify({ participant }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    log.error('unexpected error', {
      error_category: 'unexpected',
      error: error instanceof Error ? error.message : String(error),
      success: false,
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
