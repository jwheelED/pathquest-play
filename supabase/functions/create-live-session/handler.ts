import type { SupabaseLike, LoggerLike, HandlerResult } from "../_shared/handlerTypes.ts";

// Pure request handler for create-live-session (audit EV-012). Auth is injected
// as `getUser(authHeader)` so the unauthorized path is testable without a real
// Supabase auth client.

export interface CreateDeps {
  admin: SupabaseLike;
  getUser: (authHeader: string) => Promise<{ id: string } | null>;
  log?: LoggerLike;
}

const MAX_CODE_ATTEMPTS = 10;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function handleCreate(
  input: { body: { title?: string; courseId?: string | null } | null; authHeader: string | null },
  deps: CreateDeps,
): Promise<HandlerResult> {
  const { body, authHeader } = input;
  const { admin, getUser, log } = deps;

  if (!authHeader) {
    return { status: 401, body: { error: "Missing authorization header" } };
  }
  const user = await getUser(authHeader);
  if (!user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // Both title and courseId are optional: the "Start Live Class" flow supplies
  // both; the recording auto-session has neither and relies on these defaults.
  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const title = rawTitle || "Recording session";
  const courseId = body?.courseId ?? null;

  // Generate a unique 6-digit code among active sessions.
  let sessionCode = "";
  let attempts = 0;
  do {
    sessionCode = generateCode();
    const { data: existing } = await admin
      .from("live_sessions")
      .select("id")
      .eq("session_code", sessionCode)
      .eq("is_active", true)
      .maybeSingle();
    if (!existing) break;
    attempts++;
  } while (attempts < MAX_CODE_ATTEMPTS);

  if (attempts >= MAX_CODE_ATTEMPTS) {
    log?.error("failed to generate unique session code", { error_category: "code_collision" });
    return { status: 500, body: { error: "Failed to generate unique session code" } };
  }

  const { data: session, error: insertError } = await admin
    .from("live_sessions")
    .insert({
      title,
      session_code: sessionCode,
      instructor_id: user.id,
      course_id: courseId,
      is_active: true,
    })
    .select()
    .single();

  if (insertError) {
    log?.error("session insert failed", { error_category: "db_insert", instructor_id: user.id });
    return { status: 500, body: { error: "Failed to create session" } };
  }

  return { status: 200, body: { session } };
}
