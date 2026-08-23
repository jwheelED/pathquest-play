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
