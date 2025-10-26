import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BookOpen, CheckCircle, Eye, Bell, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VersionHistoryTracker } from "./VersionHistoryTracker";
import { toast as sonnerToast } from "sonner";

interface Assignment {
  id: string;
  title: string;
  assignment_type: string;
  mode: string;
  content: any;
  completed: boolean;
  created_at: string;
  grade?: number | null;
  quiz_responses?: any;
}

export const AssignedContent = ({ userId }: { userId: string }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, Record<number, string>>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, Record<number, string>>>({});
  const [submittedQuizzes, setSubmittedQuizzes] = useState<Record<string, boolean>>({});
  const [liveCheckIns, setLiveCheckIns] = useState<Assignment[]>([]);
  const [showAllCheckIns, setShowAllCheckIns] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAssignments();
    
    let debounceTimer: NodeJS.Timeout;
    
    // Set up real-time subscription for new assignments
    const channel = supabase
      .channel('student-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_assignments',
          filter: `student_id=eq.${userId}`
        },
        (payload) => {
          console.log('Assignment change detected:', payload);
          // Debounce to handle rapid updates gracefully
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchAssignments();
          }, 300);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchAssignments = async () => {
    // Optimized query: Only fetch recent assignments to reduce load
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data, error } = await supabase
      .from('student_assignments')
      .select('*')
      .eq('student_id', userId)
      .gte('created_at', threeDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50); // Reasonable limit per student

    if (error) {
      console.error('Error fetching assignments:', error);
      return;
    }
    
    const allAssignments = data || [];
    setAssignments(allAssignments);
    
    // Separate live check-ins for prominent display
    const checkIns = allAssignments.filter(
      a => a.assignment_type === 'lecture_checkin' && !a.completed
    );
    setLiveCheckIns(checkIns);
  };

  const handleAnswerSelect = (assignmentId: string, questionIndex: number, answer: string) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [questionIndex]: answer
      }
    }));
  };

  const handleTextAnswerChange = (assignmentId: string, questionIndex: number, answer: string) => {
    setTextAnswers(prev => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [questionIndex]: answer
      }
    }));
  };

  const handleSubmitQuiz = async (assignment: Assignment) => {
    const mcAnswers = selectedAnswers[assignment.id] || {};
    const textAns = textAnswers[assignment.id] || {};
    const questions = assignment.content.questions || [];
    
    // Combine both answer types
    const allAnswers: Record<number, string> = {};
    questions.forEach((q: any, idx: number) => {
      if (q.type === 'short_answer') {
        allAnswers[idx] = textAns[idx] || '';
      } else {
        allAnswers[idx] = mcAnswers[idx] || '';
      }
    });
    
    // Check if all questions are answered
    const answeredCount = Object.keys(allAnswers).filter(key => allAnswers[parseInt(key)]).length;
    if (answeredCount !== questions.length) {
      toast({ 
        title: "Please answer all questions", 
        description: `You've answered ${answeredCount} out of ${questions.length} questions`,
        variant: "destructive" 
      });
      return;
    }

    try {
      // Use secure RPC function for server-side grading
      const { data, error } = await supabase
        .rpc('submit_quiz', {
          p_assignment_id: assignment.id,
          p_user_answers: allAnswers
        });

      if (error) {
        throw error;
      }

      const result = data as { 
        grade: number | null; 
        correct: number; 
        total: number; 
        pending_review: boolean;
        has_short_answer: boolean;
        assignment_mode: string;
      };

      setSubmittedQuizzes(prev => ({ ...prev, [assignment.id]: true }));
      
      // Save version history for cheat detection (if any short answers with tracking)
      const versionHistoryData = textAns[`${questions.findIndex((q: any) => q.type === 'short_answer')}_version_history`];
      if (versionHistoryData && userId) {
        const { error: versionError } = await supabase
          .from('answer_version_history')
          .upsert({
            student_id: userId,
            assignment_id: assignment.id,
            version_events: versionHistoryData.events,
            typed_count: versionHistoryData.typed_count,
            pasted_count: versionHistoryData.pasted_count
          }, {
            onConflict: 'student_id,assignment_id'
          });

        if (versionError) {
          console.error('Failed to save version history:', versionError);
        }
      }
      
      // If there are short answers, get AI grades (for auto-grading or recommendations)
      if (result.has_short_answer) {
        const isAutoGrade = result.assignment_mode === 'auto_grade';
        
        toast({
          title: isAutoGrade ? "Auto-grading short answers..." : "Getting AI recommendations...",
          description: isAutoGrade ? "Please wait while we grade your responses" : "Generating recommended grades for instructor review"
        });

        let totalShortAnswerGrade = 0;
        let shortAnswerCount = 0;
        const recommendedGrades: Record<number, { grade: number; feedback: string }> = {};

        for (let idx = 0; idx < questions.length; idx++) {
          const q = questions[idx];
          if (q.type === 'short_answer') {
            shortAnswerCount++;
            const studentAnswer = allAnswers[idx];
            
            try {
              const { data: gradeData, error: gradeError } = await supabase.functions.invoke(
                'auto-grade-short-answer',
                {
                  body: {
                    studentAnswer,
                    expectedAnswer: q.expectedAnswer || '',
                    question: q.question
                  }
                }
              );

              if (gradeError) {
                console.error('Auto-grade error:', gradeError);
                throw gradeError;
              }

              totalShortAnswerGrade += gradeData.grade;
              recommendedGrades[idx] = {
                grade: gradeData.grade,
                feedback: gradeData.feedback
              };
            } catch (gradeErr) {
              console.error('Failed to auto-grade question', idx, gradeErr);
              // Continue with other questions even if one fails
            }
          }
        }

        // Calculate combined grade (MC + short answer average)
        const shortAnswerAvg = shortAnswerCount > 0 ? totalShortAnswerGrade / shortAnswerCount : 0;
        const mcGrade = result.grade || 0;
        const combinedGrade = result.total > 0 
          ? ((mcGrade * result.total) + (shortAnswerAvg * shortAnswerCount)) / (result.total + shortAnswerCount)
          : shortAnswerAvg;

        if (isAutoGrade) {
          // Update assignment with combined grade for auto-grade mode
          const { error: updateError } = await supabase
            .from('student_assignments')
            .update({ grade: combinedGrade })
            .eq('id', assignment.id);

          if (updateError) {
            console.error('Failed to update grade:', updateError);
          }

          toast({ 
            title: "✅ Quiz Auto-Graded Successfully!",
            description: `Final Score: ${combinedGrade.toFixed(0)}%`
          });
        } else {
          // For manual_grade mode, store recommended grades in quiz_responses
          const updatedResponses = {
            ...allAnswers,
            _ai_recommendations: recommendedGrades
          };

          const { error: updateError } = await supabase
            .from('student_assignments')
            .update({ quiz_responses: updatedResponses })
            .eq('id', assignment.id);

          if (updateError) {
            console.error('Failed to store recommendations:', updateError);
          }

          toast({ 
            title: "✅ Quiz Submitted Successfully!",
            description: "Your answers have been submitted with AI-recommended grades for instructor review."
          });
        }
      } else if (result.pending_review) {
        // Manual review needed
        toast({ 
          title: "✅ Quiz Submitted Successfully!",
          description: result.grade !== null 
            ? `Multiple Choice Score: ${(result.grade || 0).toFixed(0)}% (${result.correct}/${result.total} correct). Short answers pending instructor review.`
            : "Your answers have been submitted and are pending instructor review."
        });
      } else {
        // No short answers or all MC
        toast({ 
          title: "✅ Quiz Submitted Successfully!",
          description: `Score: ${(result.grade || 0).toFixed(0)}% (${result.correct}/${result.total} correct)`
        });
      }
      
      // Refresh assignments to show updated state
      await fetchAssignments();

      // For lecture check-ins, update streak tracking and trigger achievement check
      if (assignment.assignment_type === 'lecture_checkin') {
        await updateCheckInStreak(assignment.grade || 0);
      }
    } catch (error: any) {
      console.error('Submit quiz error:', error);
      toast({ 
        title: "Failed to submit quiz", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  };

  const updateCheckInStreak = async (grade: number) => {
    if (!userId) return;

    try {
      const isPerfectScore = grade === 100;
      const today = new Date().toISOString().split('T')[0];

      // Get or create check-in streak record
      let { data: streakData, error: fetchError } = await supabase
        .from('checkin_streaks')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // Create new streak record
        const { data: newStreak, error: insertError } = await supabase
          .from('checkin_streaks')
          .insert([{
            user_id: userId,
            current_streak: isPerfectScore ? 1 : 0,
            longest_streak: isPerfectScore ? 1 : 0,
            last_correct_date: isPerfectScore ? today : null
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        streakData = newStreak;
      }

      if (streakData) {
        const lastCorrectDate = streakData.last_correct_date;
        let newCurrentStreak = streakData.current_streak;
        let newLongestStreak = streakData.longest_streak;

        if (isPerfectScore) {
          // Check if this continues the streak (answered today or yesterday)
          const lastDate = lastCorrectDate ? new Date(lastCorrectDate) : null;
          const isConsecutive = lastDate && 
            (lastDate.toISOString().split('T')[0] === today || 
             Math.abs(new Date(today).getTime() - lastDate.getTime()) <= 24 * 60 * 60 * 1000);

          if (isConsecutive) {
            newCurrentStreak += 1;
          } else {
            newCurrentStreak = 1;
          }

          newLongestStreak = Math.max(newLongestStreak, newCurrentStreak);

          // Update streak
          const { error: updateError } = await supabase
            .from('checkin_streaks')
            .update({
              current_streak: newCurrentStreak,
              longest_streak: newLongestStreak,
              last_correct_date: today,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

          if (updateError) throw updateError;

          // Check for streak achievements
          if (newCurrentStreak === 3) {
            sonnerToast.success("🍎 Achievement Progress!", {
              description: "Teacher's Pet achievement incoming! Keep the streak going!"
            });
          }
        } else {
          // Reset streak on incorrect answer
          if (newCurrentStreak > 0) {
            const { error: resetError } = await supabase
              .from('checkin_streaks')
              .update({
                current_streak: 0,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId);

            if (resetError) throw resetError;
          }
        }
      }
    } catch (error) {
      console.error('Error updating check-in streak:', error);
      // Don't throw - streak tracking shouldn't block submission
    }
  };

  const handleComplete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('student_assignments')
        .update({ completed: true })
        .eq('id', id);

      if (error) throw error;

      toast({ title: "✅ Assignment completed!" });
      await fetchAssignments();
    } catch (error: any) {
      console.error('Complete assignment error:', error);
      toast({ 
        title: "Failed to mark complete", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  };

  if (assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assigned Content</CardTitle>
          <CardDescription>No assignments yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Content</CardTitle>
        <CardDescription>{assignments.filter(a => !a.completed).length} active assignment(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Lecture Check-in Alert */}
        {liveCheckIns.length > 0 && (
          <div className="space-y-3">
            <Alert className="border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
              <Bell className="h-5 w-5 text-orange-600 animate-pulse" />
              <AlertTitle className="text-orange-900 dark:text-orange-200 font-bold">
                🎯 Live Check-in Available!
              </AlertTitle>
              <AlertDescription className="text-orange-800 dark:text-orange-300">
                Your instructor has sent {liveCheckIns.length} check-in question(s) during the lecture. 
                Answer now to show engagement!
              </AlertDescription>
            </Alert>
            {liveCheckIns.length > 3 && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllCheckIns(!showAllCheckIns)}
                >
                  {showAllCheckIns ? 'Show Recent (3)' : `Show All (${liveCheckIns.length})`}
                </Button>
              </div>
            )}
          </div>
        )}

        <Accordion type="single" collapsible>
          {assignments
            .filter(assignment => {
              // Filter live check-ins based on showAllCheckIns state
              if (assignment.assignment_type === 'lecture_checkin' && !assignment.completed) {
                if (!showAllCheckIns && liveCheckIns.length > 3) {
                  // Only show last 3 check-ins
                  return liveCheckIns.slice(0, 3).some(ci => ci.id === assignment.id);
                }
              }
              return true;
            })
            .map((assignment) => (
            <AccordionItem key={assignment.id} value={assignment.id}>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  {assignment.assignment_type === 'lecture_checkin' && !assignment.completed && (
                    <Bell className="h-4 w-4 text-orange-500 animate-pulse" />
                  )}
                  <BookOpen className="h-4 w-4" />
                  <span>{assignment.title}</span>
                  <Badge variant={assignment.completed ? "default" : assignment.assignment_type === 'lecture_checkin' ? "destructive" : "secondary"}>
                    {assignment.assignment_type === 'lecture_checkin' ? 'LIVE CHECK-IN' : assignment.assignment_type.replace('_', ' ')}
                  </Badge>
                  {assignment.completed && <CheckCircle className="h-4 w-4 text-green-500" />}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {/* Live Check-in Notice */}
                  {assignment.assignment_type === 'lecture_checkin' && !assignment.completed && (
                    <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-900 dark:text-blue-200">
                        Your answer activity is being tracked
                      </AlertTitle>
                      <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
                        Type vs. paste detection is enabled to ensure academic integrity.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Quiz/Lecture Check-in Display */}
                  {(assignment.assignment_type === 'quiz' || assignment.assignment_type === 'lecture_checkin') && assignment.content.questions && (
                    <div className="space-y-4">
                      {assignment.content.questions.map((q: any, idx: number) => {
                        const isSubmitted = submittedQuizzes[assignment.id] || assignment.completed;
                        
                        // Handle short answer questions
                        if (q.type === 'short_answer') {
                          const textAnswer = textAnswers[assignment.id]?.[idx] || '';
                          
                          return (
                            <div key={idx} className="border rounded-lg p-4 space-y-3">
                              <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                              <VersionHistoryTracker
                                value={textAnswer}
                                onChange={(value) => handleTextAnswerChange(assignment.id, idx, value)}
                                onVersionChange={(history) => {
                                  // Store version history for cheat detection
                                  const typedCount = history.filter(e => e.type === 'typed').length;
                                  const pastedCount = history.filter(e => e.type === 'pasted').length;
                                  
                                  // Store in state for submission
                                  setTextAnswers(prev => ({
                                    ...prev,
                                    [assignment.id]: {
                                      ...(prev[assignment.id] || {}),
                                      [`${idx}_version_history`]: {
                                        events: history,
                                        typed_count: typedCount,
                                        pasted_count: pastedCount
                                      }
                                    }
                                  }));
                                }}
                              />
                              {isSubmitted && (
                                <div className="space-y-2">
                                  {assignment.mode === 'manual_grade' ? (
                                    // Show pending review for manual grade mode
                                    <>
                                      {q.expectedAnswer && (
                                        <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded">
                                          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Expected Answer:</p>
                                          <p className="text-sm text-blue-800 dark:text-blue-300">{q.expectedAnswer}</p>
                                        </div>
                                      )}
                                      <div className="bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                                        <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">⏳ Pending Instructor Review</p>
                                        <p className="text-xs text-yellow-800 dark:text-yellow-300">Your instructor will review and grade this answer.</p>
                                      </div>
                                    </>
                                  ) : (
                                    // Show AI feedback for auto grade mode
                                    assignment.quiz_responses?._ai_recommendations?.[idx] && (
                                      <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
                                        <p className="text-sm font-medium text-green-900 dark:text-green-200">
                                          ✅ Score: {assignment.quiz_responses._ai_recommendations[idx].grade}%
                                        </p>
                                        <p className="text-xs text-green-800 dark:text-green-300 mt-1">
                                          {assignment.quiz_responses._ai_recommendations[idx].feedback}
                                        </p>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        // Handle multiple choice questions
                        const selectedAnswer = selectedAnswers[assignment.id]?.[idx];
                        // Normalize both for comparison - trim and uppercase
                        const normalizedSelected = selectedAnswer?.trim().toUpperCase();
                        const normalizedCorrect = q.correctAnswer?.trim().toUpperCase();
                        const isCorrect = normalizedSelected === normalizedCorrect;
                        
                        return (
                          <div key={idx} className="border rounded-lg p-4 space-y-3">
                            <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                            <div className="space-y-2">
                              {q.options?.map((opt: string, i: number) => {
                                // Extract letter from "A. Option text" format
                                const optionLetter = opt.trim().charAt(0).toUpperCase();
                                // Normalize for comparison
                                const normalizedSelected = selectedAnswer?.trim().toUpperCase();
                                const normalizedCorrect = q.correctAnswer?.trim().toUpperCase();
                                const isSelected = normalizedSelected === optionLetter;
                                const showCorrect = isSubmitted && optionLetter === normalizedCorrect;
                                const showWrong = isSubmitted && isSelected && !isCorrect;
                                
                                return (
                                  <button
                                    key={`${idx}-${i}`}
                                    disabled={isSubmitted}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAnswerSelect(assignment.id, idx, optionLetter);
                                    }}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                      isSelected && !isSubmitted ? 'border-primary bg-primary/5' :
                                      showCorrect ? 'border-green-500 bg-green-50 dark:bg-green-950/20' :
                                      showWrong ? 'border-red-500 bg-red-50 dark:bg-red-950/20' :
                                      'border-border hover:border-primary/50'
                                    } ${isSubmitted ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                  >
                                    <span className="text-sm">{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                            
                            {isSubmitted && (
                              <div className={`p-3 rounded ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                                <p className="text-sm font-medium">
                                  {isCorrect ? '✓ Correct!' : `✗ Incorrect. Correct answer: ${q.correctAnswer}`}
                                </p>
                              </div>
                            )}
                            
                            {(assignment.mode === "hints_only" || assignment.mode === "hints_solutions") && !isSubmitted && (
                              <div className="bg-muted/50 p-3 rounded space-y-2">
                                <p className="text-xs font-medium">Hint 1 (Conceptual):</p>
                                <p className="text-xs text-muted-foreground">{q.hint1}</p>
                                <p className="text-xs font-medium">Hint 2 (Narrowing):</p>
                                <p className="text-xs text-muted-foreground">{q.hint2}</p>
                                <p className="text-xs font-medium">Hint 3 (Reasoning):</p>
                                <p className="text-xs text-muted-foreground">{q.hint3}</p>
                              </div>
                            )}
                            
                            {assignment.mode === "hints_solutions" && isSubmitted && (
                              <div className="bg-primary/5 p-3 rounded space-y-1">
                                <p className="text-xs font-semibold">Explanation:</p>
                                <p className="text-xs text-muted-foreground">{q.solution}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {!assignment.completed && (
                        <Button onClick={() => handleSubmitQuiz(assignment)} className="w-full">
                          Submit Quiz
                        </Button>
                      )}
                      
                      {assignment.completed && (
                        <div className="space-y-2">
                          {assignment.grade !== undefined && assignment.grade !== null ? (
                            <div className="bg-primary/10 p-4 rounded-lg text-center">
                              <p className="text-lg font-semibold">Your Score: {(assignment.grade || 0).toFixed(0)}%</p>
                            </div>
                          ) : (
                            <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg text-center border border-yellow-200 dark:border-yellow-800">
                              <p className="text-lg font-semibold text-yellow-900 dark:text-yellow-200">⏳ Pending Review</p>
                              <p className="text-sm text-yellow-800 dark:text-yellow-300">Your instructor is reviewing your answers</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lesson Display */}
                  {assignment.assignment_type === 'lesson' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">{assignment.content.title}</h4>
                        <div className="text-sm text-muted-foreground whitespace-pre-line">
                          {assignment.content.content}
                        </div>
                      </div>
                      {assignment.content.codeExample && (
                        <div>
                          <h4 className="font-semibold mb-2">Code Example</h4>
                          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                            {assignment.content.codeExample}
                          </pre>
                          {assignment.content.explanation && (
                            <p className="text-sm text-muted-foreground mt-2">{assignment.content.explanation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mini Project Display */}
                  {assignment.assignment_type === 'mini_project' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">{assignment.content.title}</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {assignment.content.prompt}
                        </p>
                      </div>
                      
                      {(assignment.mode === "hints_only" || assignment.mode === "hints_solutions") && (
                        <div className="bg-muted/50 p-4 rounded space-y-3">
                          <div>
                            <p className="text-sm font-medium">Hint 1 (Conceptual Approach):</p>
                            <p className="text-sm text-muted-foreground">{assignment.content.hint1}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Hint 2 (Key Steps):</p>
                            <p className="text-sm text-muted-foreground">{assignment.content.hint2}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Hint 3 (Structure Guidance):</p>
                            <p className="text-sm text-muted-foreground">{assignment.content.hint3}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {assignment.assignment_type !== 'quiz' && !assignment.completed && (
                    <Button onClick={() => handleComplete(assignment.id)} className="w-full">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark as Complete
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};