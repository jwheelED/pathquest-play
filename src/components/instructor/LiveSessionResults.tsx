import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, Users, BarChart3, RefreshCw, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MathRenderer } from "@/components/ui/math-renderer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

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

// Interpret room signal from correctness percentage
const getRoomSignal = (correctPct: number, totalResponses: number): { label: string; description: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
  if (totalResponses === 0) return { label: 'Waiting', description: 'No responses yet', variant: 'outline' };
  if (correctPct >= 85) return { label: 'Move on', description: 'Room has this — ready to advance', variant: 'default' };
  if (correctPct >= 60) return { label: 'Solid', description: 'Most of the room got this', variant: 'default' };
  if (correctPct >= 40) return { label: 'Split room', description: 'Consider revisiting this concept', variant: 'secondary' };
  return { label: 'Revisit', description: 'Room is struggling — pause and clarify', variant: 'destructive' };
};

// Resolve a short answer like "A" or "B" to the full option text
const resolveAnswerToFullText = (answer: string, questionContent: any): string => {
  const options: string[] = questionContent?.options || [];
  if (!options.length) return answer;

  const trimmed = answer.trim();
  const letterMatch = trimmed.match(/^([A-Da-d])\.?\s*$/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  const prefixMatch = trimmed.match(/^([A-Da-d])[\.\)]\s+(.+)/);
  if (prefixMatch) {
    return trimmed;
  }

  return answer;
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
        "text-sm rounded-lg bg-background border transition-all",
        isLong ? "cursor-pointer" : ""
      )}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 py-1.5 px-3">
        {response.is_correct ? (
          <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        )}
        <span className="font-medium text-xs text-muted-foreground w-20 truncate shrink-0">
          {response.nickname}
        </span>
        <span className={cn("flex-1 min-w-0", !expanded && "truncate")}>
          {fullAnswer}
        </span>
        {isLong && (
          expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        {response.confidence_level && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {response.confidence_level}
          </Badge>
        )}
        {response.response_time_ms && (
          <span className="text-xs text-muted-foreground shrink-0">
            {(response.response_time_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
};

export const LiveSessionResults = ({ sessionId }: LiveSessionResultsProps) => {
  const [questionGroups, setQuestionGroups] = useState<QuestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResults = useCallback(async () => {
    if (!sessionId) return;

    // Fetch all questions for this session
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

    // Fetch all responses for these questions
    const questionIds = questions.map((q) => q.id);
    const { data: responses } = await supabase
      .from("live_responses")
      .select("*")
      .in("question_id", questionIds)
      .order("responded_at", { ascending: true });

    // Fetch participant nicknames
    const { data: participants } = await supabase
      .from("live_participants")
      .select("id, nickname")
      .eq("session_id", sessionId);

    const nicknameMap = new Map(
      participants?.map((p) => [p.id, p.nickname]) || []
    );

    // Group responses by question
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

      return {
        question: q,
        responses: qResponses,
        correctCount,
        totalResponses: qResponses.length,
        avgResponseTime,
      };
    });

    setQuestionGroups(groups);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Real-time subscription for new responses
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-results-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_responses" },
        () => fetchResults()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_questions", filter: `session_id=eq.${sessionId}` },
        () => fetchResults()
      )
      .subscribe();

    // Poll fallback every 5s
    const pollInterval = setInterval(fetchResults, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [sessionId, fetchResults]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchResults();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading live responses...
        </CardContent>
      </Card>
    );
  }

  if (questionGroups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Live Session Responses
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-6">
          No questions sent yet in this session.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
           <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Live Room Insight
            <Badge variant="outline" className="ml-2">
              {questionGroups.length} question{questionGroups.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
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

            return (
              <AccordionItem key={group.question.id} value={group.question.id}>
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3 text-left flex-1 mr-2">
                    <Badge variant="secondary" className="shrink-0">
                      Q{group.question.question_number}
                    </Badge>
                    <span className="text-sm truncate flex-1">
                      {typeof questionText === "string"
                        ? questionText.substring(0, 80)
                        : "Question"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={correctPct >= 70 ? "default" : correctPct >= 40 ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {correctPct}% correct
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {group.totalResponses}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    {/* Stats bar */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        {group.correctCount} correct
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        {group.totalResponses - group.correctCount} incorrect
                      </span>
                      {group.avgResponseTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {(group.avgResponseTime / 1000).toFixed(1)}s avg
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <Progress value={correctPct} className="h-2" />

                    {/* Question text */}
                    <div className="p-3 bg-muted/50 rounded-lg text-sm">
                      <MathRenderer content={questionText} />
                    </div>

                    {/* Individual responses */}
                    {group.responses.length > 0 ? (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto">
                        {group.responses.map((r) => {
                          const fullAnswer = resolveAnswerToFullText(r.answer, group.question.question_content);
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
                      <p className="text-sm text-muted-foreground text-center py-2">
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
