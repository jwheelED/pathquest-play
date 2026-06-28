import { checkJoinRateLimit, type RateState } from "../_shared/joinRateLimit.ts";
import type { SupabaseLike, LoggerLike, HandlerResult } from "../_shared/handlerTypes.ts";

// Pure request handler for join-live-session, decoupled from Deno.serve and the
// real Supabase client so it can be unit-tested (audit EV-012). The index.ts
// shell injects the admin client, the rate-limit store, limits, and a logger.

export interface JoinLimits {
  maxJoinsPerIp: number;
  joinWindowMs: number;
  maxParticipants: number;
  maxNicknameLength: number;
}

export interface JoinDeps {
  admin: SupabaseLike;
  rateStore: Map<string, RateState>;
  limits: JoinLimits;
  log?: LoggerLike;
}

export async function handleJoin(
  input: { body: { sessionCode?: string; nickname?: string } | null; clientIp: string; now: number },
  deps: JoinDeps,
): Promise<HandlerResult> {
  const { body, clientIp, now } = input;
  const { admin, rateStore, limits, log } = deps;

  // 1) Rate-limit by IP before any DB work.
  const rate = checkJoinRateLimit(rateStore, clientIp, now, {
    maxPerWindow: limits.maxJoinsPerIp,
    windowMs: limits.joinWindowMs,
  });
  if (!rate.allowed) {
    log?.warn("join rate limit exceeded", { error_category: "rate_limited", success: false });
    return { status: 429, body: { error: "Too many join attempts. Please wait a moment and try again." } };
  }

  const sessionCode = body?.sessionCode;
  const nickname = body?.nickname;
  if (!sessionCode || !nickname || !nickname.trim()) {
    log?.info("join rejected: missing fields", { error_category: "bad_request", success: false });
    return { status: 400, body: { error: "sessionCode and nickname are required" } };
  }

  // Nickname uniqueness intentionally NOT enforced — identity is the
  // server-generated participant id, never the nickname.
  const cleanNickname = nickname.trim().slice(0, limits.maxNicknameLength);

  const { data: session, error: sessionError } = await admin
    .from("live_sessions")
    .select("id, is_active, ends_at")
    .eq("session_code", sessionCode)
    .maybeSingle();

  if (sessionError) {
    log?.error("session lookup failed", { error_category: "db_session_lookup", success: false });
    return { status: 500, body: { error: "Failed to find session" } };
  }
  if (!session) {
    log?.info("join rejected: session not found", { error_category: "not_found", success: false });
    return { status: 404, body: { error: "Session not found. Check the code and try again." } };
  }

  const slog = log?.child?.({ session_id: session.id }) ?? log;

  const expired = session.ends_at ? new Date(session.ends_at).getTime() < now : false;
  if (!session.is_active || expired) {
    slog?.info("join rejected: session ended", { error_category: "session_ended", expired, success: false });
    return { status: 400, body: { error: "This session has ended." } };
  }

  // Per-session participant cap (small over-count under concurrency is fine).
  const { count, error: countError } = await admin
    .from("live_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id);

  if (!countError && (count ?? 0) >= limits.maxParticipants) {
    slog?.warn("join rejected: session at capacity", { error_category: "session_full", count, success: false });
    return { status: 403, body: { error: "This session is full." } };
  }

  const { data: participant, error: insertError } = await admin
    .from("live_participants")
    .insert({ session_id: session.id, nickname: cleanNickname })
    .select("id, nickname")
    .single();

  if (insertError) {
    slog?.error("participant insert failed", { error_category: "db_insert", success: false });
    return { status: 500, body: { error: "Failed to join session" } };
  }

  slog?.info("participant joined", { participant_id: participant.id, success: true });
  return { status: 200, body: { participant } };
}
