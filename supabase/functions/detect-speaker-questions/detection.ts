// Thin re-export of the canonical detection module so existing imports
// (`./detection`) keep resolving. All logic lives in
// `supabase/functions/_shared/questionDetection.ts`.
export * from "../_shared/questionDetection.ts";
