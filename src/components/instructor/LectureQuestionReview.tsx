import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Trash2, AlertCircle, Users, Bot, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Question {
  id: string;
  text: string;
  type: 'multiple_choice' | 'short_answer';
  options?: string[];
  expectedAnswer?: string;
}

interface LectureQuestion {
  id: string;
  transcript_snippet: string;
  questions: any; // JSON from database
  status: string;
  created_at: string;
}

export const LectureQuestionReview = ({ refreshTrigger }: { refreshTrigger: number }) => {
  const [pendingQuestions, setPendingQuestions] = useState<LectureQuestion[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<{[key: string]: number}>({});
  const [gradingModes, setGradingModes] = useState<{[key: string]: 'auto_grade' | 'manual_grade'}>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingQuestions();
  }, [refreshTrigger]);

  const fetchPendingQuestions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('lecture_questions')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching questions:', error);
      return;
    }
    setPendingQuestions(data || []);
  };

  const handleSelectQuestion = (lectureQuestionId: string, questionIndex: number) => {
    setSelectedQuestions(prev => ({
      ...prev,
      [lectureQuestionId]: questionIndex
    }));
  };

  const handleSendToStudents = async (lectureQuestion: LectureQuestion) => {
    const selectedIndex = selectedQuestions[lectureQuestion.id];
    if (selectedIndex === undefined) {
      toast({ title: "Please select a question first", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // selectedQuestion is an ARRAY of questions - we need to send ONLY ONE question
      const selectedQuestionSet = lectureQuestion.questions[selectedIndex];
      
      // Take only the FIRST question from the set
      const singleQuestion = selectedQuestionSet[0];

      // Get all students for this instructor
      const { data: studentLinks } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', user.id);

      if (!studentLinks || studentLinks.length === 0) {
        toast({ title: "No students found", variant: "destructive" });
        return;
      }

      // Format single question for student quiz format
      let formattedQuestion;
      const isShortAnswer = singleQuestion.type === 'short_answer';
      
      // Get grading mode for this question (default to auto_grade for MC, check setting for short answer)
      const gradingMode = isShortAnswer ? (gradingModes[lectureQuestion.id] || 'auto_grade') : 'auto_grade';
      
      if (singleQuestion.type === 'multiple_choice') {
        // Extract correct answer letter - handle multiple formats
        let correctAnswer = singleQuestion.expectedAnswer || 'A';
        
        // If it's the full text answer, find which option it matches
        if (correctAnswer.length > 3) {
          // Find the matching option by comparing the text (case-insensitive)
          const matchingOption = singleQuestion.options?.find((opt: string) => 
            correctAnswer.toLowerCase().includes(opt.toLowerCase()) || 
            opt.toLowerCase().includes(correctAnswer.toLowerCase())
          );
          
          if (matchingOption) {
            // Extract the letter from the matching option (e.g., "A. Text" -> "A")
            correctAnswer = matchingOption.charAt(0).toUpperCase();
          }
        } else {
          // It's already just a letter or short format like "A)" or "A."
          // Extract just the first character
          correctAnswer = correctAnswer.charAt(0).toUpperCase();
        }
        
        formattedQuestion = {
          question: singleQuestion.text,
          options: singleQuestion.options || [],
          correctAnswer: correctAnswer,
          hint1: 'Think about what was just discussed',
          hint2: 'Review the key concepts from the lecture',
          hint3: 'Consider the main points emphasized',
          solution: 'Based on the lecture content'
        };
      } else {
        formattedQuestion = {
          question: singleQuestion.text,
          expectedAnswer: singleQuestion.expectedAnswer || '',
          type: 'short_answer',
          gradingMode // Include grading mode in the question data
        };
      }

      // Create array with single question
      const formattedQuestions = [formattedQuestion];

      // Batch insert optimized for large classes (40+ students)
      // Use single batch insert instead of individual inserts
      const assignments = studentLinks.map(link => ({
        instructor_id: user.id,
        student_id: link.student_id,
        assignment_type: 'lecture_checkin' as const,
        mode: gradingMode as any, // Use selected grading mode
        title: '🎯 Live Lecture Check-in',
        content: { questions: formattedQuestions, isLive: true } as any,
        completed: false,
      }));

      // Insert in a single transaction for efficiency
      const { error: insertError } = await supabase
        .from('student_assignments')
        .insert(assignments);

      if (insertError) throw insertError;

      // Update lecture question status
      const { error: updateError } = await supabase
        .from('lecture_questions')
        .update({ status: 'sent' })
        .eq('id', lectureQuestion.id);

      if (updateError) throw updateError;

      toast({ 
        title: "Question sent to students!", 
        description: `Sent to ${studentLinks.length} student(s)` 
      });
      
      fetchPendingQuestions();
    } catch (error: any) {
      console.error('Error sending question:', error);
      toast({ 
        title: "Failed to send question", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('lecture_questions')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }

    toast({ title: "Question deleted" });
    fetchPendingQuestions();
  };

  if (pendingQuestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lecture Question Review</CardTitle>
          <CardDescription>No questions pending review</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Lecture Question Review
        </CardTitle>
        <CardDescription>
          {pendingQuestions.length} question set(s) ready to send
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pendingQuestions.map((lq) => (
          <div key={lq.id} className="border rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Badge variant="secondary" className="mb-2">
                  Generated from lecture
                </Badge>
                <p className="text-sm text-muted-foreground italic mb-3">
                  "{lq.transcript_snippet}..."
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleDelete(lq.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium">Choose one question to send:</p>
              <RadioGroup 
                value={selectedQuestions[lq.id]?.toString()} 
                onValueChange={(value) => handleSelectQuestion(lq.id, parseInt(value))}
              >
                {lq.questions.map((questionSet, idx) => {
                  // Only show the first question in each set to fix the "2 questions in 1 card" bug
                  const q = questionSet[0];
                  if (!q) return null;
                  
                  const isShortAnswer = q.type === 'short_answer';
                  
                  return (
                    <div key={idx} className="flex items-start space-x-3 border rounded-lg p-3 hover:bg-muted/30">
                      <RadioGroupItem value={idx.toString()} id={`${lq.id}-${idx}`} />
                      <Label htmlFor={`${lq.id}-${idx}`} className="flex-1 cursor-pointer">
                        <div className="space-y-2">
                          <p className="font-medium">{q.text}</p>
                          {q.type === 'multiple_choice' && q.options && (
                            <ul className="text-sm text-muted-foreground ml-4 mt-1 space-y-1">
                              {q.options.map((opt, oIdx) => {
                                const letter = String.fromCharCode(65 + oIdx); // A, B, C, D...
                                return (
                                  <li key={oIdx} className="font-medium">
                                    <span className="font-bold">{letter}.</span> {opt}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {isShortAnswer && (
                            <div className="ml-4 mt-2 space-y-2">
                              <p className="text-sm text-muted-foreground italic">
                                Students will type their answer
                              </p>
                              <Badge variant="outline" className="text-xs">
                                Short Answer Question
                              </Badge>
                            </div>
                          )}
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Show grading mode toggle only when a short answer question is selected */}
            {selectedQuestions[lq.id] !== undefined && 
             lq.questions[selectedQuestions[lq.id]]?.[0]?.type === 'short_answer' && (
              <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`grading-mode-${lq.id}`} className="text-sm font-medium">
                        Short Answer Grading Mode
                      </Label>
                      <Badge variant={gradingModes[lq.id] === 'manual_grade' ? 'default' : 'secondary'} className="text-xs">
                        {gradingModes[lq.id] === 'manual_grade' ? (
                          <><UserCog className="h-3 w-3 mr-1" /> Manual</>
                        ) : (
                          <><Bot className="h-3 w-3 mr-1" /> Auto-Grade</>
                        )}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {gradingModes[lq.id] === 'manual_grade' 
                        ? "You will manually grade each student's response" 
                        : "AI will automatically grade responses based on expected answer"}
                    </p>
                  </div>
                  <Switch
                    id={`grading-mode-${lq.id}`}
                    checked={gradingModes[lq.id] === 'manual_grade'}
                    onCheckedChange={(checked) => {
                      setGradingModes(prev => ({
                        ...prev,
                        [lq.id]: checked ? 'manual_grade' : 'auto_grade'
                      }));
                    }}
                  />
                </div>
              </div>
            )}

            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                This will send the selected question to <strong>all your students</strong> immediately as a live lecture check-in.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button 
                onClick={() => handleSendToStudents(lq)}
                disabled={selectedQuestions[lq.id] === undefined}
                className="flex-1"
              >
                <Send className="mr-2 h-4 w-4" />
                Send to All Students
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};