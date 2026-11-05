import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { logger } from "@/lib/logger";

interface LiveResponseRow {
  id: string;
  answer: string;
  is_correct: boolean;
  confidence_level: string | null;
  ai_grade: number | null;
  ai_feedback: string | null;
  points_earned: number | null;
  responded_at: string;
  live_questions: {
    question_number: number;
    image_url: string | null;
    image_status: string | null;
    question_content: { question?: string; correctAnswer?: string; type?: string } | null;
  } | null;
}

interface ParticipationRow {
  id: string;
  joined_at: string;
  session_id: string;
  live_sessions: { title: string | null; session_code: string | null; created_at: string } | null;
  live_responses: LiveResponseRow[];
}

const CONFIDENCE_LABELS: Record<string, string> = {
  "0.5": "Not sure",
  "1": "Fairly sure",
  "2": "Confident",
  "3": "Absolutely sure",
};

function confidenceLabel(raw: string | null): string | null {
  if (!raw) return null;
  return CONFIDENCE_LABELS[raw] ?? null;
}

/**
 * Permanent history of a signed-in student's live session answers — every
 * question they answered in any live session, with correctness, confidence,
 * and AI feedback. Reads live_responses through the participant's account
 * link (live_participants.user_id); anonymous guest answers never appear here.
 */
export function LiveSessionHistory() {
  const [rows, setRows] = useState<ParticipationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          setLoading(false);
          return;
        }
        const { data, error } = await (supabase.from("live_participants") as any)
          .select(
            "id, joined_at, session_id, " +
              "live_sessions(title, session_code, created_at), " +
              "live_responses(id, answer, is_correct, confidence_level, ai_grade, ai_feedback, points_earned, responded_at, " +
              "live_questions(question_number, question_content, image_url, image_status))",
          )
          .eq("user_id", authData.user.id)
          .order("joined_at", { ascending: false })
          .limit(20);
        if (cancelled) return;
        if (error) {
          logger.warn("Live session history lookup failed", error.message);
          setRows([]);
        } else {
          setRows(((data as ParticipationRow[]) ?? []).filter((r) => r.live_responses?.length > 0));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || rows.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Live session history">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Radio className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Live session history
      </h2>

      {rows.map((row) => {
        const answered = row.live_responses.length;
        const correct = row.live_responses.filter((r) => r.is_correct).length;
        const sessionTitle = row.live_sessions?.title || "Live session";
        const when = new Date(row.live_sessions?.created_at ?? row.joined_at).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric", year: "numeric" },
        );
        return (
          <Card key={row.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{sessionTitle}</p>
                <p className="text-xs text-muted-foreground">{when}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {correct}/{answered} correct
              </Badge>
            </div>

            <ul className="space-y-2">
              {row.live_responses
                .slice()
                .sort(
                  (a, b) =>
                    (a.live_questions?.question_number ?? 0) - (b.live_questions?.question_number ?? 0),
                )
                .map((resp) => {
                  const q = resp.live_questions?.question_content;
                  const confidence = confidenceLabel(resp.confidence_level);
                  return (
                    <li
                      key={resp.id}
                      className="rounded-lg border border-border bg-background p-3 space-y-1.5"
                    >
                      <div className="flex items-start gap-2">
                        {resp.is_correct ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-label="Correct" />
                        ) : resp.answer ? (
                          <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" aria-label="Incorrect" />
                        ) : (
                          <MinusCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-label="No answer" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            <span className="text-muted-foreground mr-1">
                              Q{resp.live_questions?.question_number ?? "?"}
                            </span>
                            {q?.question ?? "Question"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your answer: <span className="text-foreground">{resp.answer || "—"}</span>
                            {!resp.is_correct && q?.correctAnswer ? (
                              <>
                                {" · "}Correct answer:{" "}
                                <span className="text-emerald-700">{q.correctAnswer}</span>
                              </>
                            ) : null}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {confidence && (
                              <Badge variant="outline" className="text-xs">
                                Confidence: {confidence}
                              </Badge>
                            )}
                            {resp.ai_grade !== null && (
                              <Badge variant="outline" className="text-xs">
                                AI grade: {resp.ai_grade}/100
                              </Badge>
                            )}
                            {resp.points_earned !== null && resp.points_earned > 0 && (
                              <Badge variant="outline" className="text-xs">
                                +{resp.points_earned} XP
                              </Badge>
                            )}
                          </div>
                          {resp.live_questions?.image_status === "ready" && resp.live_questions.image_url && (
                            <img
                              src={resp.live_questions.image_url}
                              alt="Illustration of the correct answer"
                              loading="lazy"
                              className="mt-2 w-full max-w-sm h-32 object-cover rounded-md border border-border"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                          {resp.ai_feedback && (
                            <p className="text-xs text-muted-foreground mt-1.5 italic">
                              {resp.ai_feedback}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Card>
        );
      })}
    </section>
  );
}
