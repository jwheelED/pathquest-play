import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart3, 
  RefreshCw, 
  User, 
  CheckCircle, 
  XCircle,
  Clock,
  Loader2,
  MessageSquare,
  Code,
  FileText,
  ChevronDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { format, parseISO } from "date-fns";

interface Assignment {
  id: string;
  student_id: string;
  title: string;
  content: {
    source?: string;
    questionBankId?: string;
    questions?: Array<{
      type?: string;
      question?: string;
      options?: string[];
      correctAnswer?: string;
      expectedAnswer?: string;
      problemText?: string;
    }>;
  } | null;
  quiz_responses: Record<string, any> | null; // Contains answers + embedded _ai_recommendations
  grade: number | null; // Top-level grade
  completed: boolean;
  created_at: string;
}

interface StudentProfile {
  id: string;
  full_name: string | null;
}

interface QuestionGroup {
  questionBankId: string;
  title: string;
  questionType: string;
  timestamp: string;
  assignments: Assignment[];
  questionContent: any;
}

export function QuestionBankResults() {
  const { selectedCourseId } = useCourseContext();
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfiles, setStudentProfiles] = useState<Record<string, StudentProfile>>({});

  const fetchResults = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !selectedCourseId) return;

      const { data: assignments, error } = await supabase
        .from("student_assignments")
        .select("*")
        .eq("instructor_id", user.id)
        .eq("course_id", selectedCourseId)
        .eq("assignment_type", "lecture_checkin")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Filter for question_bank source and cast properly
      const bankAssignments = (assignments || [])
        .filter((a: any) => a.content?.source === "question_bank")
        .map((a: any) => ({
          id: a.id,
          student_id: a.student_id,
          title: a.title,
          content: a.content as Assignment["content"],
          quiz_responses: a.quiz_responses as Record<string, any> | null,
          grade: a.grade as number | null,
          completed: a.completed,
          created_at: a.created_at,
        })) as Assignment[];

      // Group by questionBankId + timestamp window (5 min)
      const grouped = groupAssignments(bankAssignments);
      setGroups(grouped);

      // Fetch student profiles
      const studentIds = [...new Set(bankAssignments.map(a => a.student_id))];
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

        const profileMap: Record<string, StudentProfile> = {};
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = { id: p.id, full_name: p.full_name };
        });
        setStudentProfiles(profileMap);
      }
    } catch (error) {
      console.error("Error fetching question bank results:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCourseId]);

  const groupAssignments = (assignments: Assignment[]): QuestionGroup[] => {
    const groupMap = new Map<string, QuestionGroup>();

    assignments.forEach(assignment => {
      const bankId = assignment.content?.questionBankId || "unknown";
      const timestamp = assignment.created_at;
      
      // Create a key based on bankId and 5-minute window
      const date = parseISO(timestamp);
      const windowStart = new Date(Math.floor(date.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
      const key = `${bankId}-${windowStart.toISOString()}`;

      if (!groupMap.has(key)) {
        const questions = assignment.content?.questions || [];
        const firstQuestion = questions[0] || {};
        
        groupMap.set(key, {
          questionBankId: bankId,
          title: assignment.title || "Untitled Question",
          questionType: firstQuestion.type || "unknown",
          timestamp: windowStart.toISOString(),
          assignments: [],
          questionContent: firstQuestion,
        });
      }

      groupMap.get(key)!.assignments.push(assignment);
    });

    // Sort by timestamp descending
    return Array.from(groupMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  useEffect(() => {
    if (selectedCourseId) {
      fetchResults();
    }
  }, [selectedCourseId, fetchResults]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedCourseId) return;

    const channel = supabase
      .channel("question-bank-results")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "student_assignments",
          filter: `course_id=eq.${selectedCourseId}`,
        },
        () => {
          // Debounce refetch
          setTimeout(fetchResults, 300);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCourseId, fetchResults]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchResults();
  };

  const getQuestionTypeBadge = (type: string) => {
    switch (type) {
      case "multiple_choice":
        return <Badge variant="secondary">MCQ</Badge>;
      case "short_answer":
        return <Badge variant="outline">Short Answer</Badge>;
      case "coding":
      case "coding_simple":
        return <Badge variant="secondary" className="bg-secondary/50">Coding</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStudentName = (studentId: string) => {
    const profile = studentProfiles[studentId];
    return profile?.full_name || "Unknown Student";
  };

  const calculateStats = (assignments: Assignment[]) => {
    const completed = assignments.filter(a => a.completed).length;
    const total = assignments.length;
    
    // Extract grades from top-level grade or embedded _ai_recommendations
    const grades = assignments
      .map(a => {
        // First check top-level grade
        if (a.grade !== null && a.grade !== undefined) return a.grade;
        // Fallback to embedded AI recommendations
        const aiRec = a.quiz_responses?._ai_recommendations?.["0"];
        if (aiRec?.grade !== undefined) return aiRec.grade;
        return null;
      })
      .filter((g): g is number => g !== null);
    
    const avgGrade = grades.length > 0 
      ? Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length)
      : null;

    return { completed, total, avgGrade };
  };

  const ExpandableResponse = ({ 
    answer, 
    grade, 
    feedback, 
    questionType 
  }: { 
    answer: string | null | undefined; 
    grade: number | undefined; 
    feedback: string | null | undefined;
    questionType: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isCoding = questionType === "coding" || questionType === "coding_simple";
    const isShortAnswer = questionType === "short_answer";
    const needsExpansion = isCoding || isShortAnswer;
    const previewLength = isCoding ? 80 : 60;

    if (!needsExpansion) {
      // MCQ - just show the answer
      return (
        <div className="flex items-center gap-2">
          <Badge variant={grade === 100 ? "default" : "destructive"}>
            {answer}
          </Badge>
          {grade === 100 ? (
            <CheckCircle className="w-4 h-4 text-primary" />
          ) : (
            <XCircle className="w-4 h-4 text-destructive" />
          )}
        </div>
      );
    }

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isCoding ? (
              <Code className="w-4 h-4 text-primary flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
            )}
            <Badge 
              variant={grade !== undefined && grade >= 70 ? "default" : grade !== undefined ? "destructive" : "outline"}
              className={grade !== undefined && grade >= 70 ? "bg-green-600" : ""}
            >
              {grade !== undefined ? `${grade}%` : "Pending"}
            </Badge>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
              <span>{isOpen ? "Hide" : "View"}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Preview when collapsed */}
        {!isOpen && answer && (
          <p className="text-xs text-muted-foreground truncate mt-1">
            {answer.slice(0, previewLength)}{answer.length > previewLength ? "..." : ""}
          </p>
        )}

        <CollapsibleContent className="mt-2">
          {isCoding ? (
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-md overflow-x-auto text-xs font-mono whitespace-pre-wrap max-h-60">
              {answer || "(empty)"}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap p-3 bg-muted/50 rounded">
              {answer || "(empty)"}
            </p>
          )}

          {feedback && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-2 rounded mt-2 border border-blue-200 dark:border-blue-800">
              <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-600" />
              <span>{feedback}</span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderAnswer = (assignment: Assignment, group: QuestionGroup) => {
    // Get answer from quiz_responses (exclude _ai_recommendations key)
    const responses = assignment.quiz_responses || {};
    const answer = responses["0"] || responses.q0;
    
    // Get grade from top-level or embedded AI recommendations
    let grade: number | undefined;
    if (assignment.grade !== null && assignment.grade !== undefined) {
      grade = assignment.grade;
    } else {
      const aiRec = responses._ai_recommendations?.["0"];
      if (aiRec?.grade !== undefined) grade = aiRec.grade;
    }
    
    // Get feedback from embedded AI recommendations
    const aiRec = responses._ai_recommendations?.["0"];
    const feedback = aiRec?.feedback;

    // Filter out _ai_recommendations from being treated as an answer
    const actualAnswer = typeof answer === 'string' ? answer : undefined;

    if (!actualAnswer && !assignment.completed) {
      return (
        <span className="text-muted-foreground italic flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Not submitted
        </span>
      );
    }

    return (
      <ExpandableResponse
        answer={actualAnswer}
        grade={grade}
        feedback={feedback}
        questionType={group.questionType}
      />
    );
  };

  if (loading) {
    return (
      <Card className="headspace-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="headspace-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Question Bank Results
            </CardTitle>
            <CardDescription>
              View student responses to pushed questions
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-muted-foreground mb-1">
              No results yet
            </h3>
            <p className="text-sm text-muted-foreground">
              Push a question to students to see their responses here
            </p>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {groups.map((group, idx) => {
              const stats = calculateStats(group.assignments);
              
              return (
                <AccordionItem
                  key={`${group.questionBankId}-${idx}`}
                  value={`${group.questionBankId}-${idx}`}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex flex-col items-start gap-1 text-left flex-1 mr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{group.title}</span>
                        {getQuestionTypeBadge(group.questionType)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Pushed: {format(parseISO(group.timestamp), "MMM d, h:mm a")}
                        </span>
                        <span>•</span>
                        <span>{stats.completed}/{stats.total} submitted</span>
                        {stats.avgGrade !== null && (
                          <>
                            <span>•</span>
                            <span>Avg: {stats.avgGrade}%</span>
                          </>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ScrollArea className="max-h-80">
                      <div className="space-y-3 pr-4">
                        {group.assignments.map(assignment => (
                          <div
                            key={assignment.id}
                            className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                          >
                            <div className="flex items-center gap-2 min-w-[140px]">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium truncate">
                                {getStudentName(assignment.student_id)}
                              </span>
                            </div>
                            <div className="flex-1">
                              {renderAnswer(assignment, group)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
