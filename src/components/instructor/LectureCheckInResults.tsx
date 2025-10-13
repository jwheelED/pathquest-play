import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
    fetchResults();
    
    // Debounced fetch to prevent overwhelming with 40+ students
    let debounceTimer: NodeJS.Timeout;
    
    // Set up real-time subscription for assignment updates
    const channel = supabase
      .channel('instructor-checkin-results')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_assignments',
          filter: `assignment_type=eq.lecture_checkin`
        },
        (payload) => {
          console.log('Check-in result updated:', payload);
          // Debounce to handle multiple rapid updates from 40+ students
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchResults();
          }, 500); // Wait 500ms after last update
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchResults = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Optimized query: Fetch only recent check-ins (last 24 hours) to reduce load
    // For classroom of 40 students, this limits data transfer significantly
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    // Fetch all lecture check-in assignments with optimized select
    const { data: assignments, error } = await supabase
      .from('student_assignments')
      .select(`
        id,
        student_id,
        title,
        content,
        quiz_responses,
        grade,
        completed,
        created_at
      `)
      .eq('instructor_id', user.id)
      .eq('assignment_type', 'lecture_checkin')
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(200); // Limit to prevent excessive data with large classes

    if (error) {
      console.error('Error fetching results:', error);
      setLoading(false);
      return;
    }

    // Get student names in batches if needed (efficient for 40+ students)
    const studentIds = [...new Set(assignments?.map(a => a.student_id) || [])];
    const { data: students } = await supabase
      .from('users')
      .select('id, name')
      .in('id', studentIds);

    const studentMap = new Map(students?.map(s => [s.id, s.name]) || []);

    // Add student names to assignments
    const assignmentsWithNames = assignments?.map(a => ({
      ...a,
      student_name: studentMap.get(a.student_id) || 'Unknown'
    })) || [];

    // Group by timestamp (within 5 minutes)
    const groups: GroupedAssignment[] = [];
    
    assignmentsWithNames.forEach(assignment => {
      const timestamp = new Date(assignment.created_at).getTime();
      
      // Find existing group within 5 minutes
      const existingGroup = groups.find(g => {
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
          questions: content?.questions || []
        });
      }
    });

    setGroupedResults(groups);
    setLoading(false);
  };

  const calculateQuestionStats = (assignments: Assignment[], questionIndex: number, correctAnswer: string) => {
    const completed = assignments.filter(a => a.completed);
    const correct = completed.filter(a => {
      const response = a.quiz_responses?.[questionIndex];
      return response === correctAnswer;
    });

    return {
      total: assignments.length,
      completed: completed.length,
      correct: correct.length,
      percentage: completed.length > 0 ? (correct.length / completed.length) * 100 : 0
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
        <CardDescription>
          Auto-graded student performance on lecture questions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-2">
          {groupedResults.map((group, groupIdx) => (
            <AccordionItem key={groupIdx} value={`group-${groupIdx}`} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">
                      {new Date(group.timestamp).toLocaleString()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {group.assignments.length} student(s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.assignments.filter(a => a.completed).length === group.assignments.length ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        All Complete
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {group.assignments.filter(a => a.completed).length}/{group.assignments.length} Complete
                      </Badge>
                    )}
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
                              {question.options.map((opt: string, oIdx: number) => (
                                <li key={oIdx} className={opt.startsWith(question.correctAnswer) ? 'font-medium text-green-600' : ''}>
                                  {opt} {opt.startsWith(question.correctAnswer) && '✓'}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">
                            {(stats.percentage || 0).toFixed(0)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {stats.correct}/{stats.completed} correct
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <p className="text-sm font-medium mb-2">Student Responses (Kahoot-style):</p>
                        <div className="space-y-2">
                          {group.assignments.map((assignment) => {
                            const studentAnswer = assignment.quiz_responses?.[qIdx];
                            const isCompleted = assignment.completed;
                            const isCorrect = studentAnswer === question.correctAnswer;

                            return (
                              <div key={assignment.id} className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50">
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
                                        className={`gap-1 ${isCorrect ? 'bg-green-600' : ''}`}
                                      >
                                        {isCorrect ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                        {isCorrect ? 'Correct' : 'Incorrect'}
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
                        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs font-medium mb-2">Answer Distribution:</p>
                          <div className="space-y-1">
                            {question.options?.map((opt: string) => {
                              const optionLetter = opt.charAt(0);
                              const count = group.assignments.filter(a => 
                                a.completed && a.quiz_responses?.[qIdx] === optionLetter
                              ).length;
                              const total = group.assignments.filter(a => a.completed).length;
                              const percentage = total > 0 ? (count / total) * 100 : 0;
                              const isCorrect = optionLetter === question.correctAnswer;
                              
                              return (
                                <div key={optionLetter} className="flex items-center gap-2 text-xs">
                                  <span className={`font-mono w-6 ${isCorrect ? 'text-green-600 font-bold' : ''}`}>
                                    {optionLetter}{isCorrect ? ' ✓' : ''}
                                  </span>
                                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                                    <div 
                                      className={`h-full ${isCorrect ? 'bg-green-500' : 'bg-primary'}`}
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="w-16 text-right">{count}/{total} ({(percentage || 0).toFixed(0)}%)</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
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
