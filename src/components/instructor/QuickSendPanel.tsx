import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Zap, Search, Code, FileText, MessageSquare, Loader2, Send, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCourseContext } from "@/hooks/useCourseContext";

interface QuickSendQuestion {
  id: string;
  title: string;
  question_type: string;
  question_content: any;
  tags: string[];
  difficulty: string;
  times_used: number;
  last_used_at: string | null;
}

interface QuickSendPanelProps {
  sessionId: string;
  onQuestionSent?: () => void;
}

export function QuickSendPanel({ sessionId, onQuestionSent }: QuickSendPanelProps) {
  const { selectedCourseId } = useCourseContext();
  const [questions, setQuestions] = useState<QuickSendQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    loadQuestions();
  }, [selectedCourseId]);

  const loadQuestions = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("instructor_question_bank")
        .select("id, title, question_type, question_content, tags, difficulty, times_used, last_used_at")
        .eq("instructor_id", user.id)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("times_used", { ascending: false })
        .limit(50);

      if (selectedCourseId) {
        query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setQuestions(data || []);
    } catch (err: any) {
      console.error("Error loading questions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendQuestion = async (question: QuickSendQuestion) => {
    setSendingId(question.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the current question count for this session
      const { count } = await supabase
        .from("live_questions")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);

      const questionNumber = (count || 0) + 1;

      // Format question content based on type
      let questionContent: any;
      if (question.question_type === "coding" || question.question_type === "coding_simple") {
        questionContent = {
          question: question.question_content.problem,
          type: question.question_type,
          starterCode: question.question_content.starter_code,
          language: question.question_content.language || "java",
          expectedBehavior: question.question_content.expected_behavior,
          examples: question.question_content.examples || [],
          conceptsTested: question.question_content.concepts_tested || [],
        };
      } else if (question.question_type === "multiple_choice") {
        questionContent = {
          question: question.question_content.question,
          type: "multiple_choice",
          options: question.question_content.options || [],
          correctAnswer: question.question_content.correctAnswer,
          explanation: question.question_content.explanation,
        };
      } else {
        questionContent = {
          question: question.question_content.question || question.question_content.problem,
          type: question.question_type,
          expectedAnswer: question.question_content.expected_answer || question.question_content.expected_behavior,
        };
      }

      // Insert the live question
      const { error: insertError } = await supabase.from("live_questions").insert({
        session_id: sessionId,
        instructor_id: user.id,
        question_number: questionNumber,
        question_content: questionContent,
      });

      if (insertError) throw insertError;

      // Update usage stats
      await supabase
        .from("instructor_question_bank")
        .update({ 
          times_used: question.times_used + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", question.id);

      toast.success(`Question sent to class!`);
      onQuestionSent?.();
      
      // Refresh to update usage stats
      loadQuestions();
    } catch (err: any) {
      console.error("Send error:", err);
      toast.error(err.message || "Failed to send question");
    } finally {
      setSendingId(null);
    }
  };

  const filteredQuestions = questions.filter(q => 
    !searchQuery || 
    q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "coding":
      case "coding_simple":
        return <Code className="h-3 w-3" />;
      case "short_answer":
        return <MessageSquare className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-500/20 text-green-600";
      case "medium": return "bg-amber-500/20 text-amber-600";
      case "hard": return "bg-red-500/20 text-red-600";
      default: return "";
    }
  };

  // Group by recent vs other
  const recentQuestions = filteredQuestions.filter(q => q.last_used_at);
  const otherQuestions = filteredQuestions.filter(q => !q.last_used_at);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Send from Bank
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            className="pl-9 h-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No saved questions found
          </div>
        ) : (
          <ScrollArea className="h-[250px]">
            <div className="space-y-2 pr-2">
              {/* Recently Used */}
              {recentQuestions.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <Clock className="h-3 w-3" />
                    Recently Used
                  </p>
                  {recentQuestions.slice(0, 5).map(question => (
                    <QuickSendItem
                      key={question.id}
                      question={question}
                      isSending={sendingId === question.id}
                      onSend={() => handleSendQuestion(question)}
                      getTypeIcon={getTypeIcon}
                      getDifficultyColor={getDifficultyColor}
                    />
                  ))}
                </>
              )}

              {/* Other Questions */}
              {otherQuestions.length > 0 && (
                <>
                  {recentQuestions.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-4 mb-2">All Questions</p>
                  )}
                  {otherQuestions.map(question => (
                    <QuickSendItem
                      key={question.id}
                      question={question}
                      isSending={sendingId === question.id}
                      onSend={() => handleSendQuestion(question)}
                      getTypeIcon={getTypeIcon}
                      getDifficultyColor={getDifficultyColor}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface QuickSendItemProps {
  question: QuickSendQuestion;
  isSending: boolean;
  onSend: () => void;
  getTypeIcon: (type: string) => React.ReactNode;
  getDifficultyColor: (difficulty: string) => string;
}

function QuickSendItem({ question, isSending, onSend, getTypeIcon, getDifficultyColor }: QuickSendItemProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {getTypeIcon(question.question_type)}
          <span className="text-sm font-medium truncate">{question.title}</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Badge className={`text-[10px] px-1.5 py-0 ${getDifficultyColor(question.difficulty)}`}>
            {question.difficulty}
          </Badge>
          {question.tags.slice(0, 2).map(tag => (
            <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <Button 
        size="sm" 
        className="h-8 px-3"
        onClick={onSend}
        disabled={isSending}
      >
        {isSending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <Send className="h-3 w-3 mr-1" />
            Send
          </>
        )}
      </Button>
    </div>
  );
}
