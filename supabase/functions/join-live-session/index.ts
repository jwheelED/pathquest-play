import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RateState } from "../_shared/joinRateLimit.ts";
import { createLogger } from "../_shared/log.ts";
import { initSentry } from "../_shared/sentry.ts";
import { handleJoin, type JoinAuthUser, type JoinLimits } from "./handler.ts";

// Initialize Sentry once at cold start (no-op unless SENTRY_DSN is set).
initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Abuse controls (BE-AP-6). Generous per-IP limit because a lecture hall often
// shares one campus-NAT public IP; the per-session cap is the real backstop.
const joinRateStore = new Map<string, RateState>();
const LIMITS: JoinLimits = {
  maxJoinsPerIp: 30,
  joinWindowMs: 60_000,
  maxParticipants: 500,
  maxNicknameLength: 50,
};

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('cf-connecting-ip') ||
         req.headers.get('x-real-ip') ||
         'unknown';
}

// Optional account link: when the caller sends a valid user JWT, resolve the
// account so the participant row can be tied to it (live answer history).
// Guests call without a token and stay anonymous — a bad token never blocks a
// join, it just falls back to anonymous.
async function resolveAuthUser(
  req: Request,
  admin: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>,
): Promise<JoinAuthUser | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', data.user.id)
      .maybeSingle();
    return { id: data.user.id, displayName: profile?.full_name ?? null };
  } catch (e) {
    log.warn('auth user resolution failed; joining anonymously', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clientIp = getClientIP(req);
  const log = createLogger({ operation: 'join-live-session', client_ip: clientIp });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json().catch(() => ({}));
    const authUser = await resolveAuthUser(req, admin, log);

    const { status, body: respBody } = await handleJoin(
      { body, clientIp, now: Date.now(), authUser },
      { admin, rateStore: joinRateStore, limits: LIMITS, log },
    );

    return new Response(JSON.stringify(respBody), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
