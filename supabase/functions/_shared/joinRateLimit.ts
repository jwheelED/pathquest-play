// Pure, in-memory per-IP rate-limit logic for the anonymous join endpoint.
// Shared by `join-live-session` and its tests. Mirrors the deepgram-streaming
// pattern but parameterized so it can be unit-tested via vitest.
//
// NOTE: state lives in a per-isolate Map — it resets on cold start and is NOT
// shared across isolates. It throttles rapid-fire abuse hitting one warm
// isolate; the per-session participant CAP (enforced via a DB count) is the
// durable backstop against a leaked code being used to flood a session.

export interface RateState {
  count: number;
  resetTime: number;
}

export interface RateOptions {
  /** Max allowed joins per IP within the window. */
  maxPerWindow: number;
  /** Rolling window length in ms. */
  windowMs: number;
}

/**
 * Records one join attempt for `ip` and reports whether it is allowed.
 * A fresh IP (or an expired window) resets the counter. Pure aside from
 * mutating the passed-in `store`, which the caller owns.
 */
export function checkJoinRateLimit(
  store: Map<string, RateState>,
  ip: string,
  now: number,
  opts: RateOptions,
): { allowed: boolean } {
  const record = store.get(ip);

  if (!record || now > record.resetTime) {
    store.set(ip, { count: 1, resetTime: now + opts.windowMs });
    return { allowed: true };
  }

  if (record.count >= opts.maxPerWindow) {
    return { allowed: false };
  }

  record.count++;
  return { allowed: true };
}
