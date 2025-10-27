import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, TrendingUp, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    let channel: any;

    const setupRealtimeSubscription = async () => {
      await fetchResults();

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
            filter: `instructor_id=eq.${user.id}`,
          },
          (payload) => {
            // Only process lecture check-ins
            const newData = payload.new as any;
            if (newData?.assignment_type === 'lecture_checkin') {
              console.log("Check-in result updated:", payload);
              // Debounce to handle multiple rapid updates from 40+ students
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                fetchResults();
              }, 300); // Reduced to 300ms for faster updates
            }
          },
        )
        .subscribe();
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
        response_time_seconds
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

    // Get student names in batches if needed (efficient for 40+ students)
    const studentIds = [...new Set(assignments?.map((a) => a.student_id) || [])];
    const { data: students } = await supabase.from("users").select("id, name").in("id", studentIds);

    const studentMap = new Map(students?.map((s) => [s.id, s.name]) || []);

    // Add student names to assignments
    const assignmentsWithNames =
      assignments?.map((a) => ({
        ...a,
        student_name: studentMap.get(a.student_id) || "Unknown",
      })) || [];

    // Group by timestamp (within 5 minutes)
    const groups: GroupedAssignment[] = [];

    assignmentsWithNames.forEach((assignment) => {
      const timestamp = new Date(assignment.created_at).getTime();

      // Find existing group within 5 minutes
      const existingGroup = groups.find((g) => {
        const groupTime = new Date(g.timestamp).getTime();
        return Math.abs(timestamp - groupTime) < 5 * 60 * 1000;
      });

      if (existingGroup) {
        existingGroup.assignments.push(assignment);
      } else {
        const content = assignment.content as any;
        groups.push({
          timestamp: assignment.created_at,
          assignments: [assignment],
          questions: content?.questions || [],
        });
      }
    });

    setGroupedResults(groups);
    setLoading(false);
  };

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

  const calculateQuestionStats = (assignments: Assignment[], questionIndex: number, question: any) => {
    // Use overridden answer if it exists, otherwise use original correctAnswer
    const correctAnswer = question.overriddenAnswer || question.correctAnswer;
    
    const completed = assignments.filter((a) => a.completed);
    const correct = completed.filter((a) => {
      const response = a.quiz_responses?.[questionIndex];
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
      total: assignments.length,
      completed: completed.length,
      correct: correct.length,
      percentage: completed.length > 0 ? (correct.length / completed.length) * 100 : 0,
      avgResponseTime,
    };
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
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
          const userAnswer = assignment.quiz_responses?.[idx];
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Live Lecture Check-In Results
        </CardTitle>
        <CardDescription>Auto-graded student performance on lecture questions</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-2" defaultValue="group-0">
          {groupedResults.map((group, groupIdx) => (
            <AccordionItem key={groupIdx} value={`group-${groupIdx}`} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
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
              <AccordionContent className="space-y-4 pt-4">
                {group.questions.map((question, qIdx) => {
                  const stats = calculateQuestionStats(group.assignments, qIdx, question);
                  const currentCorrectAnswer = question.overriddenAnswer || question.correctAnswer;
                  const isOverridden = !!question.overriddenAnswer;

                  return (
                    <div key={qIdx} className={`border rounded-lg p-4 space-y-3 ${isOverridden ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
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
                            <div className="text-2xl font-bold">{(stats.percentage || 0).toFixed(0)}%</div>
                            <div className="text-xs text-muted-foreground">
                              {stats.correct}/{stats.completed} correct
                            </div>
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

                      <div className="border-t pt-3">
                        <p className="text-sm font-medium mb-2">Student Responses:</p>
                        <div className="space-y-2">
                          {group.assignments.map((assignment) => {
                            const studentAnswer = assignment.quiz_responses?.[qIdx];
                            const isCompleted = assignment.completed;
                            const correctAnswerToUse = question.overriddenAnswer || question.correctAnswer;
                            const isCorrect = studentAnswer === correctAnswerToUse;

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
                          })}
                        </div>

                        {/* Answer distribution */}
                        {question.options && (
                          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs font-medium mb-2">Answer Distribution:</p>
                            <div className="space-y-1">
                              {question.options?.map((opt: string, optIdx: number) => {
                                const optionLetter = String.fromCharCode(65 + optIdx); // A, B, C, D...
                                const count = group.assignments.filter(
                                  (a) => a.completed && a.quiz_responses?.[qIdx] === optionLetter,
                                ).length;
                                const total = group.assignments.filter((a) => a.completed).length;
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
                              {group.assignments.map((assignment) => {
                                const studentAnswer = assignment.quiz_responses?.[qIdx];
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
                                        {assignment.quiz_responses?._ai_recommendations?.[qIdx] && (
                                          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
                                            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">
                                              🤖 AI Recommended Grade: {assignment.quiz_responses._ai_recommendations[qIdx].grade}/100
                                            </p>
                                            <p className="text-xs text-blue-800 dark:text-blue-300">
                                              {assignment.quiz_responses._ai_recommendations[qIdx].feedback}
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
                              })}
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
