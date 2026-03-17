import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, TrendingUp, Trash2, AlertTriangle, Download, Trash, ThumbsUp, ThumbsDown, Sparkles, RefreshCw, Heart, FileText, BarChart3, ChevronDown, Code, Users, ClipboardList } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuestionAnalyticsChart } from "./QuestionAnalyticsChart";
import { ShortAnswerAnalytics } from "./ShortAnswerAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseContext } from "@/hooks/useCourseContext";
import { MathRenderer } from "@/components/ui/math-renderer";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Progress } from "@/components/ui/progress";

interface Assignment {
  id: string;
  student_id: string;
  title: string;
  content: any;
  quiz_responses: any;
  grade: number | null;
  completed: boolean;
  created_at: string;
  student_name?: string;
  response_time_seconds?: number | null;
}

interface GroupedAssignment {
  timestamp: string;
  assignments: Assignment[];
  questions: any[];
}

export const LectureCheckInResults = () => {
  const [groupedResults, setGroupedResults] = useState<GroupedAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<{
    groupIdx: number;
    questionIdx: number;
    newAnswer: string;
    group: GroupedAssignment;
  } | null>(null);
  const [questionRatings, setQuestionRatings] = useState<Record<string, string>>({});
  const [showCharts, setShowCharts] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('lectureCheckInChartsVisibility');
    return saved ? JSON.parse(saved) : {};
  });
  const [questionSummaries, setQuestionSummaries] = useState<Record<string, {
    summary: string;
    trend: string;
    sentiment?: string;
    themes?: string[];
    topResponses?: Array<{
      studentName: string;
      grade: number;
      answerSnippet: string;
      highlight: string;
    }>;
    loading: boolean;
    responseCount?: number;
  }>>({});
  const { selectedCourse } = useCourseContext();

  useEffect(() => {
    localStorage.setItem('lectureCheckInChartsVisibility', JSON.stringify(showCharts));
  }, [showCharts]);

  const fetchResults = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    
    const courseId = selectedCourse?.id;

    // Optimized query: Fetch only recent check-ins (last 24 hours) to reduce load
    // For classroom of 40 students, this limits data transfer significantly
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    // Build query - fetch all lecture check-in assignments
    let query = supabase
      .from("student_assignments")
      .select(
        `
        id,
        student_id,
        title,
        content,
        quiz_responses,
        grade,
        completed,
        created_at,
        response_time_seconds,
        ai_summary
      `,
      )
      .eq("instructor_id", user.id)
      .eq("assignment_type", "lecture_checkin")
      .gte("created_at", oneDayAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(200); // Limit to prevent excessive data with large classes

    // Filter by course if selected, otherwise get all
    if (courseId) {
      query = query.eq("course_id", courseId);
    }

    const { data: assignments, error } = await query;

    if (error) {
      console.error("Error fetching results:", error);
      setLoading(false);
      return;
    }

    console.log("📊 Check-in results fetched:", {
      total: assignments?.length || 0,
      courseId,
      hasCompleted: assignments?.filter(a => a.completed).length,
      hasResponses: assignments?.filter(a => a.quiz_responses).length,
    });

    // Get student names from profiles table only (RLS-aware)
    const studentIds = [...new Set(assignments?.map((a) => a.student_id) || [])];
    const { data: profilesResult } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", studentIds);

    // Build name map: profiles.full_name -> fallback "Unknown Student"
    const studentMap = new Map<string, string>();
    studentIds.forEach((id) => {
      const profileName = profilesResult?.find((p) => p.id === id)?.full_name;
      studentMap.set(id, profileName || "Unknown Student");
    });

    // Add student names to assignments
    const assignmentsWithNames =
      assignments?.map((a) => ({
        ...a,
        student_name: studentMap.get(a.student_id) || "Unknown Student",
      })) || [];

    // Group by timestamp (within 5 minutes)
    const groups: GroupedAssignment[] = [];

    assignmentsWithNames.forEach((assignment) => {
      const timestamp = new Date(assignment.created_at).getTime();
      const content = assignment.content as any;
      const assignmentQuestions = content?.questions || [];

      // Find existing group within 5 minutes
      const existingGroupIndex = groups.findIndex((g) => {
        const groupTime = new Date(g.timestamp).getTime();
        return Math.abs(timestamp - groupTime) < 5 * 60 * 1000;
      });

      if (existingGroupIndex !== -1) {
        // Create new arrays to ensure React detects the change
        const existingGroup = groups[existingGroupIndex];
        const newAssignments = [...existingGroup.assignments, assignment];
        
        // Merge questions from this assignment into the group
        const newQuestions = [...existingGroup.questions];
        assignmentQuestions.forEach((newQuestion: any) => {
          // Check if this question already exists (by question text to avoid duplicates)
          const alreadyExists = newQuestions.some(
            (q: any) => q.question === newQuestion.question
          );
          
          if (!alreadyExists) {
            newQuestions.push(newQuestion);
          }
        });
        
        // Replace the group with a new object (immutable update)
        groups[existingGroupIndex] = {
          ...existingGroup,
          assignments: newAssignments,
          questions: newQuestions,
        };
      } else {
        // Create new group with initial questions
        groups.push({
          timestamp: assignment.created_at,
          assignments: [assignment],
          questions: [...assignmentQuestions],
        });
      }
    });

    setGroupedResults(groups);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [selectedCourse]);

  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    let channel: any;

    const setupRealtimeSubscription = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Set up real-time subscription for assignment updates
      // Note: Supabase Realtime only supports single-column filters, so we filter by instructor_id
      // and do client-side filtering for course_id and assignment_type
      const channelName = selectedCourse?.id 
        ? `instructor-checkin-results-${selectedCourse.id}`
        : `instructor-checkin-results-all`;
        
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "student_assignments",
            filter: `instructor_id=eq.${user.id}`,
          },
          (payload) => {
            // Handle INSERT (new questions) and UPDATE (student answers)
            const record = (payload.new || payload.old) as any;
            // Client-side filtering for assignment_type
            if (!record || record.assignment_type !== 'lecture_checkin') return;
            
            // Client-side filtering for course_id (if course is selected)
            if (selectedCourse?.id && record.course_id !== selectedCourse.id) return;
            
            console.log("✅ Check-in result updated:", payload.eventType, {
              studentId: record.student_id,
              completed: record.completed,
              hasResponses: !!record.quiz_responses,
            });
            toast.info("Student response received", { duration: 2000 });
            
            // Debounce to handle multiple rapid updates from 40+ students
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              fetchResults();
            }, 300);
          },
        )
        .subscribe((status) => {
          console.log("📡 Check-in subscription status:", status);
          if (status === 'SUBSCRIBED') {
            console.log("✅ Now listening for live student responses");
          }
        });

      // Initial fetch after subscription is set up
      await fetchResults();
    };

    setupRealtimeSubscription();

    return () => {
      clearTimeout(debounceTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchResults, selectedCourse]);

  // Lightweight polling fallback using timeout chain to prevent stale closures
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const poll = async () => {
      await fetchResults();
      timeoutId = setTimeout(poll, 5000);
    };
    
    // Start polling after 5 seconds
    timeoutId = setTimeout(poll, 5000);
    
    return () => clearTimeout(timeoutId);
  }, [fetchResults]);

  // Load existing AI summaries from database
  useEffect(() => {
    if (!groupedResults.length) return;

    const loadedSummaries: Record<string, any> = {};

    groupedResults.forEach((group, groupIdx) => {
      // Find first assignment with ai_summary data
      const assignmentWithSummary = group.assignments.find((a: any) => a.ai_summary);
      
      if (assignmentWithSummary) {
        const aiSummary = (assignmentWithSummary as any).ai_summary;
        
        // Load summaries for each question in this group
        group.questions.forEach((question, qIdx) => {
          const summaryKey = qIdx.toString();
          if (aiSummary && aiSummary[summaryKey]) {
            const summaryData = aiSummary[summaryKey];
            const key = `${groupIdx}-${qIdx}`;
            loadedSummaries[key] = {
              summary: summaryData.summary,
              trend: summaryData.trend,
              loading: false,
              responseCount: summaryData.response_count,
            };
          }
        });
      }
    });

    if (Object.keys(loadedSummaries).length > 0) {
      setQuestionSummaries(prev => ({ ...prev, ...loadedSummaries }));
    }
  }, [groupedResults]);

  const handleDeleteGroup = async (group: GroupedAssignment) => {
    try {
      const assignmentIds = group.assignments.map(a => a.id);
      const { error } = await supabase
        .from("student_assignments")
        .delete()
        .in("id", assignmentIds);

      if (error) throw error;
      
      toast.success("Check-in deleted successfully!");
      fetchResults();
    } catch (error) {
      console.error("Error deleting check-in:", error);
      toast.error("Failed to delete check-in");
    }
  };

  const handleDeleteAll = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("student_assignments")
        .delete()
        .eq("instructor_id", user.id)
        .eq("assignment_type", "lecture_checkin");

      if (error) throw error;
      
      toast.success("All check-ins deleted successfully!");
      fetchResults();
    } catch (error) {
      console.error("Error deleting all check-ins:", error);
      toast.error("Failed to delete all check-ins");
    }
  };

  const calculateQuestionStats = (assignments: Assignment[], questionIndex: number, question: any) => {
    // Filter assignments to only those containing this specific question
    const questionAssignments = assignments.filter((a) => {
      const content = a.content as any;
      const assignmentQuestions = content?.questions || [];
      return assignmentQuestions.some((q: any) => q.question === question.question);
    });

    // DEDUPLICATION: Keep only latest submission per student (same logic as UI)
    const uniqueStudents = new Map<string, Assignment>();
    questionAssignments.forEach((assignment) => {
      const existing = uniqueStudents.get(assignment.student_id);
      if (!existing || new Date(assignment.created_at) > new Date(existing.created_at)) {
        uniqueStudents.set(assignment.student_id, assignment);
      }
    });

    // Calculate stats from deduplicated list
    const uniqueAssignments = Array.from(uniqueStudents.values());
    const completed = uniqueAssignments.filter((a) => a.completed);
    
    // Use overridden answer if it exists, otherwise use original correctAnswer
    const correctAnswer = question.overriddenAnswer || question.correctAnswer;

    // Check if AI grades are available for short answers
    const aiGrades: number[] = [];
    if (question.type === 'short_answer') {
      completed.forEach((a) => {
        // Check quiz_responses._ai_recommendations first
        const aiRec = a.quiz_responses?._ai_recommendations;
        if (aiRec && typeof aiRec === 'object') {
          // AI recommendations can be an array or object keyed by question index
          const gradeValue = Array.isArray(aiRec) ? aiRec[0]?.grade : aiRec[questionIndex]?.grade;
          if (typeof gradeValue === 'number') {
            aiGrades.push(gradeValue);
          }
        }
        // Also check the assignment.grade field as fallback
        if (aiGrades.length === 0 && a.grade !== null && a.grade !== undefined) {
          aiGrades.push(a.grade);
        }
      });
    }

    const hasAIGrades = aiGrades.length > 0;
    
    // For short answer with no AI grades and no expected answer, mark as manual
    const isManualGradeShortAnswer = question.type === 'short_answer' && 
      !hasAIGrades &&
      (!question.expectedAnswer || question.expectedAnswer === '' || question.gradingMode === 'manual_grade');
    
    // Calculate correct count based on available data
    let correct: Assignment[] = [];
    if (hasAIGrades) {
      // Use AI grade >= 70 as "correct" threshold
      correct = completed.filter((a) => {
        const aiRec = a.quiz_responses?._ai_recommendations;
        if (aiRec && typeof aiRec === 'object') {
          const gradeValue = Array.isArray(aiRec) ? aiRec[0]?.grade : aiRec[questionIndex]?.grade;
          if (typeof gradeValue === 'number') {
            return gradeValue >= 70;
          }
        }
        return a.grade !== null && a.grade >= 70;
      });
    } else if (!isManualGradeShortAnswer) {
      // FIX: Find the question index within THIS student's assignment, not the group index
      correct = completed.filter((a) => {
        const assignmentContent = a.content as any;
        const assignmentQuestions = assignmentContent?.questions || [];
        const studentQuestionIdx = assignmentQuestions.findIndex(
          (q: any) => q.question === question.question
        );
        
        const response = studentQuestionIdx >= 0 
          ? (a.quiz_responses?.[studentQuestionIdx.toString()] || a.quiz_responses?.[studentQuestionIdx])
          : null;
        return response === correctAnswer;
      });
    }

    // Calculate average response time for completed assignments
    const responseTimes = completed
      .map(a => a.response_time_seconds)
      .filter((time): time is number => time !== null && time !== undefined);
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : null;

    // Calculate average AI grade if available
    const avgAIGrade = hasAIGrades
      ? Math.round(aiGrades.reduce((sum, g) => sum + g, 0) / aiGrades.length)
      : null;

    return {
      total: uniqueAssignments.length,
      completed: completed.length,
      correct: correct.length,
      percentage: isManualGradeShortAnswer ? null : (completed.length > 0 ? (correct.length / completed.length) * 100 : 0),
      avgResponseTime,
      isManualGradeShortAnswer,
      hasAIGrades,
      avgAIGrade,
    };
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Expandable code response component for coding questions
  const ExpandableCodeResponse = ({ 
    studentAnswer, 
    studentAIFeedback 
  }: { 
    studentAnswer: string; 
    studentAIFeedback: string | null;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full max-w-md">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Code className="h-3 w-3" />
            <span>{isOpen ? "Hide Code" : "View Code"}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <pre className="p-3 bg-slate-900 text-slate-100 rounded-md overflow-x-auto text-xs font-mono whitespace-pre-wrap text-left max-h-60">
            {studentAnswer}
          </pre>
          {studentAIFeedback && (
            <p className="mt-1 text-xs text-muted-foreground italic text-left p-2 bg-muted/50 rounded">
              💬 {studentAIFeedback}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // Coding submission card component with expandable code view
  const CodingSubmissionCard = ({ 
    assignment, 
    studentAnswer, 
    isCompleted, 
    currentGrade,
    questionAIRec,
    qIdx,
    fetchResults: fetchResultsFn
  }: { 
    assignment: Assignment;
    studentAnswer: string | null;
    isCompleted: boolean;
    currentGrade: number | null;
    questionAIRec: any;
    qIdx: number;
    fetchResults: () => void;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <div className="bg-white dark:bg-gray-900 p-3 rounded border">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-medium text-sm">{assignment.student_name}</span>
          <div className="flex items-center gap-2">
            {!isCompleted && (
              <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <Clock className="h-3 w-3" />
                Not Answered
              </Badge>
            )}
            {isCompleted && currentGrade !== null && (
              <Badge variant="default" className="bg-green-600">
                Grade: {currentGrade}/100
              </Badge>
            )}
          </div>
        </div>
        {isCompleted && studentAnswer && (
          <>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs mb-2 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30">
                  <Code className="h-3 w-3" />
                  <span>{isOpen ? "Hide Code" : "View Code"}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-md overflow-x-auto text-xs font-mono whitespace-pre-wrap mb-3 max-h-80">
                  {studentAnswer}
                </pre>
              </CollapsibleContent>
            </Collapsible>
            
            {questionAIRec && (
              <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded">
                <p className="text-xs font-semibold text-purple-900 dark:text-purple-200 mb-1">
                  🤖 AI Recommended Grade: {questionAIRec.grade}/100
                </p>
                <p className="text-xs text-purple-800 dark:text-purple-300">
                  {questionAIRec.feedback}
                </p>
              </div>
            )}
            
            <div className="flex items-center gap-2 pt-2 border-t">
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Grade (0-100)"
                defaultValue={currentGrade ?? questionAIRec?.grade ?? ''}
                className="w-24 px-2 py-1 text-sm border rounded"
                id={`coding-grade-${assignment.id}`}
              />
              <Button
                size="sm"
                onClick={async () => {
                  const input = document.getElementById(`coding-grade-${assignment.id}`) as HTMLInputElement;
                  const grade = parseInt(input.value);
                  
                  if (isNaN(grade) || grade < 0 || grade > 100) {
                    toast.error("Please enter a valid grade (0-100)");
                    return;
                  }

                  const { error } = await supabase
                    .from('student_assignments')
                    .update({ grade })
                    .eq('id', assignment.id);

                  if (error) {
                    toast.error("Failed to save grade");
                    return;
                  }

                  toast.success(`Grade saved: ${grade}/100`);
                  fetchResultsFn();
                }}
              >
                Save Grade
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  const generateSummary = async (
    groupIdx: number, 
    qIdx: number, 
    question: any, 
    assignments: Assignment[]
  ) => {
    const key = `${groupIdx}-${qIdx}`;
    
    setQuestionSummaries(prev => ({
      ...prev,
      [key]: { ...prev[key], summary: '', trend: '', loading: true }
    }));

    try {
      const stats = calculateQuestionStats(assignments, qIdx, question);
      const studentResponses = assignments
        .filter(a => a.completed)
        .map(a => {
          // FIX: Find the question index within THIS student's assignment
          const assignmentContent = a.content as any;
          const assignmentQuestions = assignmentContent?.questions || [];
          const studentQuestionIdx = assignmentQuestions.findIndex(
            (q: any) => q.question === question.question
          );
          const studentAnswer = studentQuestionIdx >= 0 
            ? (a.quiz_responses?.[studentQuestionIdx.toString()] || a.quiz_responses?.[studentQuestionIdx])
            : null;
          
          return {
            answer: studentAnswer,
            isCorrect: studentAnswer === (question.overriddenAnswer || question.correctAnswer),
            grade: a.grade,
            studentName: a.student_name || 'Unknown Student'
          };
        });

      const { data, error } = await supabase.functions.invoke('generate-question-summary', {
        body: {
          question: question.question,
          questionType: question.type || 'multiple_choice',
          correctAnswer: question.overriddenAnswer || question.correctAnswer,
          options: question.options,
          studentResponses,
          totalStudents: stats.total,
          completedCount: stats.completed,
          courseType: selectedCourse?.course_type || 'stem'
        }
      });

      if (error) throw error;

      setQuestionSummaries(prev => ({
        ...prev,
        [key]: {
          summary: data.summary,
          trend: data.trend,
          sentiment: data.sentiment,
          themes: data.themes,
          topResponses: data.topResponses,
          loading: false,
          responseCount: stats.completed
        }
      }));

      // Save to database for persistence
      const summaryData = {
        summary: data.summary,
        trend: data.trend,
        generated_at: new Date().toISOString(),
        response_count: stats.completed,
      };

      // Update all assignments in this group with the summary
      const assignmentIds = assignments.map((a) => a.id);
      
      // For each assignment, fetch current ai_summary, merge, and update
      for (const assignment of assignments) {
        const currentSummary = (assignment as any).ai_summary || {};
        const updatedSummary = {
          ...currentSummary,
          [qIdx]: summaryData
        };
        
        await supabase
          .from("student_assignments")
          .update({ ai_summary: updatedSummary })
          .eq("id", assignment.id);
      }

      toast.success('AI summary generated!');
    } catch (error) {
      console.error('Error generating summary:', error);
      setQuestionSummaries(prev => ({
        ...prev,
        [key]: {
          summary: 'Summary: Unable to generate AI summary.',
          trend: 'Trend: Please try again or review manually.',
          loading: false
        }
      }));
      toast.error('Failed to generate summary');
    }
  };

  // Generate a stable UUID from question content for rating reference
  const generateQuestionRatingId = async (question: any, instructorId: string): Promise<string> => {
    const questionData = JSON.stringify({
      question: question.question,
      type: question.type,
      instructor: instructorId
    });
    
    const encoder = new TextEncoder();
    const data = encoder.encode(questionData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // Convert to UUID format (using first 16 bytes)
    const hex = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  };

  const handleRateQuestion = async (question: any, groupIdx: number, qIdx: number, rating: 'helpful' | 'not_helpful') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Generate a stable UUID for this question
      const referenceId = await generateQuestionRatingId(question, user.id);
      const ratingKey = `${groupIdx}-${qIdx}`;

      const { error } = await supabase
        .from('ai_quality_ratings')
        .insert({
          user_id: user.id,
          rating_type: 'question_generation',
          reference_id: referenceId,
          rating: rating
        });

      if (error) throw error;

      setQuestionRatings(prev => ({ ...prev, [ratingKey]: rating }));
      toast.success('Thank you for your feedback!');
    } catch (error) {
      console.error('Error saving rating:', error);
      toast.error('Failed to save rating');
    }
  };

  const handleInitiateOverride = (groupIdx: number, questionIdx: number, currentAnswer: string) => {
    const group = groupedResults[groupIdx];
    setSelectedOverride({
      groupIdx,
      questionIdx,
      newAnswer: currentAnswer,
      group,
    });
    setOverrideDialogOpen(true);
  };

  const recalculateGradesForQuestion = async (assignments: Assignment[], questionIdx: number, questions: any[]) => {
    try {
      for (const assignment of assignments) {
        if (!assignment.completed) continue;

        // Get all multiple choice questions
        const mcQuestions = questions.filter((q: any) => q.type !== 'short_answer');
        
        if (mcQuestions.length === 0) continue;

        // Calculate correct count using overridden answers where applicable
        let correctCount = 0;
        mcQuestions.forEach((q: any, idx: number) => {
          // quiz_responses is an object with string keys like {"0": "B"}
          const userAnswer = assignment.quiz_responses?.[idx.toString()] || assignment.quiz_responses?.[idx];
          const rightAnswer = q.overriddenAnswer || q.correctAnswer;
          if (userAnswer === rightAnswer) {
            correctCount++;
          }
        });

        // Calculate new grade
        const newGrade = (correctCount / mcQuestions.length) * 100;

        // Update in database
        const { error } = await supabase
          .from('student_assignments')
          .update({ grade: newGrade })
          .eq('id', assignment.id);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error recalculating grades:', error);
      throw error;
    }
  };

  const handleConfirmOverride = async () => {
    if (!selectedOverride) return;

    const { groupIdx, questionIdx, newAnswer, group } = selectedOverride;

    try {
      // Update all assignments in this group with the overridden answer
      const assignmentIds = group.assignments.map(a => a.id);
      
      // Update each assignment's content with the overridden answer
      for (const assignment of group.assignments) {
        const updatedContent = { ...assignment.content };
        if (!updatedContent.questions[questionIdx]) continue;
        
        // Store original answer if not already stored
        if (!updatedContent.questions[questionIdx].originalAnswer) {
          updatedContent.questions[questionIdx].originalAnswer = 
            updatedContent.questions[questionIdx].correctAnswer;
        }
        
        // Set the overridden answer
        updatedContent.questions[questionIdx].overriddenAnswer = newAnswer;

        const { error: updateError } = await supabase
          .from('student_assignments')
          .update({ content: updatedContent })
          .eq('id', assignment.id);

        if (updateError) throw updateError;
      }

      // Recalculate all grades for this group
      const updatedQuestions = [...group.questions];
      if (!updatedQuestions[questionIdx].originalAnswer) {
        updatedQuestions[questionIdx].originalAnswer = updatedQuestions[questionIdx].correctAnswer;
      }
      updatedQuestions[questionIdx].overriddenAnswer = newAnswer;

      await recalculateGradesForQuestion(group.assignments, questionIdx, updatedQuestions);

      toast.success(`Answer overridden! Grades recalculated for ${group.assignments.length} student(s).`);
      
      // Refresh results
      await fetchResults();
      setOverrideDialogOpen(false);
      setSelectedOverride(null);
    } catch (error) {
      console.error('Error applying override:', error);
      toast.error('Failed to apply override');
    }
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Header
      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text("Lecture Check-In Report", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${today}`, pageWidth / 2, 28, { align: "center" });

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 34, pageWidth - 20, 34);

      let yPosition = 45;

      // Loop through each check-in group
      groupedResults.forEach((group, groupIdx) => {
        // Check if we need a new page
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        // Check-in header
        const checkInDate = new Date(group.timestamp).toLocaleString();
        doc.setFontSize(14);
        doc.setTextColor(40, 40, 40);
        doc.text(`Check-In: ${checkInDate}`, 20, yPosition);
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`${group.assignments.length} student(s)`, 20, yPosition + 6);
        yPosition += 15;

        // Questions section
        group.questions.forEach((question, qIdx) => {
          const stats = calculateQuestionStats(group.assignments, qIdx, question);
          
          // Check for page break before question
          if (yPosition > 230) {
            doc.addPage();
            yPosition = 20;
          }
          
          // Question box
          doc.setFontSize(11);
          doc.setTextColor(60, 60, 60);
          const questionLines = doc.splitTextToSize(`Q${qIdx + 1}: ${question.question}`, pageWidth - 40);
          doc.text(questionLines, 20, yPosition);
          yPosition += questionLines.length * 5 + 3;
          
          // Question stats
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          const statsText = stats.isManualGradeShortAnswer
            ? `Completed: ${stats.completed}/${stats.total} | Avg Time: ${stats.avgResponseTime ? formatTime(stats.avgResponseTime) : 'N/A'}`
            : `Correct: ${stats.correct}/${stats.completed} (${stats.percentage?.toFixed(0) || 0}%) | Avg Time: ${stats.avgResponseTime ? formatTime(stats.avgResponseTime) : 'N/A'}`;
          doc.text(statsText, 20, yPosition);
          yPosition += 8;

          // Student responses table
          const responseData = group.assignments.map(assignment => {
            // Find the question index within this student's assignment
            const assignmentContent = assignment.content as any;
            const assignmentQuestions = assignmentContent?.questions || [];
            const studentQuestionIdx = assignmentQuestions.findIndex(
              (q: any) => q.question === question.question
            );
            
            const studentAnswer = studentQuestionIdx >= 0 
              ? (assignment.quiz_responses?.[studentQuestionIdx.toString()] || assignment.quiz_responses?.[studentQuestionIdx] || 'No Answer')
              : 'No Answer';
            const correctAnswer = question.overriddenAnswer || question.correctAnswer;
            const isCorrect = studentAnswer === correctAnswer;
            
            return [
              assignment.student_name || 'Unknown',
              String(studentAnswer).substring(0, 50) + (String(studentAnswer).length > 50 ? '...' : ''),
              String(correctAnswer || 'N/A').substring(0, 50) + (String(correctAnswer || '').length > 50 ? '...' : ''),
              isCorrect ? '✓' : '✗',
              assignment.grade !== null ? `${assignment.grade.toFixed(0)}%` : 'N/A'
            ];
          });

          autoTable(doc, {
            startY: yPosition,
            head: [['Student', 'Answer', 'Correct Answer', 'Result', 'Grade']],
            body: responseData,
            theme: 'striped',
            headStyles: { 
              fillColor: [79, 70, 229], 
              textColor: 255,
              fontStyle: 'bold',
              fontSize: 9
            },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [245, 245, 250] },
            margin: { left: 20, right: 20 },
            tableWidth: 'auto',
            columnStyles: {
              0: { cellWidth: 35 },
              1: { cellWidth: 45 },
              2: { cellWidth: 45 },
              3: { cellWidth: 15, halign: 'center' },
              4: { cellWidth: 20, halign: 'center' }
            }
          });

          yPosition = (doc as any).lastAutoTable.finalY + 15;
        });

        // Add spacing between groups
        yPosition += 10;
      });

      // Save PDF
      doc.save(`lecture-checkin-report-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Failed to export PDF');
    }
  };

  const exportToCSV = () => {
    try {
      // Build CSV content
      const csvRows: string[] = [];
      
      // Add header row
      csvRows.push('Check-In Date,Student Name,Question #,Question Text,Student Answer,Correct Answer,Is Correct,Grade,Response Time (seconds),Completed');
      
      // Add data rows
      groupedResults.forEach((group) => {
        const checkInDate = new Date(group.timestamp).toLocaleString();
        
        group.assignments.forEach((assignment) => {
          group.questions.forEach((question, qIdx) => {
            const correctAnswer = question.overriddenAnswer || question.correctAnswer;
            // quiz_responses is an object with string keys like {"0": "B"}
            const studentAnswer = assignment.quiz_responses?.[qIdx.toString()] || assignment.quiz_responses?.[qIdx] || 'No Answer';
            const isCorrect = studentAnswer === correctAnswer;
            const questionNum = qIdx + 1;
            
            // Escape quotes and commas in text fields
            const escapeCSV = (str: string) => {
              if (str === null || str === undefined) return '';
              const stringValue = String(str);
              if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
              }
              return stringValue;
            };
            
            csvRows.push([
              escapeCSV(checkInDate),
              escapeCSV(assignment.student_name || 'Unknown'),
              questionNum,
              escapeCSV(question.question),
              escapeCSV(studentAnswer),
              escapeCSV(correctAnswer),
              isCorrect ? 'Yes' : 'No',
              assignment.grade !== null ? assignment.grade.toFixed(1) : 'N/A',
              assignment.response_time_seconds !== null ? assignment.response_time_seconds : 'N/A',
              assignment.completed ? 'Yes' : 'No'
            ].join(','));
          });
        });
      });
      
      // Create CSV content
      const csvContent = csvRows.join('\n');
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `lecture-checkin-results-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('CSV exported successfully!');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  // Compute summary metrics across all groups
  const summaryMetrics = (() => {
    let totalQuestions = 0;
    let totalCompleted = 0;
    let totalExpected = 0;
    const allPercentages: number[] = [];
    const allResponseTimes: number[] = [];

    groupedResults.forEach((group) => {
      totalQuestions += group.questions.length;
      group.questions.forEach((question, qIdx) => {
        const stats = calculateQuestionStats(group.assignments, qIdx, question);
        totalCompleted += stats.completed;
        totalExpected += stats.total;
        if (stats.percentage !== null) {
          allPercentages.push(stats.percentage);
        }
        if (stats.avgResponseTime !== null) {
          allResponseTimes.push(stats.avgResponseTime);
        }
      });
    });

    const avgAccuracy = allPercentages.length > 0
      ? Math.round(allPercentages.reduce((s, v) => s + v, 0) / allPercentages.length)
      : null;
    const responseRate = totalExpected > 0
      ? Math.round((totalCompleted / totalExpected) * 100)
      : 0;
    const avgTime = allResponseTimes.length > 0
      ? Math.round(allResponseTimes.reduce((s, v) => s + v, 0) / allResponseTimes.length)
      : null;

    return { totalQuestions, avgAccuracy, responseRate, totalCompleted, totalExpected, avgTime };
  })();

  // Helper: relative time formatting for group headers
  const formatRelativeTime = (timestamp: string): string => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Live Room Insight
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border rounded-2xl p-3 space-y-3">
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="border rounded-lg p-5 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (groupedResults.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Live Room Insight
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-muted-foreground mb-1">No check-ins yet</p>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              Send a lecture check-in question to your students during a live session to see results here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return lastUpdated.toLocaleTimeString();
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchResults();
  };

  return (
    <Card className="shadow-lg border-2 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-6 w-6 text-primary shrink-0" />
                <span className="truncate">Live Room Insight</span>
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Auto-graded performance • Last synced: {formatLastUpdated()}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              onClick={handleManualRefresh} 
              variant="outline" 
              size="sm" 
              className="gap-1"
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Syncing...' : 'Refresh'}</span>
            </Button>
            <Button onClick={exportToPDF} variant="outline" size="sm" className="gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-1">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1">
                  <Trash className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete All</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete All Check-Ins?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all lecture check-in results and student responses. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={<FileText className="h-4 w-4" />}
            label="Total Questions"
            value={summaryMetrics.totalQuestions}
            size="sm"
            variant="primary"
          />
          <MetricCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Avg Accuracy"
            value={summaryMetrics.avgAccuracy !== null ? `${summaryMetrics.avgAccuracy}%` : 'N/A'}
            size="sm"
            variant={summaryMetrics.avgAccuracy !== null && summaryMetrics.avgAccuracy >= 70 ? 'success' : 'warning'}
          />
          <MetricCard
            icon={<Users className="h-4 w-4" />}
            label="Response Rate"
            value={`${summaryMetrics.responseRate}%`}
            size="sm"
            variant="default"
          />
          <MetricCard
            icon={<Clock className="h-4 w-4" />}
            label="Avg Response Time"
            value={summaryMetrics.avgTime !== null ? formatTime(summaryMetrics.avgTime) : 'N/A'}
            size="sm"
            variant="default"
          />
        </div>

        <Accordion type="single" collapsible className="space-y-4" defaultValue="group-0">
          {groupedResults.map((group, groupIdx) => (
            <AccordionItem key={groupIdx} value={`group-${groupIdx}`} className="border-2 rounded-lg px-4 shadow-sm bg-card">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline">{formatRelativeTime(group.timestamp)}</Badge>
                    <Badge variant="secondary" className="text-xs">{group.questions.length} question{group.questions.length !== 1 ? 's' : ''}</Badge>
                    <span className="text-sm text-muted-foreground">{group.assignments.length} student(s)</span>
                    {(() => {
                      const groupPercentages: number[] = [];
                      group.questions.forEach((q, qi) => {
                        const s = calculateQuestionStats(group.assignments, qi, q);
                        if (s.percentage !== null) groupPercentages.push(s.percentage);
                      });
                      if (groupPercentages.length === 0) return null;
                      const avg = Math.round(groupPercentages.reduce((a, b) => a + b, 0) / groupPercentages.length);
                      return (
                        <Badge variant="outline" className={`text-xs ${avg >= 70 ? 'border-green-500 text-green-600' : avg >= 50 ? 'border-amber-500 text-amber-600' : 'border-red-500 text-red-600'}`}>
                          {avg}% avg
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3">
                    {group.assignments.filter((a) => a.completed).length === group.assignments.length ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        All Complete
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {group.assignments.filter((a) => a.completed).length}/{group.assignments.length} Complete
                      </Badge>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 w-8 p-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Check-In?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove this check-in for all {group.assignments.length} student(s). This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(group);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pt-5 pb-4">
                {group.questions.map((question, qIdx) => {
                  const stats = calculateQuestionStats(group.assignments, qIdx, question);
                  const currentCorrectAnswer = question.overriddenAnswer || question.correctAnswer;
                  const isOverridden = !!question.overriddenAnswer;

                  return (
                    <div key={qIdx} className={`border rounded-lg p-5 space-y-4 shadow-sm bg-card border-l-4 ${
                      isOverridden ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' :
                      stats.percentage === null ? 'border-l-blue-500' :
                      stats.percentage >= 80 ? 'border-l-green-500' :
                      stats.percentage >= 50 ? 'border-l-amber-500' :
                      'border-l-red-500'
                    }`}>
                      {isOverridden && (
                        <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400 text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-medium">
                            Answer Overridden: {question.originalAnswer} → {question.overriddenAnswer}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium mb-2">
                            <MathRenderer content={question.question} />
                          </div>
                          {question.options && (
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {question.options.map((opt: string, oIdx: number) => {
                                const letter = String.fromCharCode(65 + oIdx); // A, B, C, D...
                                const isCorrect = letter === currentCorrectAnswer;
                                return (
                                  <li
                                    key={oIdx}
                                    className={`flex items-start gap-1 ${isCorrect ? "font-medium text-green-600 dark:text-green-500" : ""}`}
                                  >
                                    <span className="font-bold shrink-0">{letter}.</span>
                                    <span className="flex-1"><MathRenderer content={opt} /></span>
                                    {isCorrect && <span className="shrink-0">✓</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {/* Completion Progress Bar */}
                          {stats.total > 0 && (
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>{stats.completed}/{stats.total} responded</span>
                                <span>{Math.round((stats.completed / stats.total) * 100)}%</span>
                              </div>
                              <Progress value={(stats.completed / stats.total) * 100} className="h-2" />
                            </div>
                          )}
                        </div>
                        <div className="text-right space-y-2">
                          <div>
                            {stats.hasAIGrades && stats.avgAIGrade !== null ? (
                              <>
                                <div className={`text-2xl font-bold ${stats.avgAIGrade >= 70 ? 'text-green-600' : stats.avgAIGrade >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                  {stats.avgAIGrade}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Avg AI Grade ({stats.completed} graded)
                                </div>
                              </>
                            ) : stats.isManualGradeShortAnswer ? (
                              <>
                                <div className="text-sm font-medium text-blue-600 dark:text-blue-400">Manual Review Required</div>
                                <div className="text-xs text-muted-foreground">
                                  {stats.completed} response(s)
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-2xl font-bold">{(stats.percentage || 0).toFixed(0)}%</div>
                                <div className="text-xs text-muted-foreground">
                                  {stats.correct}/{stats.completed} correct
                                </div>
                              </>
                            )}
                            {stats.avgResponseTime !== null && (
                              <div className="text-xs text-muted-foreground mt-1">
                                <Clock className="h-3 w-3 inline mr-1" />
                                Avg: {formatTime(stats.avgResponseTime)}
                              </div>
                            )}
                          </div>
                          {question.options && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleInitiateOverride(groupIdx, qIdx, currentCorrectAnswer)}
                              className="text-xs"
                            >
                              Override Answer
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* AI Summary Section */}
                      <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <h4 className="text-sm font-semibold">Insights</h4>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {questionSummaries[`${groupIdx}-${qIdx}`]?.loading ? (
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                              </div>
                            ) : questionSummaries[`${groupIdx}-${qIdx}`] ? (
                              <div className="text-sm space-y-1">
                                <p className="font-medium text-primary">
                                  {questionSummaries[`${groupIdx}-${qIdx}`].summary}
                                </p>
                                <p className="text-muted-foreground">
                                  {questionSummaries[`${groupIdx}-${qIdx}`].trend}
                                </p>
                                {questionSummaries[`${groupIdx}-${qIdx}`].sentiment && selectedCourse?.course_type === 'humanities' && (
                                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary/10">
                                    <Heart className="h-4 w-4 text-pink-500" />
                                    <span className="text-muted-foreground italic">
                                      {questionSummaries[`${groupIdx}-${qIdx}`].sentiment}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                No summary generated yet
                              </div>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateSummary(groupIdx, qIdx, question, group.assignments)}
                            disabled={questionSummaries[`${groupIdx}-${qIdx}`]?.loading}
                            className="gap-2 shrink-0"
                          >
                            <Sparkles className="h-4 w-4" />
                            {(() => {
                              const summary = questionSummaries[`${groupIdx}-${qIdx}`];
                              if (!summary) return 'Generate';
                              
                              // Check if summary is stale (response count changed)
                              const stats = calculateQuestionStats(group.assignments, qIdx, question);
                              const isStale = summary.responseCount && summary.responseCount !== stats.completed;
                              
                              return isStale ? 'Update' : 'Refresh';
                            })()} Summary
                          </Button>
                        </div>
                      </div>

                      {/* Analytics Section - Different for text-based vs multiple choice */}
                      {(question.type === 'short_answer' || question.type === 'coding') ? (
                        /* Short Answer / Coding: Show AI-powered summary analytics instead of charts */
                        <ShortAnswerAnalytics
                          summary={questionSummaries[`${groupIdx}-${qIdx}`]}
                          questionType={question.type}
                        />
                      ) : (
                        /* Multiple Choice: Show toggle for visual charts */
                        <>
                          <div className="pt-3 flex items-center justify-between border-t">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">Room Signal</span>
                              {showCharts[`${groupIdx}-${qIdx}`] && (
                                <Badge variant="secondary" className="text-xs">Visible</Badge>
                              )}
                            </div>
                            <Button
                              variant={showCharts[`${groupIdx}-${qIdx}`] ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => setShowCharts(prev => ({
                                ...prev,
                                [`${groupIdx}-${qIdx}`]: !prev[`${groupIdx}-${qIdx}`]
                              }))}
                              className="gap-2"
                            >
                              {showCharts[`${groupIdx}-${qIdx}`] ? 'Hide Charts' : 'Show Charts'}
                            </Button>
                          </div>

                          {/* Visual Analytics Chart */}
                          {showCharts[`${groupIdx}-${qIdx}`] && (
                            <QuestionAnalyticsChart
                              question={question}
                              assignments={group.assignments}
                              questionIndex={qIdx}
                              stats={stats}
                            />
                          )}
                        </>
                      )}

                      {/* Question Quality Rating */}
                      <div className="pt-3 border-t flex items-center justify-between bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">Was this AI-generated question relevant?</p>
                        <div className="flex gap-2">
                          <Button
                            variant={questionRatings[`${groupIdx}-${qIdx}`] === 'helpful' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleRateQuestion(question, groupIdx, qIdx, 'helpful')}
                            className="gap-1"
                          >
                            <ThumbsUp className="h-3 w-3" />
                            Yes
                          </Button>
                          <Button
                            variant={questionRatings[`${groupIdx}-${qIdx}`] === 'not_helpful' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => handleRateQuestion(question, groupIdx, qIdx, 'not_helpful')}
                            className="gap-1"
                          >
                            <ThumbsDown className="h-3 w-3" />
                            No
                          </Button>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-sm font-semibold">Student Responses</p>
                          <Badge variant="outline" className="text-xs">{stats.completed} total</Badge>
                        </div>
                        <div className="space-y-2">
                          {(() => {
                            // Filter assignments to only those containing this specific question
                            const questionAssignments = group.assignments.filter((a) => {
                              const content = a.content as any;
                              const assignmentQuestions = content?.questions || [];
                              return assignmentQuestions.some((q: any) => q.question === question.question);
                            });

                            // Deduplicate students - keep only the latest submission per student
                            const uniqueStudents = new Map<string, Assignment>();
                            questionAssignments.forEach((assignment) => {
                              const existing = uniqueStudents.get(assignment.student_id);
                              if (!existing || new Date(assignment.created_at) > new Date(existing.created_at)) {
                                uniqueStudents.set(assignment.student_id, assignment);
                              }
                            });
                            
                            return Array.from(uniqueStudents.values()).map((assignment) => {
                              // FIX: Find the question index within THIS student's assignment, not the group index
                              const assignmentContent = assignment.content as any;
                              const assignmentQuestions = assignmentContent?.questions || [];
                              const studentQuestionIdx = assignmentQuestions.findIndex(
                                (q: any) => q.question === question.question
                              );
                              
                              // quiz_responses is an object with string keys like {"0": "B"}
                              const studentAnswer = studentQuestionIdx >= 0 
                                ? (assignment.quiz_responses?.[studentQuestionIdx.toString()] || assignment.quiz_responses?.[studentQuestionIdx])
                                : null;
                              const isCompleted = assignment.completed;
                              
                              // Debug logging
                              console.log(`📊 Student Response Debug - ${assignment.student_name}:`, {
                                isCompleted,
                                studentQuestionIdx,
                                hasQuizResponses: !!assignment.quiz_responses,
                                quizResponsesKeys: assignment.quiz_responses ? Object.keys(assignment.quiz_responses) : [],
                                studentAnswer,
                                grade: assignment.grade,
                              });
                              
                              const correctAnswerToUse = question.overriddenAnswer || question.correctAnswer;
                            
                              // Check for AI grade in quiz_responses._ai_recommendations
                              const aiRec = assignment.quiz_responses?._ai_recommendations;
                              let studentAIGrade: number | null = null;
                              let studentAIFeedback: string | null = null;
                              
                              if (aiRec && typeof aiRec === 'object') {
                                if (Array.isArray(aiRec) && aiRec[0]) {
                                  studentAIGrade = aiRec[0].grade ?? null;
                                  studentAIFeedback = aiRec[0].feedback ?? null;
                                } else if (aiRec[studentQuestionIdx]) {
                                  studentAIGrade = aiRec[studentQuestionIdx].grade ?? null;
                                  studentAIFeedback = aiRec[studentQuestionIdx].feedback ?? null;
                                }
                              }
                              
                              // Also check assignment.grade as fallback
                              if (studentAIGrade === null && assignment.grade !== null) {
                                studentAIGrade = assignment.grade;
                              }
                              
                              const hasAIGrade = studentAIGrade !== null;
                            
                              // For manual grade short answers without AI grade, show pending
                              // Also check for coding_simple without AI grade
                              const isManualGradeShortAnswer = question.type === 'short_answer' && 
                                !hasAIGrade &&
                                (!question.expectedAnswer || question.expectedAnswer === '' || question.gradingMode === 'manual_grade');
                              const isCodingSimple = question.type === 'coding_simple';
                              
                              // coding_simple uses AI grade threshold >= 70 as correct
                              // short_answer with AI grade uses same logic
                              // MCQ uses exact match
                              const isCorrect = isManualGradeShortAnswer 
                                ? null 
                                : (hasAIGrade && (question.type === 'short_answer' || isCodingSimple))
                                  ? studentAIGrade >= 70 
                                  : (isCodingSimple && !hasAIGrade)
                                    ? null // Pending if coding_simple has no AI grade yet
                                    : studentAnswer === correctAnswerToUse;

                            return (
                              <div
                                key={assignment.id}
                                className={`flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50 ${
                                  !isCompleted ? '' :
                                  isCorrect === true ? 'bg-green-50/50 dark:bg-green-950/20' :
                                  isCorrect === false ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                    {(assignment.student_name || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium">{assignment.student_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!isCompleted ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Clock className="h-3 w-3" />
                                      Not Answered
                                    </Badge>
                                   ) : hasAIGrade && (question.type === 'short_answer' || isCodingSimple) ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <div className="flex items-center gap-2">
                                        <Badge 
                                          variant={studentAIGrade >= 70 ? "default" : "destructive"}
                                          className={`gap-1 ${studentAIGrade >= 70 ? "bg-green-600" : ""}`}
                                        >
                                          {studentAIGrade}%
                                        </Badge>
                                        {assignment.response_time_seconds !== null && assignment.response_time_seconds !== undefined && (
                                          <Badge variant="outline" className="gap-1 text-xs">
                                            <Clock className="h-3 w-3" />
                                            {formatTime(assignment.response_time_seconds)}
                                          </Badge>
                                        )}
                                      </div>
                                      {/* Code viewer for coding questions */}
                                      {isCodingSimple && studentAnswer && (
                                        <ExpandableCodeResponse
                                          studentAnswer={studentAnswer}
                                          studentAIFeedback={studentAIFeedback}
                                        />
                                      )}
                                    </div>
                                   ) : isManualGradeShortAnswer || (isCodingSimple && !hasAIGrade) ? (
                                    <>
                                      <Badge variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                                        <Clock className="h-3 w-3" />
                                        {isCodingSimple ? "Grading..." : "Pending Review"}
                                      </Badge>
                                      {assignment.response_time_seconds !== null && assignment.response_time_seconds !== undefined && (
                                        <Badge variant="outline" className="gap-1 text-xs">
                                          <Clock className="h-3 w-3" />
                                          {formatTime(assignment.response_time_seconds)}
                                        </Badge>
                                      )}
                                    </>
                                   ) : (
                                    <>
                                      <Badge
                                        variant={isCorrect ? "default" : "destructive"}
                                        className={`gap-1 ${isCorrect ? "bg-green-600" : ""}`}
                                      >
                                        {isCorrect ? (
                                          <CheckCircle className="h-3 w-3" />
                                        ) : (
                                          <XCircle className="h-3 w-3" />
                                        )}
                                        {isCorrect ? "Correct" : "Incorrect"}
                                      </Badge>
                                      <span className="text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                                        Answer: {studentAnswer || '(none)'}
                                      </span>
                                      {assignment.response_time_seconds !== null && assignment.response_time_seconds !== undefined && (
                                        <Badge variant="outline" className="gap-1 text-xs">
                                          <Clock className="h-3 w-3" />
                                          {formatTime(assignment.response_time_seconds)}
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                 </div>
                              </div>
                            );
                          });
                          })()}
                        </div>

                        {/* Answer distribution */}
                        {question.options && (
                          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs font-medium mb-2">Answer Distribution:</p>
                            <div className="space-y-1">
                              {question.options?.map((opt: string, optIdx: number) => {
                                const optionLetter = String.fromCharCode(65 + optIdx); // A, B, C, D...
                                
                                // Filter assignments to only those containing this specific question
                                const questionAssignments = group.assignments.filter((a) => {
                                  const content = a.content as any;
                                  const assignmentQuestions = content?.questions || [];
                                  return assignmentQuestions.some((q: any) => q.question === question.question);
                                });

                                // DEDUPLICATION: Keep only the latest submission per student
                                const uniqueStudents = new Map<string, Assignment>();
                                questionAssignments.forEach((a) => {
                                  const existing = uniqueStudents.get(a.student_id);
                                  if (!existing || new Date(a.created_at) > new Date(existing.created_at)) {
                                    uniqueStudents.set(a.student_id, a);
                                  }
                                });
                                const deduplicatedAssignments = Array.from(uniqueStudents.values());

                                // Count using correct question index for each student's deduplicated assignment
                                const count = deduplicatedAssignments.filter((a) => {
                                  if (!a.completed) return false;
                                  const assignmentContent = a.content as any;
                                  const assignmentQuestions = assignmentContent?.questions || [];
                                  const studentQuestionIdx = assignmentQuestions.findIndex(
                                    (q: any) => q.question === question.question
                                  );
                                  const studentAnswer = studentQuestionIdx >= 0 
                                    ? (a.quiz_responses?.[studentQuestionIdx.toString()] || a.quiz_responses?.[studentQuestionIdx])
                                    : null;
                                  return studentAnswer === optionLetter;
                                }).length;
                                const total = deduplicatedAssignments.filter((a) => a.completed).length;
                                const percentage = total > 0 ? (count / total) * 100 : 0;
                                const correctAnswerToUse = question.overriddenAnswer || question.correctAnswer;
                                const isCorrect = optionLetter === correctAnswerToUse;

                                return (
                                  <div key={optionLetter} className="flex items-center gap-2 text-xs">
                                    <span className={`font-mono w-6 ${isCorrect ? "text-green-600 font-bold" : ""}`}>
                                      {optionLetter}
                                      {isCorrect ? " ✓" : ""}
                                    </span>
                                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                                      <div
                                        className={`h-full ${isCorrect ? "bg-green-500" : "bg-primary"}`}
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                    <span className="w-16 text-right">
                                      {count}/{total} ({(percentage || 0).toFixed(0)}%)
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Short answer review section */}
                        {question.type === "short_answer" && (
                          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                            <p className="text-xs font-medium mb-2 text-blue-900 dark:text-blue-200">
                              Student Text Responses & Grading:
                            </p>
                            <div className="space-y-2">
                              {(() => {
                                // Filter assignments to only those containing this specific question
                                const questionAssignments = group.assignments.filter((a) => {
                                  const content = a.content as any;
                                  const assignmentQuestions = content?.questions || [];
                                  return assignmentQuestions.some((q: any) => q.question === question.question);
                                });

                                // Deduplicate students - keep only the latest submission per student
                                const uniqueStudents = new Map<string, Assignment>();
                                questionAssignments.forEach((assignment) => {
                                  const existing = uniqueStudents.get(assignment.student_id);
                                  if (!existing || new Date(assignment.created_at) > new Date(existing.created_at)) {
                                    uniqueStudents.set(assignment.student_id, assignment);
                                  }
                                });
                                
                                return Array.from(uniqueStudents.values()).map((assignment) => {
                                  // FIX: Find the question index within THIS student's assignment
                                  const assignmentContent = assignment.content as any;
                                  const assignmentQuestions = assignmentContent?.questions || [];
                                  const studentQuestionIdx = assignmentQuestions.findIndex(
                                    (q: any) => q.question === question.question
                                  );
                                  
                                  const studentAnswer = studentQuestionIdx >= 0 
                                    ? (assignment.quiz_responses?.[studentQuestionIdx.toString()] || assignment.quiz_responses?.[studentQuestionIdx])
                                    : null;
                                  const isCompleted = assignment.completed;
                                  const currentGrade = assignment.grade;

                                return (
                                  <div key={assignment.id} className="bg-white dark:bg-gray-900 p-3 rounded border">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <span className="font-medium text-sm">{assignment.student_name}</span>
                                      <div className="flex items-center gap-2">
                                        {!isCompleted && (
                                          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                                            <Clock className="h-3 w-3" />
                                            Not Answered
                                          </Badge>
                                        )}
                                        {isCompleted && currentGrade !== null && (
                                          <Badge variant="default" className="bg-green-600">
                                            Grade: {currentGrade}/100
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                     {isCompleted && studentAnswer && (
                                      <>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">
                                          {studentAnswer}
                                        </p>
                                        {assignment.quiz_responses?._ai_recommendations?.[0] && (
                                          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
                                            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">
                                              🤖 AI Recommended Grade: {assignment.quiz_responses._ai_recommendations[0].grade}/100
                                            </p>
                                            <p className="text-xs text-blue-800 dark:text-blue-300">
                                              {assignment.quiz_responses._ai_recommendations[0].feedback}
                                            </p>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2 pt-2 border-t">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            placeholder="Grade (0-100)"
                                            defaultValue={currentGrade ?? assignment.quiz_responses?._ai_recommendations?.[qIdx]?.grade ?? ''}
                                            className="w-24 px-2 py-1 text-sm border rounded"
                                            id={`grade-${assignment.id}`}
                                          />
                                          <Button
                                            size="sm"
                                            onClick={async () => {
                                              const input = document.getElementById(`grade-${assignment.id}`) as HTMLInputElement;
                                              const grade = parseInt(input.value);
                                              
                                              if (isNaN(grade) || grade < 0 || grade > 100) {
                                                toast.error("Please enter a valid grade (0-100)");
                                                return;
                                              }

                                              const { error } = await supabase
                                                .from('student_assignments')
                                                .update({ grade })
                                                .eq('id', assignment.id);

                                              if (error) {
                                                toast.error("Failed to save grade");
                                                return;
                                              }

                                              toast.success(`Grade saved: ${grade}/100`);
                                              fetchResults();
                                            }}
                                          >
                                            Save Grade
                                           </Button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              });
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Coding review section */}
                        {(question.type === "coding" || question.type === "coding_simple") && (
                          <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                            <p className="text-xs font-medium mb-2 text-purple-900 dark:text-purple-200 flex items-center gap-2">
                              <Code className="h-4 w-4" />
                              Student Code Submissions & Grades:
                            </p>
                            <div className="space-y-2">
                              {(() => {
                                // Filter assignments to only those containing this specific question
                                const questionAssignments = group.assignments.filter((a) => {
                                  const content = a.content as any;
                                  const assignmentQuestions = content?.questions || [];
                                  return assignmentQuestions.some((q: any) => q.question === question.question);
                                });

                                // Deduplicate students - keep only the latest submission per student
                                const uniqueStudents = new Map<string, Assignment>();
                                questionAssignments.forEach((assignment) => {
                                  const existing = uniqueStudents.get(assignment.student_id);
                                  if (!existing || new Date(assignment.created_at) > new Date(existing.created_at)) {
                                    uniqueStudents.set(assignment.student_id, assignment);
                                  }
                                });
                                
                                return Array.from(uniqueStudents.values()).map((assignment) => {
                                  // Find the question index within THIS student's assignment
                                  const assignmentContent = assignment.content as any;
                                  const assignmentQuestions = assignmentContent?.questions || [];
                                  const studentQuestionIdx = assignmentQuestions.findIndex(
                                    (q: any) => q.question === question.question
                                  );
                                  
                                  const studentAnswer = studentQuestionIdx >= 0 
                                    ? (assignment.quiz_responses?.[studentQuestionIdx.toString()] || assignment.quiz_responses?.[studentQuestionIdx])
                                    : null;
                                  const isCompleted = assignment.completed;
                                  const currentGrade = assignment.grade;
                                  
                                  // Get AI recommendations for this question
                                  const aiRec = assignment.quiz_responses?._ai_recommendations;
                                  const questionAIRec = Array.isArray(aiRec) ? aiRec[studentQuestionIdx] : aiRec?.[studentQuestionIdx];

                                  return (
                                    <CodingSubmissionCard
                                      key={assignment.id}
                                      assignment={assignment}
                                      studentAnswer={studentAnswer}
                                      isCompleted={isCompleted}
                                      currentGrade={currentGrade}
                                      questionAIRec={questionAIRec}
                                      qIdx={qIdx}
                                      fetchResults={fetchResults}
                                    />
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* Override Dialog */}
        <AlertDialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Override Correct Answer</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Select the correct answer for this question. This will automatically recalculate grades for all students in this check-in.
                </p>
                {selectedOverride && (
                  <>
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium mb-1">Question:</p>
                      <div className="text-foreground">
                        <MathRenderer content={selectedOverride.group.questions[selectedOverride.questionIdx]?.question || ''} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Correct Answer:</label>
                      <Select value={selectedOverride.newAnswer} onValueChange={(value) => setSelectedOverride({ ...selectedOverride, newAnswer: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedOverride.group.questions[selectedOverride.questionIdx]?.options?.map((opt: string, idx: number) => {
                            const letter = String.fromCharCode(65 + idx);
                            return (
                              <SelectItem key={letter} value={letter}>
                                <span className="flex items-center gap-1">{letter}. <MathRenderer content={opt} /></span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-900 dark:text-amber-200">
                        <strong>Impact:</strong> This will affect {selectedOverride.group.assignments.length} student(s). 
                        Grades will be automatically recalculated based on the new correct answer.
                      </p>
                    </div>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setOverrideDialogOpen(false);
                setSelectedOverride(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmOverride}>
                Apply Override
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
