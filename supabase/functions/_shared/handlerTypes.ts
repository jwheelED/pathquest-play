// Shared structural types for the testable edge-function handlers (EV-012).
// Kept import-free so handlers stay loadable by vitest (no remote/npm imports).

export interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface LoggerLike {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child?(ctx: Record<string, unknown>): LoggerLike;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}
