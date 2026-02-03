import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Zap, ChevronDown, ChevronUp, Library, Code, ListChecks, 
  MessageSquare, Loader2, Clock, ExternalLink 
} from "lucide-react";
import { toast } from "sonner";
import { QuestionBankItem, QuestionType, isCodingContent, isMCQContent } from "./types";
import { formatDistanceToNow } from "date-fns";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Json } from "@/integrations/supabase/types";

interface QuestionBankQuickSendProps {
  onOpenFullBank?: () => void;
  onQuestionSent?: () => void;
}

const typeIcons: Record<QuestionType, React.ReactNode> = {
  coding: <Code className="h-3 w-3" />,
  coding_simple: <Code className="h-3 w-3" />,
  multiple_choice: <ListChecks className="h-3 w-3" />,
  short_answer: <MessageSquare className="h-3 w-3" />,
};

export function QuestionBankQuickSend({ onOpenFullBank, onQuestionSent }: QuestionBankQuickSendProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { selectedCourseId } = useCourseContext();

  useEffect(() => {
    fetchRecentQuestions();
  }, [selectedCourseId]);

  const fetchRecentQuestions = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch 5 most recently used or created questions
      const { data, error } = await supabase
        .from("instructor_question_bank")
        .select("*")
        .eq("instructor_id", user.id)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .limit(5);

      if (error) throw error;

      // Transform data to match QuestionBankItem type
      const transformedData: QuestionBankItem[] = (data || []).map(item => ({
        ...item,
        question_type: item.question_type as QuestionType,
        difficulty: item.difficulty as QuestionBankItem['difficulty'],
        question_content: item.question_content as unknown as QuestionBankItem['question_content'],
      }));

      setQuestions(transformedData);
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendQuestion = async (question: QuestionBankItem) => {
    if (sendingId) return;

    setSendingId(question.id);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in");
        return;
      }

      // Build the request based on question type
      const content = question.question_content;
      let requestBody: any = {
        source: "question_bank",
        course_id: selectedCourseId || question.course_id,
      };

      if (question.question_type === "coding" || question.question_type === "coding_simple") {
        // For coding questions, pass the full structure
        if (isCodingContent(content)) {
          requestBody = {
            ...requestBody,
            question_text: content,
            suggested_type: question.question_type,
            context: `Pre-created coding problem: ${question.title}`,
          };
        }
      } else if (question.question_type === "multiple_choice" && isMCQContent(content)) {
        // For MCQ, pass pre-generated options
        requestBody = {
          ...requestBody,
          question_text: content.question,
          suggested_type: "multiple_choice",
          options: content.options,
          correct_answer: content.correctAnswer,
          explanation: content.explanation,
          context: `Pre-created MCQ: ${question.title}`,
        };
      } else if ('question' in content && 'expectedAnswer' in content) {
        // For short answer
        requestBody = {
          ...requestBody,
          question_text: content.question,
          suggested_type: "short_answer",
          expected_answer: content.expectedAnswer,
          context: `Pre-created question: ${question.title}`,
        };
      }

      console.log("📤 Sending question from bank:", question.title);

      // Call the format-and-send-question edge function
      const { data, error } = await supabase.functions.invoke("format-and-send-question", {
        body: requestBody,
      });

      if (error) {
        console.error("Edge function error:", error);
        
        // Handle rate limiting
        if (error.message?.includes("429") || error.message?.includes("rate limit")) {
          toast.error("Please wait a few seconds between questions");
          return;
        }
        
        throw error;
      }

      // Update usage tracking in the bank
      await supabase
        .from("instructor_question_bank")
        .update({
          times_used: (question.times_used || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", question.id);

      toast.success(`"${question.title}" sent to students!`, {
        description: `${data?.assignments_created || 0} students will receive this question`,
      });

      // Refresh list to show updated usage
      fetchRecentQuestions();
      
      onQuestionSent?.();

    } catch (error: any) {
      console.error("Error sending question:", error);
      toast.error("Failed to send question", {
        description: error.message || "Please try again",
      });
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading question bank...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card className="border-dashed border-primary/30">
        <CardContent className="py-4">
          <div className="text-center text-sm text-muted-foreground">
            <Library className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p>No saved questions yet</p>
            {onOpenFullBank && (
              <Button 
                variant="link" 
                size="sm" 
                onClick={onOpenFullBank}
                className="mt-1"
              >
                Create your first question →
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-primary" />
                Quick Send from Bank
                <Badge variant="secondary" className="text-xs">
                  {questions.length}
                </Badge>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 space-y-2">
            {questions.map((question) => (
              <div
                key={question.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background/80 border hover:border-primary/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-primary shrink-0">
                      {typeIcons[question.question_type]}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {question.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] h-4">
                      {question.difficulty || "medium"}
                    </Badge>
                    {question.last_used_at && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(question.last_used_at))} ago
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleSendQuestion(question)}
                  disabled={sendingId !== null}
                  className="gap-1 h-7 px-2 shrink-0"
                >
                  {sendingId === question.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Zap className="h-3 w-3" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            ))}

            {onOpenFullBank && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenFullBank}
                className="w-full mt-2 text-xs gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open Full Question Bank
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
