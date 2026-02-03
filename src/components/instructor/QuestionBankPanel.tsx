import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Library, Search, Code, FileText, Edit, Trash2, Send, Loader2, 
  MessageSquare, ChevronDown, ChevronUp, Copy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface QuestionBankQuestion {
  id: string;
  title: string;
  question_type: string;
  question_content: any;
  tags: string[];
  difficulty: string;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  course_id: string | null;
}

interface QuestionBankPanelProps {
  onSelectQuestion?: (question: QuestionBankQuestion) => void;
  onSendQuestion?: (question: QuestionBankQuestion) => void;
  showSendButton?: boolean;
}

export function QuestionBankPanel({ onSelectQuestion, onSendQuestion, showSendButton = false }: QuestionBankPanelProps) {
  const { selectedCourseId } = useCourseContext();
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        .select("*")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false });

      if (selectedCourseId) {
        query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setQuestions(data || []);
    } catch (err: any) {
      console.error("Error loading questions:", err);
      toast.error("Failed to load question bank");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("instructor_question_bank")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setQuestions(prev => prev.filter(q => q.id !== id));
      toast.success("Question deleted");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("Failed to delete question");
    }
  };

  const handleDuplicate = async (question: QuestionBankQuestion) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("instructor_question_bank").insert({
        instructor_id: user.id,
        course_id: question.course_id,
        title: `${question.title} (Copy)`,
        question_type: question.question_type,
        question_content: question.question_content,
        tags: question.tags,
        difficulty: question.difficulty,
      });

      if (error) throw error;

      toast.success("Question duplicated");
      loadQuestions();
    } catch (err: any) {
      console.error("Duplicate error:", err);
      toast.error("Failed to duplicate question");
    }
  };

  const handleSend = async (question: QuestionBankQuestion) => {
    try {
      // Update usage stats
      await supabase
        .from("instructor_question_bank")
        .update({ 
          times_used: question.times_used + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", question.id);

      onSendQuestion?.(question);
    } catch (err: any) {
      console.error("Send error:", err);
      toast.error("Failed to send question");
    }
  };

  // Filter questions
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = !searchQuery || 
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || q.question_type === typeFilter;
    const matchesDifficulty = difficultyFilter === "all" || q.difficulty === difficultyFilter;
    return matchesSearch && matchesType && matchesDifficulty;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "coding":
      case "coding_simple":
        return <Code className="h-4 w-4" />;
      case "short_answer":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "coding": return "Coding";
      case "coding_simple": return "Quick Code";
      case "short_answer": return "Short Answer";
      case "multiple_choice": return "MCQ";
      default: return type;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-500/20 text-green-600 border-green-500/30";
      case "medium": return "bg-amber-500/20 text-amber-600 border-amber-500/30";
      case "hard": return "bg-red-500/20 text-red-600 border-red-500/30";
      default: return "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Library className="h-5 w-5 text-primary" />
          Question Bank
        </CardTitle>
        <CardDescription>
          Browse and manage your saved questions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or tag..."
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="coding">Coding</SelectItem>
              <SelectItem value="coding_simple">Quick Code</SelectItem>
              <SelectItem value="multiple_choice">MCQ</SelectItem>
              <SelectItem value="short_answer">Short Answer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Questions List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Library className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No questions found</p>
            <p className="text-sm">Create your first coding problem above!</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {filteredQuestions.map(question => (
                <Collapsible
                  key={question.id}
                  open={expandedId === question.id}
                  onOpenChange={(open) => setExpandedId(open ? question.id : null)}
                >
                  <Card className="border-muted">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getTypeIcon(question.question_type)}
                            <span className="font-medium truncate">{question.title}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">
                              {getTypeLabel(question.question_type)}
                            </Badge>
                            <Badge className={`text-xs ${getDifficultyColor(question.difficulty)}`}>
                              {question.difficulty}
                            </Badge>
                            {question.tags.slice(0, 2).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {question.tags.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{question.tags.length - 2} more
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {expandedId === question.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      <CollapsibleContent className="pt-4 space-y-3">
                        {/* Problem Description */}
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Problem</p>
                          <p className="text-sm">{question.question_content?.problem || "No description"}</p>
                        </div>

                        {/* Starter Code for coding questions */}
                        {(question.question_type === "coding" || question.question_type === "coding_simple") && 
                         question.question_content?.starter_code && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Starter Code</p>
                            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto font-mono">
                              {question.question_content.starter_code}
                            </pre>
                          </div>
                        )}

                        {/* Expected Behavior */}
                        {question.question_content?.expected_behavior && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Expected Behavior</p>
                            <p className="text-sm">{question.question_content.expected_behavior}</p>
                          </div>
                        )}

                        {/* Usage Stats */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                          <span>Used {question.times_used} times</span>
                          {question.last_used_at && (
                            <span>Last used: {new Date(question.last_used_at).toLocaleDateString()}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          {showSendButton && (
                            <Button size="sm" onClick={() => handleSend(question)}>
                              <Send className="h-3 w-3 mr-1" />
                              Send to Class
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => onSelectQuestion?.(question)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDuplicate(question)}>
                            <Copy className="h-3 w-3 mr-1" />
                            Duplicate
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(question.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Card>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Stats */}
        {!isLoading && questions.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>{filteredQuestions.length} of {questions.length} questions</span>
            <span>
              {questions.filter(q => q.question_type === "coding" || q.question_type === "coding_simple").length} coding problems
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
