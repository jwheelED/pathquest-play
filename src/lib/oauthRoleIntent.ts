// Carries the portal the user came from across the Google OAuth round-trip.
// The `role` value cannot be sent through Supabase user metadata for OAuth
// sign-ups, so we persist the intent locally and read it back on return.
export type OAuthRoleIntent = 'instructor' | 'admin';

const STORAGE_KEY = 'edvana:oauth_role_intent';
const INTENT_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredIntent {
  role: OAuthRoleIntent;
  at: number;
}

export function setOAuthRoleIntent(role: OAuthRoleIntent): void {
  try {
    const payload: StoredIntent = { role, at: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage unavailable (private mode) — rescue simply won't apply
  }
}

export function readOAuthRoleIntent(): OAuthRoleIntent | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIntent;
    if (!parsed?.role || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > INTENT_TTL_MS) {
      clearOAuthRoleIntent();
      return null;
    }
    return parsed.role;
  } catch {
    return null;
  }
}

export function clearOAuthRoleIntent(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
