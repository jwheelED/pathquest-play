import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Theme {
  label: string;
  count: number;
  response_ids: string[];
  samples: string[];
}

interface Props {
  questionId: string;
  answers: { id: string; answer: string | null }[];
}

/** Regroup after this many new answers, or after REFRESH_MS of quiet. */
const NEW_ANSWERS_TRIGGER = 5;
const REFRESH_MS = 15_000;

/**
 * Poll-style view of ungraded short answers: AI groups them into 3–6 themes.
 * Themes live in live_question_themes (instructor-only) and update in realtime;
 * this component only asks the server to regroup — the server dedups calls.
 */
export function LiveAnswerThemes({ questionId, answers }: Props) {
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const lastGroupedCount = useRef(0);
  const count = answers.filter((a) => (a.answer || "").trim()).length;

  useEffect(() => {
    let alive = true;
    supabase
      .from("live_question_themes" as never)
      .select("themes, response_count")
      .eq("question_id", questionId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { themes: Theme[]; response_count: number } | null;
        if (alive && row) {
          setThemes(row.themes);
          lastGroupedCount.current = row.response_count;
        }
      });
    const channel = supabase
      .channel(`themes-${questionId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_question_themes", filter: `question_id=eq.${questionId}` },
        (payload) => {
          const row = payload.new as { themes?: Theme[]; response_count?: number };
          if (row?.themes) {
            setThemes(row.themes);
            lastGroupedCount.current = row.response_count ?? lastGroupedCount.current;
          }
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [questionId]);

  useEffect(() => {
    if (count < 3 || count === lastGroupedCount.current) return;
    const regroup = async () => {
      setGrouping(true);
      try {
        const { data } = await supabase.functions.invoke("group-live-answers", { body: { questionId } });
        const res = data as { themes?: Theme[]; responseCount?: number } | null;
        if (res?.themes?.length) {
          setThemes(res.themes);
          lastGroupedCount.current = res.responseCount ?? count;
        }
      } catch {
        // keep the last good themes; next change retries
      } finally {
        setGrouping(false);
      }
    };
    const immediate = lastGroupedCount.current === 0 || count - lastGroupedCount.current >= NEW_ANSWERS_TRIGGER;
    const t = setTimeout(regroup, immediate ? 0 : REFRESH_MS);
    return () => clearTimeout(t);
  }, [count, questionId]);

  const total = themes?.reduce((s, t) => s + t.count, 0) || count;

  if (count === 0) {
    return <p className="text-sm text-muted-foreground">No answers yet.</p>;
  }

  if (count < 3 || !themes?.length) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {count >= 3 && grouping ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquareText className="h-3 w-3" />}
          {count < 3 ? "Themes appear once 3 people answer." : "Grouping answers into themes…"}
        </p>
        <ul className="space-y-1.5">
          {answers.filter((a) => a.answer?.trim()).map((a) => (
            <li key={a.id} className="text-sm rounded-md border border-border bg-background px-3 py-2">{a.answer}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        {grouping ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquareText className="h-3 w-3" />}
        Not graded · answers grouped by theme
      </p>
      {themes.map((t) => {
        const pct = total ? Math.round((t.count / total) * 100) : 0;
        const isOpen = open === t.label;
        return (
          <div key={t.label} className="rounded-lg border border-border bg-background">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : t.label)}
              aria-expanded={isOpen}
              className="w-full text-left px-3 py-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{t.label}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                  {t.count} · {pct}%
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </button>
            {isOpen && (
              <ul className="px-3 pb-3 space-y-1">
                {t.samples.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground border-l-2 border-border pl-2">“{s}”</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
