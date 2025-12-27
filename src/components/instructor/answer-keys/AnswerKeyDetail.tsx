import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  BookOpen, 
  Plus, 
  CheckCircle2, 
  Clock,
  FileText,
  Sparkles,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ProblemEditor } from "./ProblemEditor";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Problem {
  id: string;
  answer_key_id: string;
  problem_number: string | null;
  problem_text: string;
  problem_latex: string | null;
  solution_text: string;
  solution_latex: string | null;
  solution_steps: any[];
  final_answer: string;
  final_answer_latex: string | null;
  units: string | null;
  topic_tags: string[];
  keywords: string[];
  difficulty: string;
  verified_by_instructor: boolean;
  verification_notes: string | null;
  order_index: number;
  created_at: string;
}

interface AnswerKey {
  id: string;
  title: string;
  subject: string;
  course_context: string | null;
  file_name: string | null;
  file_path: string | null;
  status: string;
  problem_count: number;
  created_at: string;
  updated_at: string;
}

interface AnswerKeyDetailProps {
  answerKeyId: string;
  onBack?: () => void;
}

export function AnswerKeyDetail({ answerKeyId, onBack }: AnswerKeyDetailProps) {
  const [showAddProblem, setShowAddProblem] = useState(false);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [expandedProblems, setExpandedProblems] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch answer key details
  const { data: answerKey, isLoading: loadingKey, refetch: refetchKey } = useQuery({
    queryKey: ["answer-key", answerKeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_answer_keys")
        .select("*")
        .eq("id", answerKeyId)
        .single();

      if (error) throw error;
      return data as AnswerKey;
    },
  });

  // Fetch problems
  const { data: problems = [], isLoading: loadingProblems, refetch: refetchProblems } = useQuery({
    queryKey: ["answer-key-problems", answerKeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answer_key_problems")
        .select("*")
        .eq("answer_key_id", answerKeyId)
        .order("order_index", { ascending: true });

      if (error) throw error;
      return data as Problem[];
    },
  });

  // Fetch MCQ counts for each problem
  const { data: mcqCounts = {} } = useQuery({
    queryKey: ["answer-key-mcq-counts", answerKeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answer_key_mcqs")
        .select("problem_id")
        .in("problem_id", problems.map(p => p.id));

      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(mcq => {
        counts[mcq.problem_id] = (counts[mcq.problem_id] || 0) + 1;
      });
      return counts;
    },
    enabled: problems.length > 0,
  });

  const deleteProblemMutation = useMutation({
    mutationFn: async (problemId: string) => {
      const { error } = await supabase
        .from("answer_key_problems")
        .delete()
        .eq("id", problemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Problem deleted");
      queryClient.invalidateQueries({ queryKey: ["answer-key-problems", answerKeyId] });
      queryClient.invalidateQueries({ queryKey: ["answer-keys"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete problem");
    },
  });

  // Re-parse mutation
  const reparseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("parse-answer-key", {
        body: { answerKeyId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-parsing started. Refresh in a few seconds.");
      setTimeout(() => {
        refetchKey();
        refetchProblems();
      }, 3000);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to re-parse");
    },
  });

  // Generate MCQs mutation
  const generateMcqsMutation = useMutation({
    mutationFn: async (problemIds?: string[]) => {
      const verifiedProblems = problemIds || problems.filter(p => p.verified_by_instructor).map(p => p.id);
      if (verifiedProblems.length === 0) {
        throw new Error("No verified problems to generate MCQs for");
      }

      const { data, error } = await supabase.functions.invoke("generate-answer-key-mcq", {
        body: { problemIds: verifiedProblems },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated || 0} MCQs!`);
      queryClient.invalidateQueries({ queryKey: ["answer-key-mcq-counts", answerKeyId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to generate MCQs");
    },
  });

  const toggleProblemExpanded = (problemId: string) => {
    setExpandedProblems((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) {
        next.delete(problemId);
      } else {
        next.add(problemId);
      }
      return next;
    });
  };

  const getSubjectLabel = (subject: string) => {
    const labels: Record<string, string> = {
      physics: "Physics",
      engineering: "Engineering",
      chemistry: "Chemistry",
      mathematics: "Mathematics",
      biology: "Biology",
      "computer-science": "Computer Science",
      economics: "Economics",
      statistics: "Statistics",
      other: "Other",
    };
    return labels[subject] || subject;
  };

  const verifiedCount = problems.filter((p) => p.verified_by_instructor).length;

  if (loadingKey) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading answer key...
        </CardContent>
      </Card>
    );
  }

  if (!answerKey) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Answer key not found
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {answerKey.title}
                </CardTitle>
                <CardDescription className="mt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{getSubjectLabel(answerKey.subject)}</Badge>
                    {answerKey.course_context && (
                      <span>• {answerKey.course_context}</span>
                    )}
                  </div>
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {problems.length} Problem{problems.length !== 1 ? "s" : ""}
              </Badge>
              {verifiedCount > 0 && (
                <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {verifiedCount} Verified
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => setShowAddProblem(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Problem
            </Button>
            <Button 
              variant="outline" 
              onClick={() => generateMcqsMutation.mutate(undefined)}
              disabled={generateMcqsMutation.isPending || verifiedCount === 0}
            >
              {generateMcqsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              Generate MCQs ({verifiedCount} verified)
            </Button>
            {answerKey.file_path && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => reparseMutation.mutate()}
                disabled={reparseMutation.isPending}
              >
                {reparseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Re-parse File
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Problem Form */}
      {showAddProblem && (
        <ProblemEditor
          answerKeyId={answerKeyId}
          onSave={() => setShowAddProblem(false)}
          onCancel={() => setShowAddProblem(false)}
        />
      )}

      {/* Problems List */}
      {loadingProblems ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading problems...
          </CardContent>
        </Card>
      ) : problems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No problems added yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add problems manually or let AI parse them from your uploaded file
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {problems.map((problem) => (
            <Card key={problem.id}>
              {editingProblemId === problem.id ? (
                <ProblemEditor
                  answerKeyId={answerKeyId}
                  problem={problem as any}
                  onSave={() => setEditingProblemId(null)}
                  onCancel={() => setEditingProblemId(null)}
                />
              ) : (
                <Collapsible
                  open={expandedProblems.has(problem.id)}
                  onOpenChange={() => toggleProblemExpanded(problem.id)}
                >
                  <CardHeader className="py-4">
                    <div className="flex items-start justify-between">
                      <CollapsibleTrigger className="flex items-start gap-3 text-left flex-1">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          {problem.problem_number || "#"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium line-clamp-2">{problem.problem_text}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="text-xs capitalize">
                              {problem.difficulty}
                            </Badge>
                            {problem.verified_by_instructor ? (
                              <Badge variant="default" className="text-xs bg-primary/10 text-primary border-primary/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 mr-1" />
                                Unverified
                              </Badge>
                            )}
                            {problem.topic_tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {expandedProblems.has(problem.id) ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 space-y-4">
                      {/* Solution */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Solution:</p>
                        <p className="text-sm">{problem.solution_text}</p>
                      </div>

                      {/* Final Answer */}
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <p className="text-sm font-medium text-primary mb-1">Final Answer:</p>
                        <p className="font-mono font-medium">
                          {problem.final_answer}
                          {problem.units && <span className="ml-1 text-muted-foreground">{problem.units}</span>}
                        </p>
                      </div>

                      {/* Keywords */}
                      {problem.keywords.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Trigger Keywords:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {problem.keywords.map((keyword) => (
                              <Badge key={keyword} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* MCQ Status */}
                      {mcqCounts[problem.id] > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Sparkles className="h-4 w-4 text-primary" />
                          {mcqCounts[problem.id]} MCQ{mcqCounts[problem.id] !== 1 ? "s" : ""} generated
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingProblemId(problem.id)}
                        >
                          <Edit3 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        {problem.verified_by_instructor && !mcqCounts[problem.id] && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateMcqsMutation.mutate([problem.id])}
                            disabled={generateMcqsMutation.isPending}
                          >
                            {generateMcqsMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-1" />
                            )}
                            Generate MCQ
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Problem?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this problem and any associated MCQs.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteProblemMutation.mutate(problem.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
