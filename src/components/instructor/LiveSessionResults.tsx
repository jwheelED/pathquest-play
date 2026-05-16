import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle,
  XCircle,
  Users,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MathRenderer } from "@/components/ui/math-renderer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { MCQResultsReveal } from "./MCQResultsReveal";

interface LiveResponse {
  id: string;
  participant_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  responded_at: string;
  response_time_ms: number | null;
  ai_grade: number | null;
  ai_feedback: string | null;
  confidence_level: string | null;
  points_earned: number | null;
}

interface LiveQuestion {
  id: string;
  question_content: any;
  question_number: number;
  sent_at: string;
}

interface QuestionGroup {
  question: LiveQuestion;
  responses: (LiveResponse & { nickname?: string })[];
  correctCount: number;
  totalResponses: number;
  avgResponseTime: number | null;
}

interface LiveSessionResultsProps {
  sessionId: string;
}

const getRoomSignal = (
  correctPct: number,
  totalResponses: number
): {
  label: string;
  description: string;
  tone: "waiting" | "good" | "mid" | "low";
} => {
  if (totalResponses === 0)
    return { label: "Waiting", description: "No responses yet", tone: "waiting" };
  if (correctPct >= 85)
    return { label: "Move on", description: "Room has this — ready to advance", tone: "good" };
  if (correctPct >= 60)
    return { label: "Solid", description: "Most of the room got this", tone: "good" };
  if (correctPct >= 40)
    return { label: "Split room", description: "Consider revisiting this concept", tone: "mid" };
  return { label: "Revisit", description: "Room is struggling — pause and clarify", tone: "low" };
};

const resolveAnswerToFullText = (answer: string, questionContent: any): string => {
  const options: string[] = questionContent?.options || [];
  if (!options.length) return answer;
  const trimmed = answer.trim();
  const letterMatch = trimmed.match(/^([A-Da-d])\.?\s*$/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return options[idx];
  }
  return answer;
};

const toneStyles = {
  waiting: {
    card: "bg-slate-50 border-slate-200",
    label: "text-slate-500",
    badge: "bg-transparent border-slate-300 text-slate-500",
  },
  good: {
    card: "bg-emerald-50/50 border-emerald-200/60",
    label: "text-emerald-700",
    badge: "bg-emerald-100 border-emerald-300 text-emerald-700",
  },
  mid: {
    card: "bg-amber-50/50 border-amber-200/60",
    label: "text-amber-700",
    badge: "bg-amber-100 border-amber-300 text-amber-700",
  },
  low: {
    card: "bg-rose-50/50 border-rose-200/60",
    label: "text-rose-700",
    badge: "bg-rose-100 border-rose-300 text-rose-700",
  },
};

const progressBarColor = {
  waiting: "bg-slate-300",
  good: "bg-emerald-500",
  mid: "bg-amber-400",
  low: "bg-rose-400",
};

