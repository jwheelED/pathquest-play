import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Search, Library, Loader2, FileUp, Zap, BookOpen, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { 
  QuestionBankCard, 
  CreateQuestionDialog, 
  PushQuestionDialog,
  SlideUploadFlow,
  SourceMaterialCard,
  type BankQuestion 
} from "./question-bank";
import { QuestionPreviewPanel } from "./question-bank/QuestionPreviewPanel";
import { QuestionBankResults } from "./QuestionBankResults";

interface QuestionBankTabProps {
  professorType: string | null;
}

export function QuestionBankTab({ professorType }: QuestionBankTabProps) {
  const { selectedCourseId } = useCourseContext();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [mode, setMode] = useState<"prep" | "live">("prep");
  const [view, setView] = useState<"bank" | "results">("bank");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState<BankQuestion | null>(null);
  const [pushQuestion, setPushQuestion] = useState<BankQuestion | null>(null);
  const [deleteQuestion, setDeleteQuestion] = useState<BankQuestion | null>(null);
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUploadFlow, setShowUploadFlow] = useState(false);
  
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

  const fetchQuestions = useCallback(async () => {
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
      setQuestions((data || []) as BankQuestion[]);
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

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
      setQuestions(prev => prev.filter(q => q.id !== deleteQuestion.id));
      if (selectedQuestionId === deleteQuestion.id) setSelectedQuestionId(null);
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    } finally {
      setDeleting(false);
      setDeleteQuestion(null);
    }
  };

  const handleDeleteAllFromSource = async () => {
    if (!deleteSourceId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("instructor_question_bank")
        .delete()
        .eq("source_material_id", deleteSourceId);
      if (error) throw error;
      const sourceTitle = questions.find(q => q.source_material_id === deleteSourceId)?.source_material_title;
      toast.success(`Deleted all questions from "${sourceTitle}"`);
      setQuestions(prev => prev.filter(q => q.source_material_id !== deleteSourceId));
      setSelectedQuestionId(null);
    } catch (error) {
      console.error("Error deleting source questions:", error);
      toast.error("Failed to delete questions");
    } finally {
      setDeleting(false);
      setDeleteSourceId(null);
    }
  };

  const applyFilters = (q: BankQuestion) => {
    if (typeFilter !== "all") {
      const normalizedType = q.question_type === "coding_simple" ? "coding" : q.question_type;
      if (normalizedType !== typeFilter) return false;
    }
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      const matchesTitle = q.title.toLowerCase().includes(s);
      const matchesTags = q.tags?.some(t => t.toLowerCase().includes(s));
      const matchesContent = JSON.stringify(q.question_content).toLowerCase().includes(s);
      const matchesSource = q.source_material_title?.toLowerCase().includes(s);
      if (!matchesTitle && !matchesTags && !matchesContent && !matchesSource) return false;
    }
    return true;
  };

  const filteredQuestions = useMemo(() => questions.filter(applyFilters), [questions, typeFilter, searchQuery]);
  const manualQuestions = filteredQuestions.filter(q => !q.source_material_id);
  
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, { title: string; questions: BankQuestion[] }>();
    filteredQuestions
      .filter(q => q.source_material_id && q.source_material_title)
      .forEach(q => {
        const key = q.source_material_id!;
        if (!groups.has(key)) {
          groups.set(key, { title: q.source_material_title!, questions: [] });
        }
        groups.get(key)!.questions.push(q);
      });
    return Array.from(groups, ([id, group]) => ({ id, ...group }));
  }, [filteredQuestions]);

  const selectedQuestion = useMemo(
    () => questions.find(q => q.id === selectedQuestionId) || null,
    [questions, selectedQuestionId]
  );

  // Stats
  const totalCount = filteredQuestions.length;
  const readyCount = filteredQuestions.filter(q => !q.times_used || q.times_used === 0).length;
  const pushedCount = filteredQuestions.filter(q => q.times_used && q.times_used > 0).length;

  if (showUploadFlow) {
    return (
      <div className="space-y-6">
        <SlideUploadFlow
          onComplete={(count) => {
            setShowUploadFlow(false);
            fetchQuestions();
            if (count > 0) toast.success(`${count} questions added to your bank!`);
          }}
          onCancel={() => setShowUploadFlow(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Control Bar */}
      <Card className="headspace-card">
        <CardContent className="py-4 px-5">
          <div className="flex flex-col gap-4">
            {/* Row 1: Title + Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Library className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Question Bank</h2>
              </div>
              <div className="flex items-center gap-2">
                <Tabs value={view} onValueChange={(v) => setView(v as "bank" | "results")}>
                  <TabsList className="h-9">
                    <TabsTrigger value="bank" className="text-xs px-3 gap-1.5">
                      <Library className="w-3.5 h-3.5" />
                      Bank
                    </TabsTrigger>
                    <TabsTrigger value="results" className="text-xs px-3 gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Results
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button variant="outline" size="sm" onClick={() => setShowUploadFlow(true)}>
                  <FileUp className="w-4 h-4 mr-1.5" />
                  Upload Slides
                </Button>
                <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Question
                </Button>
              </div>
            </div>

            {view === "bank" && (
              <>
                {/* Row 2: Mode tabs + search + filter */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <Tabs value={mode} onValueChange={(v) => setMode(v as "prep" | "live")} className="shrink-0">
                    <TabsList className="h-9">
                      <TabsTrigger value="prep" className="text-xs px-3 gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        Prep
                      </TabsTrigger>
                      <TabsTrigger value="live" className="text-xs px-3 gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        Live Push
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search questions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue placeholder="Filter type" />
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

                {/* Row 3: Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{totalCount} question{totalCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    {readyCount} ready
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-secondary" />
                    {pushedCount} pushed
                  </span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {view === "results" ? (
        <QuestionBankResults />
      ) : (
        /* Two-column layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Question List (2/3) */}
          <div className="lg:col-span-2 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : manualQuestions.length === 0 && sourceGroups.length === 0 ? (
              <Card className="headspace-card">
                <CardContent className="text-center py-12">
                  <Library className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <h3 className="font-medium text-muted-foreground mb-1">
                    {questions.length === 0 ? "No questions yet" : "No matching questions"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {questions.length === 0 
                      ? "Create your first question or upload slides to get started" 
                      : "Try adjusting your search or filters"
                    }
                  </p>
                  {questions.length === 0 && (
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" onClick={() => setShowUploadFlow(true)}>
                        <FileUp className="w-4 h-4 mr-2" />
                        Upload Slides
                      </Button>
                      <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Question
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Manual questions */}
                {manualQuestions.length > 0 && (
                  <div className="space-y-2">
                    {manualQuestions.map(question => (
                      <QuestionBankCard
                        key={question.id}
                        question={question}
                        mode={mode}
                        selected={selectedQuestionId === question.id}
                        onSelect={(q) => setSelectedQuestionId(q.id)}
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

                {/* Source material groups */}
                {sourceGroups.length > 0 && (
                  <div className="space-y-3">
                    {manualQuestions.length > 0 && (
                      <h3 className="text-sm font-medium text-muted-foreground px-1 pt-2">
                        From Uploaded Slides
                      </h3>
                    )}
                    {sourceGroups.map(group => (
                      <SourceMaterialCard
                        key={group.id}
                        sourceId={group.id}
                        sourceTitle={group.title}
                        questions={group.questions}
                        mode={mode}
                        selectedQuestionId={selectedQuestionId}
                        onSelect={(q) => setSelectedQuestionId(q.id)}
                        onEdit={(q) => {
                          setEditQuestion(q);
                          setCreateDialogOpen(true);
                        }}
                        onDelete={(q) => setDeleteQuestion(q)}
                        onPush={(q) => setPushQuestion(q)}
                        onDeleteAll={(id) => setDeleteSourceId(id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Preview Panel (1/3) */}
          <div className="hidden lg:block">
            <div className="sticky top-4">
              <QuestionPreviewPanel
                question={selectedQuestion}
                onPush={(q) => setPushQuestion(q)}
                onEdit={(q) => {
                  setEditQuestion(q);
                  setCreateDialogOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dialogs (unchanged) */}
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

      <PushQuestionDialog
        question={pushQuestion}
        open={!!pushQuestion}
        onOpenChange={(open) => !open && setPushQuestion(null)}
        onSuccess={fetchQuestions}
      />

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

      <AlertDialog open={!!deleteSourceId} onOpenChange={(open) => !open && setDeleteSourceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Questions from This Source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all questions generated from this uploaded file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllFromSource}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
