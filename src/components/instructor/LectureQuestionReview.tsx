import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Send, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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

      const selectedQuestion = lectureQuestion.questions[selectedIndex];

      // Get all students for this instructor
      const { data: studentLinks } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', user.id);

      if (!studentLinks || studentLinks.length === 0) {
        toast({ title: "No students found", variant: "destructive" });
        return;
      }

      // Create assignments for all students
      const assignments = studentLinks.map(link => ({
        instructor_id: user.id,
        student_id: link.student_id,
        assignment_type: 'quiz' as const,
        mode: 'auto_grade' as const,
        title: 'Live Lecture Check-in',
        content: { questions: selectedQuestion } as any,
        completed: false,
      }));

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
                {lq.questions.map((questionSet, idx) => (
                  <div key={idx} className="flex items-start space-x-3 border rounded-lg p-3 hover:bg-muted/30">
                    <RadioGroupItem value={idx.toString()} id={`${lq.id}-${idx}`} />
                    <Label htmlFor={`${lq.id}-${idx}`} className="flex-1 cursor-pointer">
                      <div className="space-y-2">
                        {questionSet.map((q, qIdx) => (
                          <div key={qIdx}>
                            <p className="font-medium">{q.text}</p>
                            {q.type === 'multiple_choice' && q.options && (
                              <ul className="text-sm text-muted-foreground ml-4 mt-1">
                                {q.options.map((opt, oIdx) => (
                                  <li key={oIdx}>• {opt}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Button 
              onClick={() => handleSendToStudents(lq)}
              disabled={selectedQuestions[lq.id] === undefined}
              className="w-full"
            >
              <Send className="mr-2 h-4 w-4" />
              Send to Students
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};