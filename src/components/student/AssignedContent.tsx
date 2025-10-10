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
  const [submittedQuizzes, setSubmittedQuizzes] = useState<Record<string, boolean>>({});
  const [liveCheckIns, setLiveCheckIns] = useState<Assignment[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchAssignments();
  }, [userId]);

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from('student_assignments')
      .select('*')
      .eq('student_id', userId)
      .order('created_at', { ascending: false });

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

  const handleSubmitQuiz = async (assignment: Assignment) => {
    const answers = selectedAnswers[assignment.id] || {};
    const questions = assignment.content.questions || [];
    
    // Check if all questions are answered
    if (Object.keys(answers).length !== questions.length) {
      toast({ title: "Please answer all questions", variant: "destructive" });
      return;
    }

    // Use secure RPC function for server-side grading
    const { data, error } = await supabase
      .rpc('submit_quiz', {
        p_assignment_id: assignment.id,
        p_user_answers: answers
      });

    if (error) {
      toast({ 
        title: "Failed to submit quiz", 
        description: error.message,
        variant: "destructive" 
      });
      return;
    }

    const result = data as { grade: number; correct: number; total: number };

    setSubmittedQuizzes(prev => ({ ...prev, [assignment.id]: true }));
    toast({ 
      title: `Quiz submitted! Score: ${result.grade.toFixed(0)}%`,
      description: `You got ${result.correct} out of ${result.total} questions correct.`
    });
    fetchAssignments();
  };

  const handleComplete = async (id: string) => {
    const { error } = await supabase
      .from('student_assignments')
      .update({ completed: true })
      .eq('id', id);

    if (error) {
      toast({ title: "Failed to mark complete", variant: "destructive" });
      return;
    }

    toast({ title: "Assignment completed!" });
    fetchAssignments();
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
        )}

        <Accordion type="single" collapsible>
          {assignments.map((assignment) => (
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
                        const selectedAnswer = selectedAnswers[assignment.id]?.[idx];
                        const isSubmitted = submittedQuizzes[assignment.id] || assignment.completed;
                        const isCorrect = selectedAnswer === q.correctAnswer;
                        
                        return (
                          <div key={idx} className="border rounded-lg p-4 space-y-3">
                            <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                            <div className="space-y-2">
                              {q.options?.map((opt: string, i: number) => {
                                const optionLetter = opt.charAt(0);
                                const isSelected = selectedAnswer === optionLetter;
                                const showCorrect = isSubmitted && optionLetter === q.correctAnswer;
                                const showWrong = isSubmitted && isSelected && !isCorrect;
                                
                                return (
                                  <button
                                    key={i}
                                    disabled={isSubmitted}
                                    onClick={() => handleAnswerSelect(assignment.id, idx, optionLetter)}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                      isSelected && !isSubmitted ? 'border-primary bg-primary/5' :
                                      showCorrect ? 'border-green-500 bg-green-50' :
                                      showWrong ? 'border-red-500 bg-red-50' :
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
                      
                      {assignment.completed && assignment.grade !== undefined && (
                        <div className="bg-primary/10 p-4 rounded-lg text-center">
                          <p className="text-lg font-semibold">Your Score: {assignment.grade.toFixed(0)}%</p>
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