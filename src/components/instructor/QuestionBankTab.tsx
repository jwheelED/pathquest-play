import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Search, Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { 
  QuestionBankCard, 
  CreateQuestionDialog, 
  PushQuestionDialog,
  type BankQuestion 
} from "./question-bank";

interface QuestionBankTabProps {
  professorType: string | null;
}

export function QuestionBankTab({ professorType }: QuestionBankTabProps) {
  const { selectedCourseId } = useCourseContext();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState<BankQuestion | null>(null);
  const [pushQuestion, setPushQuestion] = useState<BankQuestion | null>(null);
  const [deleteQuestion, setDeleteQuestion] = useState<BankQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Available types based on professor type
  const availableTypes = professorType === "humanities" 
    ? [
        { value: "all", label: "All Types" },
        { value: "multiple_choice", label: "Multiple Choice" },
        { value: "short_answer", label: "Short Answer" },
      ]
    : [
        { value: "all", label: "All Types" },
        { value: "multiple_choice", label: "Multiple Choice" },
        { value: "short_answer", label: "Short Answer" },
        { value: "coding", label: "Coding" },
      ];

  const fetchQuestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("instructor_question_bank")
        .select("*")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false });

      // Optionally filter by course
      if (selectedCourseId) {
        query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Cast the data to BankQuestion[] - the question_content is JSONB so it comes as Record<string, any>
      setQuestions((data || []) as BankQuestion[]);
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [selectedCourseId]);

  const handleDelete = async () => {
    if (!deleteQuestion) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("instructor_question_bank")
        .delete()
        .eq("id", deleteQuestion.id);

      if (error) throw error;

      toast.success("Question deleted");
      setQuestions(questions.filter(q => q.id !== deleteQuestion.id));
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    } finally {
      setDeleting(false);
      setDeleteQuestion(null);
    }
  };

  // Filter questions
  const filteredQuestions = questions.filter(q => {
    // Type filter
    if (typeFilter !== "all") {
      // Handle coding_simple as coding
      const normalizedType = q.question_type === "coding_simple" ? "coding" : q.question_type;
      if (normalizedType !== typeFilter) return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = q.title.toLowerCase().includes(query);
      const matchesTags = q.tags?.some(t => t.toLowerCase().includes(query));
      const matchesContent = JSON.stringify(q.question_content).toLowerCase().includes(query);
      if (!matchesTitle && !matchesTags && !matchesContent) return false;
    }
    
    return true;
  });

  return (
    <div className="space-y-6">
      <Card className="headspace-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Library className="h-5 w-5 text-primary" />
                Question Bank
              </CardTitle>
              <CardDescription>
                Create and manage questions to push to students on-demand
              </CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Question
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Questions List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-12">
              <Library className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground mb-1">
                {questions.length === 0 ? "No questions yet" : "No matching questions"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {questions.length === 0 
                  ? "Create your first question to get started" 
                  : "Try adjusting your search or filters"
                }
              </p>
              {questions.length === 0 && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Question
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map(question => (
                <QuestionBankCard
                  key={question.id}
                  question={question}
                  onEdit={(q) => {
                    setEditQuestion(q);
                    setCreateDialogOpen(true);
                  }}
                  onDelete={(q) => setDeleteQuestion(q)}
                  onPush={(q) => setPushQuestion(q)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <CreateQuestionDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setEditQuestion(null);
        }}
        onSuccess={fetchQuestions}
        editQuestion={editQuestion}
        professorType={professorType}
      />

      {/* Push Dialog */}
      <PushQuestionDialog
        question={pushQuestion}
        open={!!pushQuestion}
        onOpenChange={(open) => !open && setPushQuestion(null)}
        onSuccess={fetchQuestions}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteQuestion} onOpenChange={(open) => !open && setDeleteQuestion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteQuestion?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
