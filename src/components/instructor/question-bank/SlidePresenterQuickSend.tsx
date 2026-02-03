import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Zap, Library, Code, ListChecks, MessageSquare, 
  Loader2, ChevronDown, ChevronUp, X 
} from "lucide-react";
import { toast } from "sonner";
import { QuestionBankItem, QuestionType, isCodingContent, isMCQContent } from "./types";
import { cn } from "@/lib/utils";

interface SlidePresenterQuickSendProps {
  isVisible: boolean;
  onClose: () => void;
  onQuestionSent?: () => void;
  courseId?: string;
}

const typeIcons: Record<QuestionType, React.ReactNode> = {
  coding: <Code className="h-3 w-3" />,
  coding_simple: <Code className="h-3 w-3" />,
  multiple_choice: <ListChecks className="h-3 w-3" />,
  short_answer: <MessageSquare className="h-3 w-3" />,
};

const difficultyColors: Record<string, string> = {
  easy: "bg-green-500/20 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  hard: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function SlidePresenterQuickSend({ 
  isVisible, 
  onClose,
  onQuestionSent,
  courseId 
}: SlidePresenterQuickSendProps) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (isVisible) {
      fetchQuestions();
    }
  }, [isVisible, courseId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("instructor_question_bank")
        .select("*")
        .eq("instructor_id", user.id)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .limit(8);

      if (courseId) {
        query = query.or(`course_id.eq.${courseId},course_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

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
      const content = question.question_content;
      let requestBody: any = {
        source: "question_bank",
        course_id: courseId || question.course_id,
      };

      if (question.question_type === "coding" || question.question_type === "coding_simple") {
        if (isCodingContent(content)) {
          requestBody = {
            ...requestBody,
            question_text: content,
            suggested_type: question.question_type,
            context: `Pre-created coding problem: ${question.title}`,
          };
        }
      } else if (question.question_type === "multiple_choice" && isMCQContent(content)) {
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
        requestBody = {
          ...requestBody,
          question_text: content.question,
          suggested_type: "short_answer",
          expected_answer: content.expectedAnswer,
          context: `Pre-created question: ${question.title}`,
        };
      }

      const { data, error } = await supabase.functions.invoke("format-and-send-question", {
        body: requestBody,
      });

      if (error) throw error;

      // Update usage tracking
      await supabase
        .from("instructor_question_bank")
        .update({
          times_used: (question.times_used || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", question.id);

      toast.success(`"${question.title}" sent!`, {
        description: `${data?.assignments_created || 0} students`,
      });

      fetchQuestions();
      onQuestionSent?.();

    } catch (error: any) {
      console.error("Error sending question:", error);
      toast.error("Failed to send question");
    } finally {
      setSendingId(null);
    }
  };

  if (!isVisible) return null;

  // Minimized state
  if (isMinimized) {
    return (
      <div 
        className="absolute top-4 right-4 z-50 bg-slate-900/95 backdrop-blur-sm rounded-lg px-3 py-2 cursor-pointer shadow-lg border border-slate-700/50"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center gap-2 text-slate-300">
          <Library className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">Question Bank</span>
          <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary">
            {questions.length}
          </Badge>
          <ChevronDown className="h-3 w-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-50 w-72 bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-slate-200">Question Bank</span>
          <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary">
            {questions.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-slate-200"
            onClick={() => setIsMinimized(true)}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-slate-200"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : questions.length === 0 ? (
        <div className="p-4 text-center text-slate-400 text-xs">
          <Library className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p>No saved questions</p>
          <p className="mt-1 text-slate-500">Create questions in the Dashboard</p>
        </div>
      ) : (
        <ScrollArea className="h-[280px]">
          <div className="p-2 space-y-1.5">
            {questions.map((question) => (
              <div
                key={question.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary shrink-0">
                      {typeIcons[question.question_type]}
                    </span>
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {question.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {question.difficulty && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] h-4 px-1",
                          difficultyColors[question.difficulty]
                        )}
                      >
                        {question.difficulty}
                      </Badge>
                    )}
                    {question.times_used && question.times_used > 0 && (
                      <span className="text-[9px] text-slate-500">
                        Used {question.times_used}x
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleSendQuestion(question)}
                  disabled={sendingId !== null}
                  className="h-6 px-2 text-[10px] bg-primary hover:bg-primary/90 shrink-0"
                >
                  {sendingId === question.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Zap className="h-2.5 w-2.5 mr-1" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
