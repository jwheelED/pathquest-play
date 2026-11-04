// Structured, request-correlated logging for edge functions (BE-AP-13).
//
// Replaces scattered `console.log("emoji ...")` with single-line JSON records
// that always carry a `request_id` (plus whatever context the caller binds:
// operation, instructor_id, session_id, question_id, duration_ms, success,
// error_category). Grep one request_id to follow a whole flow across log lines.
//
// warn/error are additionally forwarded to Sentry (no-op unless SENTRY_DSN is
// set). NEVER pass student answers or other sensitive content as context.
import { captureMessage } from "./sentry.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  request_id?: string;
  operation?: string;
  instructor_id?: string;
  session_id?: string;
  question_id?: string;
  duration_ms?: number;
  success?: boolean;
  error_category?: string;
  [key: string]: unknown;
}

export interface Logger {
  /** The correlation id stamped on every line from this logger. */
  readonly requestId: string;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  /** Derive a logger that inherits this context and adds more. */
  child(ctx: LogContext): Logger;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Create a request-scoped logger. Pass `request_id` to continue an existing
 * correlation id, otherwise one is generated.
 */
export function createLogger(base: LogContext = {}): Logger {
  const requestId = base.request_id ?? newRequestId();
  const baseCtx: LogContext = { ...base, request_id: requestId };

  function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    const record = { level, msg, ts: new Date().toISOString(), ...baseCtx, ...ctx };
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);

    if (level === "warn" || level === "error") {
      captureMessage(msg, level === "warn" ? "warning" : "error", record);
    }
  }

  return {
    requestId,
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
    child: (c) => createLogger({ ...baseCtx, ...c }),
  };
}
