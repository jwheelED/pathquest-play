import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, Plus, Code, ListChecks, MessageSquare, Trash2, Edit2, 
  Copy, Zap, Clock, MoreVertical, Filter, Eye
} from "lucide-react";
import { toast } from "sonner";
import { QuestionBankItem, QuestionType, Difficulty, isCodingContent, isMCQContent } from "./types";
import { QuestionPreviewDialog } from "./QuestionPreviewDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { Json } from "@/integrations/supabase/types";

interface QuestionBankLibraryProps {
  courseId?: string;
  onEdit: (question: QuestionBankItem) => void;
  onCreateNew: () => void;
  onSend?: (question: QuestionBankItem) => void;
  isLiveSession?: boolean;
}

const typeIcons: Record<QuestionType, React.ReactNode> = {
  coding: <Code className="h-4 w-4" />,
  coding_simple: <Code className="h-4 w-4" />,
  multiple_choice: <ListChecks className="h-4 w-4" />,
  short_answer: <MessageSquare className="h-4 w-4" />,
};

const typeLabels: Record<QuestionType, string> = {
  coding: "Coding",
  coding_simple: "Coding (Simple)",
  multiple_choice: "MCQ",
  short_answer: "Short Answer",
};

const difficultyColors: Record<Difficulty, string> = {
  easy: "bg-green-500/10 text-green-600 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  hard: "bg-red-500/10 text-red-600 border-red-500/20",
};

export function QuestionBankLibrary({ 
  courseId, 
  onEdit, 
  onCreateNew, 
  onSend,
  isLiveSession = false 
}: QuestionBankLibraryProps) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<QuestionBankItem | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<QuestionBankItem | null>(null);

  useEffect(() => {
    fetchQuestions();
  }, [courseId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("instructor_question_bank")
        .select("*")
        .eq("instructor_id", user.id)
        .order("updated_at", { ascending: false });

      if (courseId) {
        query = query.or(`course_id.eq.${courseId},course_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to match QuestionBankItem type
      const transformedData: QuestionBankItem[] = (data || []).map(item => ({
        ...item,
        question_type: item.question_type as QuestionType,
        difficulty: item.difficulty as Difficulty | null,
        question_content: item.question_content as unknown as QuestionBankItem['question_content'],
      }));

      setQuestions(transformedData);
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load question bank");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!questionToDelete) return;

    try {
      const { error } = await supabase
        .from("instructor_question_bank")
        .delete()
        .eq("id", questionToDelete.id);

      if (error) throw error;

      toast.success("Question deleted");
      setQuestions(q => q.filter(item => item.id !== questionToDelete.id));
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    } finally {
      setDeleteDialogOpen(false);
      setQuestionToDelete(null);
    }
  };

  const handleDuplicate = async (question: QuestionBankItem) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("instructor_question_bank")
        .insert({
          instructor_id: user.id,
          course_id: question.course_id,
          title: `${question.title} (Copy)`,
          question_type: question.question_type,
          question_content: question.question_content as unknown as Json,
          difficulty: question.difficulty,
          tags: question.tags,
        });

      if (error) throw error;

      toast.success("Question duplicated");
      fetchQuestions();
    } catch (error) {
      console.error("Error duplicating question:", error);
      toast.error("Failed to duplicate question");
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = 
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || q.question_type === typeFilter;
    const matchesDifficulty = difficultyFilter === "all" || q.difficulty === difficultyFilter;
    return matchesSearch && matchesType && matchesDifficulty;
  });

  const getQuestionPreview = (question: QuestionBankItem): string => {
    const content = question.question_content;
    if ('question' in content && typeof content.question === 'string') {
      return content.question.substring(0, 100) + (content.question.length > 100 ? "..." : "");
    }
    return "";
  };

  const getLanguageLabel = (question: QuestionBankItem): string | null => {
    if (isCodingContent(question.question_content)) {
      return question.question_content.language;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search questions or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as QuestionType | "all")}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="coding">Coding</SelectItem>
              <SelectItem value="multiple_choice">MCQ</SelectItem>
              <SelectItem value="short_answer">Short Answer</SelectItem>
            </SelectContent>
          </Select>

          <Select value={difficultyFilter} onValueChange={(v) => setDifficultyFilter(v as Difficulty | "all")}>
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

          <Button onClick={onCreateNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </div>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Code className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No questions yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Create your first question to build a reusable library for your classes.
            </p>
            <Button onClick={onCreateNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Question
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredQuestions.map((question) => (
            <Card key={question.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-primary">
                        {typeIcons[question.question_type]}
                      </span>
                      <h3 className="font-semibold truncate">{question.title}</h3>
                      {question.difficulty && (
                        <Badge 
                          variant="outline" 
                          className={difficultyColors[question.difficulty]}
                        >
                          {question.difficulty}
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {getQuestionPreview(question)}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        {typeLabels[question.question_type]}
                      </Badge>
                      
                      {getLanguageLabel(question) && (
                        <Badge variant="outline" className="text-xs">
                          {getLanguageLabel(question)}
                        </Badge>
                      )}

                      {question.tags?.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      
                      {(question.tags?.length || 0) > 3 && (
                        <span className="text-muted-foreground">
                          +{question.tags!.length - 3} more
                        </span>
                      )}

                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="h-3 w-3" />
                        {question.last_used_at 
                          ? `Used ${formatDistanceToNow(new Date(question.last_used_at))} ago`
                          : question.times_used 
                            ? `Used ${question.times_used} times`
                            : "Never used"
                        }
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isLiveSession && onSend && (
                      <Button 
                        size="sm" 
                        onClick={() => onSend(question)}
                        className="gap-1"
                      >
                        <Zap className="h-3 w-3" />
                        Send
                      </Button>
                    )}
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => onEdit(question)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPreviewQuestion(question)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(question)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            setQuestionToDelete(question);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{questionToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Question Preview Dialog */}
      <QuestionPreviewDialog
        open={previewQuestion !== null}
        onOpenChange={(open) => !open && setPreviewQuestion(null)}
        question={previewQuestion}
      />
    </div>
  );
}
