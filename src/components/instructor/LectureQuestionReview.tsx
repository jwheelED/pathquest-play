import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Trash2, AlertCircle, Users, Bot, UserCog, Edit2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const [editingQuestion, setEditingQuestion] = useState<{[key: string]: number | null}>({});
  const [editedQuestions, setEditedQuestions] = useState<{[key: string]: any}>({});
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

  const startEditing = (lectureQuestionId: string, questionIndex: number, question: any) => {
    setEditingQuestion(prev => ({
      ...prev,
      [lectureQuestionId]: questionIndex
    }));
    
    // Initialize edited question with current values
    const editKey = `${lectureQuestionId}-${questionIndex}`;
    if (!editedQuestions[editKey]) {
      setEditedQuestions(prev => ({
        ...prev,
        [editKey]: {
          text: question.text,
          options: question.options ? [...question.options] : [],
          expectedAnswer: question.expectedAnswer || '',
          type: question.type
        }
      }));
    }
  };

  const cancelEditing = (lectureQuestionId: string) => {
    setEditingQuestion(prev => ({
      ...prev,
      [lectureQuestionId]: null
    }));
  };

  const saveEdit = (lectureQuestionId: string, questionIndex: number) => {
    setEditingQuestion(prev => ({
      ...prev,
      [lectureQuestionId]: null
    }));
    toast({ title: "Question updated", description: "Changes saved" });
  };

  const updateEditedQuestion = (lectureQuestionId: string, questionIndex: number, field: string, value: any) => {
    const editKey = `${lectureQuestionId}-${questionIndex}`;
    setEditedQuestions(prev => ({
      ...prev,
      [editKey]: {
        ...prev[editKey],
        [field]: value
      }
    }));
  };

  const getQuestionToDisplay = (lectureQuestionId: string, questionIndex: number, originalQuestion: any) => {
    const editKey = `${lectureQuestionId}-${questionIndex}`;
    return editedQuestions[editKey] || originalQuestion;
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
      const originalQuestion = selectedQuestionSet[0];
      
      // Use edited version if available
      const singleQuestion = getQuestionToDisplay(lectureQuestion.id, selectedIndex, originalQuestion);

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
        
        // Ensure correctAnswer is just a single letter - extract and clean
        correctAnswer = correctAnswer.trim().charAt(0).toUpperCase();
        
        // Add letter prefixes to options (A., B., C., D.)
        const letters = ['A', 'B', 'C', 'D'];
        const optionsWithLetters = (singleQuestion.options || []).map((opt: string, idx: number) => {
          // Remove any existing letter prefix to avoid duplication
          const cleanOpt = opt.replace(/^[A-D][\.\)]\s*/, '').trim();
          // Add standardized letter prefix
          return `${letters[idx]}. ${cleanOpt}`;
        });
        
        formattedQuestion = {
          question: singleQuestion.text,
          options: optionsWithLetters,
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

  const handleDeleteAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('lecture_questions')
      .delete()
      .eq('instructor_id', user.id)
      .eq('status', 'pending');

    if (error) {
      toast({ title: "Failed to delete all questions", variant: "destructive" });
      return;
    }

    toast({ title: "All questions deleted" });
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Lecture Question Review
            </CardTitle>
            <CardDescription>
              {pendingQuestions.length} question set(s) ready to send
            </CardDescription>
          </div>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleDeleteAll}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete All
          </Button>
        </div>
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
                  const originalQ = questionSet[0];
                  if (!originalQ) return null;
                  
                  const q = getQuestionToDisplay(lq.id, idx, originalQ);
                  const isShortAnswer = q.type === 'short_answer';
                  const isEditing = editingQuestion[lq.id] === idx;
                  const isSelected = selectedQuestions[lq.id] === idx;
                  
                  return (
                    <div key={idx} className="space-y-3">
                      <div className="flex items-start space-x-3 border rounded-lg p-3 hover:bg-muted/30">
                        {!isEditing && <RadioGroupItem value={idx.toString()} id={`${lq.id}-${idx}`} />}
                        <div className="flex-1">
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Question Text</Label>
                                <Textarea
                                  value={q.text}
                                  onChange={(e) => updateEditedQuestion(lq.id, idx, 'text', e.target.value)}
                                  className="min-h-[60px]"
                                />
                              </div>
                              
                              {q.type === 'multiple_choice' && q.options && (
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Answer Options</Label>
                                  {q.options.map((opt: string, oIdx: number) => (
                                    <div key={oIdx} className="flex items-center gap-2">
                                      <span className="font-bold text-sm w-6">{String.fromCharCode(65 + oIdx)}.</span>
                                      <Input
                                        value={opt}
                                        onChange={(e) => {
                                          const newOptions = [...q.options];
                                          newOptions[oIdx] = e.target.value;
                                          updateEditedQuestion(lq.id, idx, 'options', newOptions);
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {isShortAnswer && (
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Expected Answer (for auto-grading)</Label>
                                  <Input
                                    value={q.expectedAnswer || ''}
                                    onChange={(e) => updateEditedQuestion(lq.id, idx, 'expectedAnswer', e.target.value)}
                                    placeholder="Expected answer..."
                                  />
                                </div>
                              )}
                              
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveEdit(lq.id, idx)}>
                                  <Check className="h-3 w-3 mr-1" /> Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => cancelEditing(lq.id)}>
                                  <X className="h-3 w-3 mr-1" /> Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Label htmlFor={`${lq.id}-${idx}`} className="cursor-pointer">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between">
                                  <p className="font-medium">{q.text}</p>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      startEditing(lq.id, idx, q);
                                    }}
                                    className="h-7 w-7 p-0"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                {q.type === 'multiple_choice' && q.options && (
                                  <ul className="text-sm text-muted-foreground ml-4 mt-1 space-y-1">
                                    {q.options.map((opt: string, oIdx: number) => {
                                      const letter = String.fromCharCode(65 + oIdx);
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
                          )}
                        </div>
                      </div>

                      {/* Show send card right under this question when selected */}
                      {isSelected && (
                        <div className="ml-8 space-y-3 animate-in fade-in-50 slide-in-from-top-2">
                          {/* Show grading mode toggle only for short answer questions */}
                          {isShortAnswer && (
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

                          <Button 
                            onClick={() => handleSendToStudents(lq)}
                            className="w-full"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Send to All Students
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};