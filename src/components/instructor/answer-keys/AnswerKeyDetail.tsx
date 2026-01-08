import { useState, useRef, useEffect } from "react";
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
  RefreshCw,
  Bot,
  AlertCircle,
  Zap
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
import { Progress } from "@/components/ui/progress";

interface Problem {
  id: string;
  answer_key_id: string;
  problem_number: string | null;
  problem_text: string;
  problem_latex: string | null;
  has_solution: boolean | null;
  solution_text: string | null;
  solution_latex: string | null;
  solution_steps: any[];
  final_answer: string | null;
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
  content_type: string | null;
  created_at: string;
  updated_at: string;
}

interface ExtractedMCQ {
  id: string;
  question_text: string;
  question_latex: string | null;
  correct_answer: string;
  distractors: unknown;
  explanation: string | null;
  source_type: string;
  verified: boolean;
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
  const prevStatusRef = useRef<string | undefined>(undefined);

  // Fetch answer key details with polling when processing
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
    refetchInterval: (query) => {
      // Poll every 3 seconds while processing
      return query.state.data?.status === "processing" ? 3000 : false;
    },
  });

  // Fetch problems with polling when processing (only for problem-solutions type)
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
    enabled: answerKey?.content_type !== "mcqs",
    refetchInterval: (query) => {
      return answerKey?.status === "processing" ? 3000 : false;
    },
  });

  // Fetch extracted MCQs (only for mcqs type)
  const { data: extractedMcqs = [], isLoading: loadingMcqs, refetch: refetchMcqs } = useQuery({
    queryKey: ["answer-key-extracted-mcqs", answerKeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answer_key_mcqs")
        .select("*")
        .eq("answer_key_id", answerKeyId)
        .eq("source_type", "extracted")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as ExtractedMCQ[];
    },
    enabled: answerKey?.content_type === "mcqs",
    refetchInterval: (query) => {
      return answerKey?.status === "processing" ? 3000 : false;
    },
  });

  // Detect status transitions and show toast notifications
  useEffect(() => {
    if (!answerKey?.status) return;
    
    const prevStatus = prevStatusRef.current;
    const currentStatus = answerKey.status;
    
    if (prevStatus === "processing" && currentStatus === "parsed") {
      toast.success(`Parsing complete! Found ${answerKey.problem_count || problems.length} problems.`);
      queryClient.invalidateQueries({ queryKey: ["answer-key-problems", answerKeyId] });
      queryClient.invalidateQueries({ queryKey: ["answer-keys"] });
    } else if (prevStatus === "processing" && currentStatus === "error") {
      toast.error("Parsing failed. You can try re-parsing or add problems manually.");
    }
    
    prevStatusRef.current = currentStatus;
  }, [answerKey?.status, answerKey?.problem_count, problems.length, answerKeyId, queryClient]);

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

  // Quick verify mutation
  const verifyProblemMutation = useMutation({
    mutationFn: async ({ problemId, verified }: { problemId: string; verified: boolean }) => {
      const { error } = await supabase
        .from("answer_key_problems")
        .update({ verified_by_instructor: verified })
        .eq("id", problemId);
      if (error) throw error;
    },
    onSuccess: (_, { verified }) => {
      toast.success(verified ? "Problem verified" : "Verification removed");
      queryClient.invalidateQueries({ queryKey: ["answer-key-problems", answerKeyId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update verification");
    },
  });

  // Verify all problems mutation
  const verifyAllMutation = useMutation({
    mutationFn: async () => {
      const unverifiedIds = problems.filter(p => !p.verified_by_instructor).map(p => p.id);
      if (unverifiedIds.length === 0) return { count: 0 };
      
      const { error } = await supabase
        .from("answer_key_problems")
        .update({ verified_by_instructor: true })
        .in("id", unverifiedIds);
      if (error) throw error;
      return { count: unverifiedIds.length };
    },
    onSuccess: (data) => {
      if (data.count > 0) {
        toast.success(`Verified ${data.count} problem${data.count !== 1 ? 's' : ''}`);
        queryClient.invalidateQueries({ queryKey: ["answer-key-problems", answerKeyId] });
      } else {
        toast.info("All problems are already verified");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to verify problems");
    },
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

  const isProcessing = answerKey.status === "processing";
  const hasError = answerKey.status === "error";

  return (
    <div className="space-y-4">
      {/* Processing Banner */}
      {isProcessing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-foreground">AI is parsing your answer key...</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    This usually takes 30-60 seconds. You can add problems manually while waiting.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Progress value={undefined} className="h-2 w-full max-w-md [&>div]:animate-pulse" />
                  <p className="text-xs text-muted-foreground">
                    {problems.length > 0 
                      ? `${problems.length} problem${problems.length !== 1 ? 's' : ''} found so far...`
                      : "Analyzing document structure..."
                    }
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Banner */}
      {hasError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Parsing failed</p>
                <p className="text-sm text-muted-foreground">
                  There was an issue parsing your document. You can try re-parsing or add problems manually.
                </p>
              </div>
              {answerKey.file_path && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => reparseMutation.mutate()}
                  disabled={reparseMutation.isPending}
                >
                  {reparseMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Retry
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
            {answerKey.content_type !== "mcqs" && (
              <>
                <Button onClick={() => setShowAddProblem(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Problem
                </Button>
                {problems.length > 0 && verifiedCount < problems.length && (
                  <Button 
                    variant="outline"
                    onClick={() => verifyAllMutation.mutate()}
                    disabled={verifyAllMutation.isPending}
                  >
                    {verifyAllMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Verify All ({problems.length - verifiedCount})
                  </Button>
                )}
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
              </>
            )}
            {answerKey.content_type === "mcqs" && extractedMcqs.length > 0 && (
              <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {extractedMcqs.length} MCQs Ready for Matching
              </Badge>
            )}
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

      {/* Workflow Guidance Banner */}
      {problems.length > 0 && (verifiedCount === 0 || Object.keys(mcqCounts).length === 0) && !isProcessing && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm text-foreground">Complete setup for live lecture matching</h4>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Upload answer key</span>
                    <Badge variant="secondary" className="text-xs">Done</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Parse problems</span>
                    <Badge variant="secondary" className="text-xs">{problems.length} found</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {verifiedCount > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600" />
                    )}
                    <span className={verifiedCount === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                      Verify problems
                    </span>
                    <Badge variant={verifiedCount > 0 ? "secondary" : "outline"} className="text-xs">
                      {verifiedCount}/{problems.length} verified
                    </Badge>
                    {verifiedCount === 0 && (
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0 text-xs text-primary"
                        onClick={() => verifyAllMutation.mutate()}
                        disabled={verifyAllMutation.isPending}
                      >
                        Verify all →
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {Object.keys(mcqCounts).length > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-muted-foreground">Generate MCQs</span>
                    {Object.keys(mcqCounts).length > 0 ? (
                      <Badge variant="secondary" className="text-xs">Ready</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {verifiedCount > 0 ? "Click 'Generate MCQs' above" : "Verify problems first"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Problem Form */}
      {showAddProblem && (
        <ProblemEditor
          answerKeyId={answerKeyId}
          onSave={() => setShowAddProblem(false)}
          onCancel={() => setShowAddProblem(false)}
        />
      )}

      {/* Content Display - MCQs or Problems based on content_type */}
      {answerKey.content_type === "mcqs" ? (
        // Extracted MCQs view
        loadingMcqs ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading MCQs...
            </CardContent>
          </Card>
        ) : extractedMcqs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No MCQs extracted yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                AI is extracting questions from your file...
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {extractedMcqs.map((mcq, index) => {
              const distractors = Array.isArray(mcq.distractors) ? mcq.distractors : [];
              return (
                <Card key={mcq.id}>
                  <CardHeader className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{mcq.question_text}</p>
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded text-sm">
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium">{mcq.correct_answer}</span>
                          </div>
                          {distractors.map((d: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm text-muted-foreground">
                              <span className="w-4 h-4 flex-shrink-0" />
                              <span>{d.text || d}</span>
                            </div>
                          ))}
                        </div>
                        {mcq.explanation && (
                          <p className="text-sm text-muted-foreground mt-3">
                            <strong>Explanation:</strong> {mcq.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        // Problems view (existing code)
        loadingProblems ? (
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
                            {!problem.has_solution && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Problem Only
                              </Badge>
                            )}
                            {problem.verified_by_instructor ? (
                              <Badge 
                                variant="default" 
                                className="text-xs bg-primary/10 text-primary border-primary/20 cursor-pointer hover:bg-primary/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  verifyProblemMutation.mutate({ problemId: problem.id, verified: false });
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2 border-dashed hover:border-primary hover:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  verifyProblemMutation.mutate({ problemId: problem.id, verified: true });
                                }}
                                disabled={verifyProblemMutation.isPending}
                              >
                                {verifyProblemMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                )}
                                Click to Verify
                              </Button>
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
                      {/* Solution - only show if has_solution */}
                      {problem.has_solution ? (
                        <>
                          {problem.solution_text && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Solution:</p>
                              <p className="text-sm">{problem.solution_text}</p>
                            </div>
                          )}

                          {/* Final Answer */}
                          {problem.final_answer && (
                            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                              <p className="text-sm font-medium text-primary mb-1">Final Answer:</p>
                              <p className="font-mono font-medium">
                                {problem.final_answer}
                                {problem.units && <span className="ml-1 text-muted-foreground">{problem.units}</span>}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm font-medium text-amber-700 mb-1">No Solution Available</p>
                          <p className="text-sm text-amber-600">
                            This is a problem-only entry. You can add a solution by clicking Edit below.
                          </p>
                        </div>
                      )}

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
        )
      )}
    </div>
  );
}
