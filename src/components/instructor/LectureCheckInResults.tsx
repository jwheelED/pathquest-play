import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, TrendingUp, Trash2, AlertTriangle, Download, Trash, ThumbsUp, ThumbsDown, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuestionAnalyticsChart } from "./QuestionAnalyticsChart";
import { Skeleton } from "@/components/ui/skeleton";

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
    loading: boolean;
    responseCount?: number;
  }>>({});

  useEffect(() => {
    localStorage.setItem('lectureCheckInChartsVisibility', JSON.stringify(showCharts));
  }, [showCharts]);

  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    let channel: any;

    const setupRealtimeSubscription = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Set up real-time subscription for assignment updates - filtered by instructor
      channel = supabase
        .channel("instructor-checkin-results")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "student_assignments",
            filter: `instructor_id=eq.${user.id},assignment_type=eq.lecture_checkin`,
          },
          (payload) => {
            console.log("Check-in result updated:", payload);
            // Debounce to handle multiple rapid updates from 40+ students
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              fetchResults();
            }, 300); // Reduced to 300ms for faster updates
          },
        )
        .subscribe((status) => {
          console.log("Check-in subscription status:", status);
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
  }, []);

  const fetchResults = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Optimized query: Fetch only recent check-ins (last 24 hours) to reduce load
    // For classroom of 40 students, this limits data transfer significantly
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    // Fetch all lecture check-in assignments with optimized select
    const { data: assignments, error } = await supabase
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

    if (error) {
      console.error("Error fetching results:", error);
      setLoading(false);
      return;
    }

    // Get student names from both users and profiles tables (efficient for 40+ students)
    const studentIds = [...new Set(assignments?.map((a) => a.student_id) || [])];
    const [usersResult, profilesResult] = await Promise.all([
      supabase.from("users").select("id, name").in("id", studentIds),
      supabase.from("profiles").select("id, full_name").in("id", studentIds)
    ]);

    // Build name map with fallback logic: users.name -> profiles.full_name -> "Unknown"
    const studentMap = new Map<string, string>();
    studentIds.forEach(id => {
      const userName = usersResult.data?.find(u => u.id === id)?.name;
      const profileName = profilesResult.data?.find(p => p.id === id)?.full_name;
      studentMap.set(id, userName || profileName || "Unknown Student");
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
    setLoading(false);
  };

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

    // For short answer questions requiring manual grading, don't calculate correct/incorrect stats
    const isManualGradeShortAnswer = question.type === 'short_answer' && 
      (!question.expectedAnswer || question.expectedAnswer === '' || question.gradingMode === 'manual_grade');
    
    const completed = uniqueAssignments.filter((a) => a.completed);
    
    // Use overridden answer if it exists, otherwise use original correctAnswer
    const correctAnswer = question.overriddenAnswer || question.correctAnswer;
    const correct = isManualGradeShortAnswer ? [] : completed.filter((a) => {
      // quiz_responses is an object with string keys like {"0": "B"}
      const response = a.quiz_responses?.[questionIndex.toString()] || a.quiz_responses?.[questionIndex];
      return response === correctAnswer;
    });

    // Calculate average response time for completed assignments
    const responseTimes = completed
      .map(a => a.response_time_seconds)
      .filter((time): time is number => time !== null && time !== undefined);
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : null;

    return {
      total: uniqueAssignments.length,
      completed: completed.length,
      correct: correct.length,
      percentage: isManualGradeShortAnswer ? null : (completed.length > 0 ? (correct.length / completed.length) * 100 : 0),
      avgResponseTime,
      isManualGradeShortAnswer,
    };
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
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
        .map(a => ({
          answer: a.quiz_responses?.[qIdx.toString()] || a.quiz_responses?.[qIdx],
          isCorrect: (a.quiz_responses?.[qIdx.toString()] || a.quiz_responses?.[qIdx]) === 
                     (question.overriddenAnswer || question.correctAnswer),
          grade: a.grade
        }));

      const { data, error } = await supabase.functions.invoke('generate-question-summary', {
        body: {
          question: question.question,
          questionType: question.type || 'multiple_choice',
          correctAnswer: question.overriddenAnswer || question.correctAnswer,
          options: question.options,
          studentResponses,
          totalStudents: stats.total,
          completedCount: stats.completed
        }
      });

      if (error) throw error;

      setQuestionSummaries(prev => ({
        ...prev,
        [key]: {
          summary: data.summary,
          trend: data.trend,
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Lecture Check-In Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading results...</p>
        </CardContent>
      </Card>
    );
  }

  if (groupedResults.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Lecture Check-In Results</CardTitle>
          <CardDescription>No lecture check-ins sent yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-2">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-6 w-6 text-primary" />
              Live Lecture Check-In Results
            </CardTitle>
            <CardDescription className="mt-1">Auto-graded student performance on lecture questions</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={fetchResults} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash className="h-4 w-4" />
                  Delete All
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
        <Accordion type="single" collapsible className="space-y-4" defaultValue="group-0">
          {groupedResults.map((group, groupIdx) => (
            <AccordionItem key={groupIdx} value={`group-${groupIdx}`} className="border-2 rounded-lg px-4 shadow-sm bg-card">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{new Date(group.timestamp).toLocaleString()}</Badge>
                    <span className="text-sm text-muted-foreground">{group.assignments.length} student(s)</span>
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
                    <div key={qIdx} className={`border rounded-lg p-5 space-y-4 shadow-sm bg-card ${isOverridden ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
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
                          <p className="font-medium mb-2">{question.question}</p>
                          {question.options && (
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {question.options.map((opt: string, oIdx: number) => {
                                const letter = String.fromCharCode(65 + oIdx); // A, B, C, D...
                                const isCorrect = letter === currentCorrectAnswer;
                                return (
                                  <li
                                    key={oIdx}
                                    className={isCorrect ? "font-medium text-green-600 dark:text-green-500" : ""}
                                  >
                                    <span className="font-bold">{letter}.</span> {opt} {isCorrect && "✓"}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="text-right space-y-2">
                          <div>
                            {stats.isManualGradeShortAnswer ? (
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
                          <h4 className="text-sm font-semibold">AI Insights</h4>
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
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                No AI summary generated yet
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

                      {/* Toggle Analytics Button */}
                      <div className="pt-3 flex items-center justify-between border-t">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Visual Analytics</span>
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
                              // quiz_responses is an object with string keys like {"0": "B"}
                              const studentAnswer = assignment.quiz_responses?.[qIdx.toString()] || assignment.quiz_responses?.[qIdx];
                              const isCompleted = assignment.completed;
                              const correctAnswerToUse = question.overriddenAnswer || question.correctAnswer;
                            
                            // For manual grade short answers, don't show correct/incorrect
                            const isManualGradeShortAnswer = question.type === 'short_answer' && 
                              (!question.expectedAnswer || question.expectedAnswer === '' || question.gradingMode === 'manual_grade');
                            const isCorrect = isManualGradeShortAnswer ? null : studentAnswer === correctAnswerToUse;

                            return (
                              <div
                                key={assignment.id}
                                className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50"
                              >
                                <span className="font-medium">{assignment.student_name}</span>
                                <div className="flex items-center gap-2">
                                  {!isCompleted ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Clock className="h-3 w-3" />
                                      Not Answered
                                    </Badge>
                                   ) : isManualGradeShortAnswer ? (
                                    <>
                                      <Badge variant="outline" className="gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
                                        <Clock className="h-3 w-3" />
                                        Pending Review
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
                                        Answer: {studentAnswer}
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

                                // quiz_responses is an object with string keys like {"0": "B"}
                                const count = questionAssignments.filter(
                                  (a) => a.completed && (a.quiz_responses?.[qIdx.toString()] || a.quiz_responses?.[qIdx]) === optionLetter,
                                ).length;
                                const total = questionAssignments.filter((a) => a.completed).length;
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
                                  // quiz_responses is an object with string keys like {"0": "B"}
                                  const studentAnswer = assignment.quiz_responses?.[qIdx.toString()] || assignment.quiz_responses?.[qIdx];
                                  const isCompleted = assignment.completed;
                                  const currentGrade = assignment.grade;

                                return (
                                  <div key={assignment.id} className="bg-white dark:bg-gray-900 p-3 rounded border">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <span className="font-medium text-sm">{assignment.student_name}</span>
                                      <div className="flex items-center gap-2">
                                        {!isCompleted && (
                                          <Badge variant="outline" className="gap-1">
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
                      <p className="text-foreground">{selectedOverride.group.questions[selectedOverride.questionIdx]?.question}</p>
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
                                {letter}. {opt}
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
