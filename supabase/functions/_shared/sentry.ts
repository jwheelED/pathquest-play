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
 * Forward a message to Sentry. Guarded on `SENTRY_DSN` and wrapped so alerting
 * can never throw into the request path. `ctx` MUST NOT include student answers
 * or other sensitive content. Used by `_shared/log.ts` for warn/error lines.
 */
export function captureMessage(
  message: string,
  level: "warning" | "error" = "error",
  ctx?: Record<string, unknown>,
): void {
  if (!Deno.env.get("SENTRY_DSN")) return;
  try {
    Sentry.captureMessage(message, { level, extra: ctx });
  } catch (_) {
    // Swallow — alerting is best-effort.
  }
}

/**
 * Report a partial question-delivery (some students in the cohort never got a
 * row). Thin wrapper over {@link captureMessage} kept for call-site clarity.
 */
export function capturePartialDelivery(ctx: Record<string, unknown>): void {
  captureMessage("question delivery partial_failure", "error", ctx);
}