const ExpandableResponseRow = ({
  response,
  fullAnswer,
  isLong,
}: {
  response: LiveResponse & { nickname?: string };
  fullAnswer: string;
  isLong: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-2 px-1 border-b border-border/40 last:border-0 text-sm transition-colors",
        isLong ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"
      )}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      {response.is_correct ? (
        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
      )}
      <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-600 shrink-0">
        {(response.nickname || "?").charAt(0).toUpperCase()}
      </div>
      <span className="text-xs font-medium text-muted-foreground w-20 truncate shrink-0">
        {response.nickname}
      </span>
      <span className={cn("flex-1 min-w-0 text-xs text-foreground", !expanded && "truncate")}>
        {fullAnswer}
      </span>
      {isLong && (
        expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )
      )}
      {response.confidence_level && (
        <Badge variant="outline" className="text-[10px] shrink-0 border-slate-300 text-slate-500">
          {response.confidence_level}
        </Badge>
      )}
      {response.response_time_ms && (
        <span className="text-xs text-muted-foreground shrink-0">
          {(response.response_time_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
};

export const LiveSessionResults = ({ sessionId }: LiveSessionResultsProps) => {
  const [questionGroups, setQuestionGroups] = useState<QuestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filters, setFilters] = useState<Record<string, number | null>>({});
  const [revealKeys, setRevealKeys] = useState<Record<string, number>>({});

  const fetchResults = useCallback(async () => {
    if (!sessionId) return;

    const { data: questions, error: qError } = await supabase
      .from("live_questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sent_at", { ascending: false });

    if (qError || !questions?.length) {
      setQuestionGroups([]);
      setLoading(false);
      return;
    }

    const questionIds = questions.map((q) => q.id);
    const { data: responses } = await supabase
      .from("live_responses")
      .select("*")
      .in("question_id", questionIds)
      .order("responded_at", { ascending: true });

    const { data: participants } = await supabase
      .from("live_participants")
      .select("id, nickname")
      .eq("session_id", sessionId);

    const nicknameMap = new Map(
      participants?.map((p) => [p.id, p.nickname]) || []
    );

    const groups: QuestionGroup[] = questions.map((q) => {
      const qResponses = (responses || [])
        .filter((r) => r.question_id === q.id)
        .map((r) => ({
          ...r,
          nickname: nicknameMap.get(r.participant_id) || "Anonymous",
        }));

      const correctCount = qResponses.filter((r) => r.is_correct).length;
      const responseTimes = qResponses
        .map((r) => r.response_time_ms)
        .filter((t): t is number => t !== null);
      const avgResponseTime =
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : null;

      return { question: q, responses: qResponses, correctCount, totalResponses: qResponses.length, avgResponseTime };
    });

    setQuestionGroups(groups);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [sessionId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Trigger reveal animation the first time a question has any responses.
  useEffect(() => {
    setRevealKeys((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const g of questionGroups) {
        if (g.totalResponses > 0 && next[g.question.id] == null) {
          next[g.question.id] = 1;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [questionGroups]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-results-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_responses" }, () => fetchResults())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_questions", filter: `session_id=eq.${sessionId}` }, () => fetchResults())
      .subscribe();

    const pollInterval = setInterval(fetchResults, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [sessionId, fetchResults]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchResults();
  };

  const formatLastSynced = () => {
    if (!lastUpdated) return "Never";
    const s = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (s < 5) return "Just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  };

  if (loading) {
    return (
      <Card className="border border-border/60 shadow-sm bg-white">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Loading live responses…
        </CardContent>
      </Card>
    );
  }

  if (questionGroups.length === 0) {
    return (
      <Card className="border border-border/60 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Live Room Insight
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-graded performance · Last synced: {formatLastSynced()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 px-3 gap-1.5 text-xs border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-10 text-sm">
          No questions sent yet in this session.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/60 shadow-sm bg-white overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-4 border-b border-border/50 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Live Room Insight
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auto-graded performance · Last synced: {formatLastSynced()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
              {questionGroups.length} question{questionGroups.length !== 1 ? "s" : ""}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 px-3 gap-1.5 text-xs border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{refreshing ? "Syncing…" : "Refresh"}</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-2">
        <Accordion type="multiple" defaultValue={[questionGroups[0]?.question.id]}>
          {questionGroups.map((group) => {
            const correctPct =
              group.totalResponses > 0
                ? Math.round((group.correctCount / group.totalResponses) * 100)
                : 0;

            const questionText =
              typeof group.question.question_content?.question === "string"
                ? group.question.question_content.question
                : group.question.question_content?.question?.title ||
                  `Question #${group.question.question_number}`;

            const roomSignal = getRoomSignal(correctPct, group.totalResponses);
            const tone = roomSignal.tone;
            const styles = toneStyles[tone];

            return (
              <AccordionItem
                key={group.question.id}
                value={group.question.id}
                className="border border-border/50 rounded-lg mb-3 last:mb-0 overflow-hidden shadow-sm"
              >
                <AccordionTrigger className="hover:no-underline py-3 px-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3 text-left flex-1 mr-2">
                    {/* Q# badge — emerald fill */}
                    <Badge className="shrink-0 bg-emerald-600 text-white border-0 hover:bg-emerald-600 text-xs">
                      Q{group.question.question_number}
                    </Badge>
                    <span className="text-sm text-foreground truncate flex-1">
                      {typeof questionText === "string"
                        ? questionText.substring(0, 80)
                        : "Question"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Room signal badge */}
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${styles.badge}`}
                      >
                        {roomSignal.label}
                      </Badge>
                      {/* Response count */}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {group.totalResponses}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3 pt-2">
                    {/* Room signal interpretation */}
                    <div className={`p-3 rounded-lg border ${styles.card}`}>
                      <p className={`text-sm font-medium ${styles.label}`}>
                        {roomSignal.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {correctPct}% correct · {group.correctCount}/{group.totalResponses} responses
                        {group.avgResponseTime
                          ? ` · ${(group.avgResponseTime / 1000).toFixed(1)}s avg`
                          : ""}
                      </p>
                    </div>

                    {/* Accuracy progress bar */}
                    <div>
                      <Progress
                        value={correctPct}
                        className={`h-1.5 [&>div]:${progressBarColor[tone]}`}
                      />
                    </div>

                    {/* Question text */}
                    <div className="p-3 bg-white border border-border/50 rounded-lg text-sm text-foreground">
                      <MathRenderer content={questionText} />
                    </div>

                    {/* Individual responses */}
                    {group.responses.length > 0 ? (
                      <div className="max-h-80 overflow-y-auto border border-border/40 rounded-lg bg-white px-2 py-1">
                        {group.responses.map((r) => {
                          const fullAnswer = resolveAnswerToFullText(
                            r.answer,
                            group.question.question_content
                          );
                          const isLong = fullAnswer.length > 60;
                          return (
                            <ExpandableResponseRow
                              key={r.id}
                              response={r}
                              fullAnswer={fullAnswer}
                              isLong={isLong}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-3">
                        No responses yet
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
};
