import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, TrendingUp, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
}

interface GroupedAssignment {
  timestamp: string;
  assignments: Assignment[];
  questions: any[];
}

export const LectureCheckInResults = () => {
  const [groupedResults, setGroupedResults] = useState<GroupedAssignment[]>([]);
  const [loading, setLoading] = useState(true);

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
        created_at
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

  const calculateQuestionStats = (assignments: Assignment[], questionIndex: number, correctAnswer: string) => {
    const completed = assignments.filter((a) => a.completed);
    const correct = completed.filter((a) => {
      const response = a.quiz_responses?.[questionIndex];
      return response === correctAnswer;
    });

    return {
      total: assignments.length,
      completed: completed.length,
      correct: correct.length,
      percentage: completed.length > 0 ? (correct.length / completed.length) * 100 : 0,
    };
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
                  const stats = calculateQuestionStats(group.assignments, qIdx, question.correctAnswer);

                  return (
                    <div key={qIdx} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium mb-2">{question.question}</p>
                          {question.options && (
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {question.options.map((opt: string, oIdx: number) => {
                                const letter = String.fromCharCode(65 + oIdx); // A, B, C, D...
                                const isCorrect = letter === question.correctAnswer;
                                return (
                                  <li
                                    key={oIdx}
                                    className={isCorrect ? "font-medium text-green-600" : ""}
                                  >
                                    <span className="font-bold">{letter}.</span> {opt} {isCorrect && "✓"}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{(stats.percentage || 0).toFixed(0)}%</div>
                          <div className="text-xs text-muted-foreground">
                            {stats.correct}/{stats.completed} correct
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <p className="text-sm font-medium mb-2">Student Responses:</p>
                        <div className="space-y-2">
                          {group.assignments.map((assignment) => {
                            const studentAnswer = assignment.quiz_responses?.[qIdx];
                            const isCompleted = assignment.completed;
                            const isCorrect = studentAnswer === question.correctAnswer;

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
                                const isCorrect = optionLetter === question.correctAnswer;

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
      </CardContent>
    </Card>
  );
};
