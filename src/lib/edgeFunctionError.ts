/**
 * supabase-js throws a FunctionsHttpError for any non-2xx edge function
 * response and gives back `data: null`, so the JSON body the function
 * carefully returned (error_type, retry_after, quota info…) is lost and the
 * UI only ever sees "Edge Function returned a non-2xx status code".
 *
 * This helper pulls the status + parsed body back out of the error so callers
 * can keep their structured error handling.
 */
export interface EdgeFunctionErrorDetails {
  status?: number;
  body?: Record<string, unknown> | null;
  message?: string;
}

export async function readEdgeFunctionError(
  error: unknown,
): Promise<EdgeFunctionErrorDetails> {
  const details: EdgeFunctionErrorDetails = {};
  if (!error || typeof error !== 'object') return details;

  const context = (error as { context?: unknown }).context;

  if (typeof Response !== 'undefined' && context instanceof Response) {
    details.status = context.status;
    try {
      const text = await context.clone().text();
      if (text) {
        try {
          details.body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          details.message = text.slice(0, 300);
        }
      }
    } catch {
      // body already consumed / unreadable — status is still useful
    }
  } else if (context && typeof context === 'object') {
    const status = (context as { status?: number }).status;
    if (typeof status === 'number') details.status = status;
  }

  if (details.status === undefined) {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') details.status = status;
  }

  if (!details.message && details.body && typeof details.body.error === 'string') {
    details.message = details.body.error;
  }

  return details;
}
