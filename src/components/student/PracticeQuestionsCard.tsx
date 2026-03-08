import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles, CheckCircle2, XCircle, ChevronRight,
  Loader2, RotateCcw, Trophy, Brain
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: unknown;
  correct_answer: string;
  explanation: string;
  difficulty: string;
  topic_tags: string[] | null;
  times_attempted: number;
  times_correct: number;
  source_material_id: string | null;
}

interface PracticeQuestionsCardProps {
  userId: string;
}

interface GradeComponents {
  conceptual_understanding: number;
  accuracy: number;
  completeness: number;
  application: number;
}

type AnswerState = "unanswered" | "correct" | "incorrect";

function GradeDisplay({ grade }: { grade: number }) {
  const getGradeInfo = (g: number) => {
    if (g >= 85) return { label: "Great answer!", color: "text-green-600", bg: "bg-green-50 dark:bg-green-500/10", border: "border-green-200 dark:border-green-500/20" };
    if (g >= 70) return { label: "Good answer", color: "text-green-600", bg: "bg-green-50 dark:bg-green-500/10", border: "border-green-200 dark:border-green-500/20" };
    if (g >= 50) return { label: "Partially correct", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20" };
    return { label: "Needs improvement", color: "text-red-600", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20" };
  };
  const info = getGradeInfo(grade);
  return (
    <p className={cn("font-semibold flex items-center gap-1.5", info.color)}>
      {grade >= 70 ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {info.label} ({grade}/100)
    </p>
  );
}

function ComponentScores({ components }: { components: GradeComponents }) {
  const items = [
    { label: "Conceptual", value: components.conceptual_understanding },
    { label: "Accuracy", value: components.accuracy },
    { label: "Completeness", value: components.completeness },
    { label: "Application", value: components.application },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="w-full bg-muted rounded-full h-1.5 mb-1">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                item.value >= 20 ? "bg-green-500" : item.value >= 12 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${(item.value / 25) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PracticeQuestionsCard({ userId }: PracticeQuestionsCardProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [shortAnswer, setShortAnswer] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [aiGrade, setAiGrade] = useState<number | null>(null);
  const [aiComponents, setAiComponents] = useState<GradeComponents | null>(null);

  useEffect(() => {
    fetchQuestions();
  }, [userId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("personalized_questions")
        .select("*")
        .eq("user_id", userId)
        .not("source_material_id", "is", null)
        .order("times_attempted", { ascending: true })
        .limit(20);

      if (error) throw error;
      setQuestions(data || []);
    } catch (err) {
      console.error("Error fetching practice questions:", err);
    } finally {
      setLoading(false);
    }
  };

  const currentQuestion = questions[currentIndex] ?? null;

  const handleSubmit = useCallback(async () => {
    if (!currentQuestion) return;

    const answer =
      currentQuestion.question_type === "multiple_choice"
        ? selectedAnswer
        : shortAnswer.trim();

    if (!answer) {
      toast.error("Please provide an answer");
      return;
    }

    let isCorrect: boolean;

    if (currentQuestion.question_type === "multiple_choice") {
      isCorrect = answer.toLowerCase() === currentQuestion.correct_answer.toLowerCase();
    } else {
      // Use auto-grade-short-answer for proper partial grading
      isCorrect = false;
      setAiFeedbackLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("auto-grade-short-answer", {
          body: {
            studentAnswer: answer,
            expectedAnswer: currentQuestion.correct_answer,
            question: currentQuestion.question_text,
          },
        });

        if (error) throw error;

        if (data && typeof data.grade === "number") {
          const grade = Math.round(data.grade);
          setAiGrade(grade);
          isCorrect = grade >= 70;

          if (data.feedback) {
            setAiFeedback(data.feedback);
          }
          if (data.components) {
            setAiComponents(data.components);
          }
        }
      } catch (err) {
        console.error("Auto-grade error:", err);
        // Fallback: simple comparison
        isCorrect = answer.toLowerCase().trim() === currentQuestion.correct_answer.toLowerCase().trim();
      } finally {
        setAiFeedbackLoading(false);
      }
    }

    setAnswerState(isCorrect ? "correct" : "incorrect");
    setShowExplanation(true);
    setSessionTotal((p) => p + 1);
    if (isCorrect) setSessionCorrect((p) => p + 1);

    // Update stats in background
    try {
      await supabase
        .from("personalized_questions")
        .update({
          times_attempted: currentQuestion.times_attempted + 1,
          times_correct: currentQuestion.times_correct + (isCorrect ? 1 : 0),
        })
        .eq("id", currentQuestion.id);
    } catch {
      // non-blocking
    }
  }, [currentQuestion, selectedAnswer, shortAnswer]);

  const handleNext = () => {
    setSelectedAnswer(null);
    setShortAnswer("");
    setAnswerState("unanswered");
    setShowExplanation(false);
    setAiFeedback(null);
    setAiGrade(null);
    setAiComponents(null);
    setCurrentIndex((prev) => (prev + 1) % questions.length);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShortAnswer("");
    setAnswerState("unanswered");
    setShowExplanation(false);
    setAiFeedback(null);
    setAiGrade(null);
    setAiComponents(null);
    setSessionCorrect(0);
    setSessionTotal(0);
  };

  // ---- Rendering ----

  if (loading) {
    return null;
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">Practice Questions</p>
              <p className="text-sm text-muted-foreground">
                Upload study materials to generate practice questions you can quiz yourself on
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("study-materials-section")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Upload
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercent =
    sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;

  const isShortAnswer = currentQuestion?.question_type !== "multiple_choice";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-primary" />
            Practice Questions
          </CardTitle>
          <div className="flex items-center gap-3">
            {sessionTotal > 0 && (
              <Badge
                variant="secondary"
                className="gap-1 text-xs font-medium"
              >
                <Trophy className="w-3 h-3" />
                {sessionCorrect}/{sessionTotal} ({progressPercent}%)
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {currentIndex + 1} / {questions.length}
            </Badge>
          </div>
        </div>
        {sessionTotal > 0 && (
          <Progress value={progressPercent} className="h-1.5 mt-2" />
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Difficulty + Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={cn(
              "text-xs capitalize",
              currentQuestion!.difficulty === "beginner" &&
                "border-green-500/40 text-green-600",
              currentQuestion!.difficulty === "intermediate" &&
                "border-yellow-500/40 text-yellow-600",
              currentQuestion!.difficulty === "advanced" &&
                "border-red-500/40 text-red-600"
            )}
          >
            {currentQuestion!.difficulty}
          </Badge>
          {currentQuestion!.topic_tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Question */}
        <p className="font-medium text-foreground leading-relaxed">
          {currentQuestion!.question_text}
        </p>

        {/* Answer area */}
        {currentQuestion!.question_type === "multiple_choice" &&
        Array.isArray(currentQuestion!.options) ? (
          <div className="space-y-2">
            {(currentQuestion!.options as string[]).map((option, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isSelected = selectedAnswer === option;
              const isCorrectOption =
                option === currentQuestion!.correct_answer;
              const showResult = answerState !== "unanswered";

              return (
                <button
                  key={idx}
                  disabled={showResult}
                  onClick={() => setSelectedAnswer(option)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all text-sm flex items-start gap-3",
                    !showResult && isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : !showResult
                      ? "border-border hover:border-primary/40 hover:bg-muted/50"
                      : showResult && isCorrectOption
                      ? "border-green-500 bg-green-50 dark:bg-green-500/10"
                      : showResult && isSelected && !isCorrectOption
                      ? "border-red-500 bg-red-50 dark:bg-red-500/10"
                      : "border-border opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5",
                      showResult && isCorrectOption
                        ? "bg-green-500 text-white"
                        : showResult && isSelected
                        ? "bg-red-500 text-white"
                        : isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {showResult && isCorrectOption ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : showResult && isSelected ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      letter
                    )}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <textarea
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              disabled={answerState !== "unanswered"}
              placeholder="Type your answer here..."
              rows={3}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
          </div>
        )}

        {/* Explanation / Grading feedback */}
        {showExplanation && (
          <div
            className={cn(
              "rounded-lg p-4 text-sm space-y-3",
              isShortAnswer && aiGrade !== null
                ? aiGrade >= 70
                  ? "bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"
                  : aiGrade >= 50
                  ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20"
                  : "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
                : answerState === "correct"
                ? "bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"
                : "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20"
            )}
          >
            {/* Short answer: show grade-based feedback */}
            {isShortAnswer ? (
              aiFeedbackLoading ? (
                <p className="text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Grading your answer...
                </p>
              ) : aiGrade !== null ? (
                <>
                  <GradeDisplay grade={aiGrade} />
                  {aiComponents && <ComponentScores components={aiComponents} />}
                  {aiFeedback && (
                    <p className="text-muted-foreground whitespace-pre-line mt-2">{aiFeedback}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold flex items-center gap-1.5">
                    {answerState === "correct" ? (
                      <><CheckCircle2 className="w-4 h-4 text-green-600" /> Correct!</>
                    ) : (
                      <><XCircle className="w-4 h-4 text-red-500" /> Incorrect</>
                    )}
                  </p>
                  <p className="text-muted-foreground">{currentQuestion!.explanation}</p>
                </>
              )
            ) : (
              /* Multiple choice: binary correct/incorrect */
              <>
                <p className="font-semibold flex items-center gap-1.5">
                  {answerState === "correct" ? (
                    <><CheckCircle2 className="w-4 h-4 text-green-600" /> Correct!</>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      Not quite — the answer is:{" "}
                      <span className="text-foreground">
                        {currentQuestion!.correct_answer}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-muted-foreground">{currentQuestion!.explanation}</p>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {answerState === "unanswered" ? (
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={
                currentQuestion!.question_type === "multiple_choice"
                  ? !selectedAnswer
                  : !shortAnswer.trim()
              }
            >
              Submit Answer
            </Button>
          ) : (
            <>
              <Button className="flex-1" onClick={handleNext}>
                Next Question
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleRestart}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
