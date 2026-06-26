// Minimal, dependency-tolerant Sentry wrapper for edge functions.
//
// Everything is guarded on the `SENTRY_DSN` function secret: if it is not set,
// every call here is a safe no-op so telemetry can never break a delivery.
// Set the secret with:  supabase secrets set SENTRY_DSN="https://...@sentry.io/..."
import * as Sentry from "npm:@sentry/deno";

let inited = false;

/** Idempotent init. Safe to call at the top of every request. */
export function initSentry(): void {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn || inited) return;
  try {
    Sentry.init({ dsn, tracesSampleRate: 0 });
    inited = true;
  } catch (_) {
    // Never let observability setup break the function.
  }
}

/**
 * Report a partial question-delivery (some students in the cohort never got a
 * row). `ctx` should carry enough to find the delivery (instructor, idempotency
 * key, counts) but MUST NOT include student answers or other sensitive content.
 */
export function capturePartialDelivery(ctx: Record<string, unknown>): void {
  if (!Deno.env.get("SENTRY_DSN")) return;
  try {
    Sentry.captureMessage("question delivery partial_failure", {
      level: "error",
      extra: ctx,
    });
  } catch (_) {
    // Swallow — alerting is best-effort.
  }
}
