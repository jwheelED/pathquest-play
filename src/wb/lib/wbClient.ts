/**
 * Dedicated Supabase client for the whiteboard demo module.
 *
 * Typed with the module's own WbDatabase so queries to whiteboard_* tables are
 * fully typed without editing the generated types.ts. Uses the same project
 * URL / publishable key as the main app but does not persist a session (the
 * demo uses seeded identities, not Supabase Auth).
 */
import { createClient } from "@supabase/supabase-js";
import type { WbDatabase } from "./wbTypes";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const wb = createClient<WbDatabase>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Invoke a whiteboard edge function through the same gateway. */
export async function wbInvoke<T>(fn: string, payload: unknown): Promise<T> {
  const { data, error } = await wb.functions.invoke(fn, { body: payload });
  if (error) throw error;
  return data as T;
}

/**
 * Raw fetch to an edge function, bypassing functions.invoke — needed for
 * binary bodies (an uploaded audio Blob) or binary responses (synthesized
 * audio), where invoke's JSON-oriented content negotiation doesn't apply.
 * Supports an AbortSignal so an in-flight voice turn can be cancelled
 * (barge-in: a new mic tap cancels whatever is still in flight).
 */
async function wbFetchRaw(
  fn: string,
  init: { body: BodyInit; contentType: string; signal?: AbortSignal },
): Promise<Response> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": init.contentType,
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: init.body,
    signal: init.signal,
  });
  return res;
}

/** POST a binary body (e.g. a recorded audio Blob) and parse a JSON result. */
export async function wbInvokeBinary<T>(
  fn: string,
  body: Blob,
  signal?: AbortSignal,
): Promise<T> {
  const res = await wbFetchRaw(fn, {
    body,
    contentType: body.type || "application/octet-stream",
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** POST JSON and parse a JSON result, with abort support (for barge-in). */
export async function wbFetchJson<T>(
  fn: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await wbFetchRaw(fn, {
    body: JSON.stringify(payload),
    contentType: "application/json",
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** POST JSON and get back a binary (audio) response as a Blob. */
export async function wbFetchAudio(
  fn: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await wbFetchRaw(fn, {
    body: JSON.stringify(payload),
    contentType: "application/json",
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  }
  return res.blob();
}
