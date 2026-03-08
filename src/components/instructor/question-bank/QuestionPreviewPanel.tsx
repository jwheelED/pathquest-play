import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, Edit, Eye, FileUp, CheckCircle2, Circle, BarChart3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { format, parseISO } from "date-fns";
import type { BankQuestion } from "./QuestionBankCard";

interface QuestionPreviewPanelProps {
  question: BankQuestion | null;
  onPush: (q: BankQuestion) => void;
  onEdit: (q: BankQuestion) => void;
}

interface ResultStats {
  submitted: number;
  avgGrade: number | null;
}

export function QuestionPreviewPanel({ question, onPush, onEdit }: QuestionPreviewPanelProps) {
  const { selectedCourseId } = useCourseContext();
  const [resultStats, setResultStats] = useState<ResultStats | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const fetchResults = useCallback(async () => {
    if (!question || !selectedCourseId || !question.times_used) {
      setResultStats(null);
      return;
    }
    setLoadingResults(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("student_assignments")
        .select("completed, grade, quiz_responses")
        .eq("instructor_id", user.id)
        .eq("assignment_type", "lecture_checkin")
        .or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      if (error) throw error;

      const matching = (data || []).filter((a: Record<string, unknown>) => {
        const content = a.content as Record<string, unknown> | null;
        return content?.questionBankId === question.id;
      });

      const grades = matching
        .map((a: Record<string, unknown>) => {
          if (a.grade != null) return a.grade as number;
          const resp = a.quiz_responses as Record<string, unknown> | null;
          const aiRec = (resp?._ai_recommendations as Record<string, Record<string, unknown>> | undefined)?.["0"];
          return aiRec?.grade as number | undefined ?? null;
        })
        .filter((g): g is number => g !== null);

      setResultStats({
        submitted: matching.filter((a: Record<string, unknown>) => a.completed).length,
        avgGrade: grades.length > 0 ? Math.round(grades.reduce((s, g) => s + g, 0) / grades.length) : null,
      });
    } catch {
      setResultStats(null);
    } finally {
      setLoadingResults(false);
    }
  }, [question, selectedCourseId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (!question) {
    return (
      <Card className="headspace-card">
        <CardContent className="py-16 text-center">
          <Eye className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Select a question to preview details
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPushed = question.times_used != null && question.times_used > 0;
  const content = question.question_content;
  const questionText = (content.question || content.problemText || "No question text") as string;
  const options = content.options as string[] | undefined;
  const correctAnswer = (content.correctAnswer || content.expectedAnswer) as string | undefined;

  return (
    <Card className="headspace-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold truncate">{question.title}</CardTitle>
          {isPushed ? (
            <Badge variant="secondary" className="text-[10px] gap-1 bg-secondary/15 text-secondary border-secondary/20 shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              Pushed
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20 shrink-0">
              <Circle className="w-3 h-3" />
              Ready
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Question text */}
        <p className="text-sm text-foreground leading-relaxed">{questionText}</p>

        {/* Options (MCQ) */}
        {options && options.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Options</p>
            {options.map((opt, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-2 rounded-lg border ${
                  correctAnswer === opt
                    ? "border-primary/40 bg-primary/5 text-foreground font-medium"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                {String.fromCharCode(65 + i)}. {opt}
                {correctAnswer === opt && <span className="ml-2 text-primary text-[10px]">✓ Correct</span>}
              </div>
            ))}
          </div>
        )}

        {/* Expected answer (short answer / coding) */}
        {!options && correctAnswer && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Expected Answer</p>
            <p className="text-xs text-foreground bg-muted/30 rounded-lg border border-border p-3">
              {correctAnswer}
            </p>
          </div>
        )}

        {/* Source */}
        {question.source_material_title && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileUp className="w-3 h-3" />
            {question.source_material_title}
          </div>
        )}

        {/* Results inline */}
        {isPushed && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                <BarChart3 className="w-3 h-3" />
                Results
              </p>
              {loadingResults ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : resultStats ? (
                <div className="flex gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Submitted: </span>
                    <span className="font-medium text-foreground">{resultStats.submitted}</span>
                  </div>
                  {resultStats.avgGrade !== null && (
                    <div>
                      <span className="text-muted-foreground">Avg Grade: </span>
                      <span className="font-medium text-foreground">{resultStats.avgGrade}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No responses yet</p>
              )}
            </div>
          </>
        )}

        {question.last_used_at && (
          <p className="text-[10px] text-muted-foreground">
            Last pushed: {format(parseISO(question.last_used_at), "MMM d, h:mm a")}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1" onClick={() => onPush(question)}>
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Push to Students
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdit(question)}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
