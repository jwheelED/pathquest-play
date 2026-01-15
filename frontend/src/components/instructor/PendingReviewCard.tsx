import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface PendingAssignment {
  id: string;
  student_id: string;
  student_name: string;
  title: string;
  content: any;
  quiz_responses: any;
  created_at: string;
}

export const PendingReviewCard = () => {
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [grades, setGrades] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingReview();
    
    // Real-time updates for new submissions
    const channel = supabase
      .channel('pending-review-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_assignments'
        },
        () => {
          fetchPendingReview();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPendingReview = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get assignments with short answer questions that are completed but not graded
    const { data: assignments, error } = await supabase
      .from('student_assignments')
      .select('id, student_id, title, content, quiz_responses, created_at')
      .eq('instructor_id', user.id)
      .eq('completed', true)
      .is('grade', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending reviews:', error);
      return;
    }

    // Get student names
    const studentIds = [...new Set(assignments?.map(a => a.student_id) || [])];
    const { data: students } = await supabase
      .from('users')
      .select('id, name')
      .in('id', studentIds);

    const studentMap = new Map(students?.map(s => [s.id, s.name]) || []);

    const assignmentsWithNames = assignments?.map(a => ({
      ...a,
      student_name: studentMap.get(a.student_id) || 'Unknown'
    })) || [];

    setPendingAssignments(assignmentsWithNames);
  };

  const handleGradeChange = (assignmentId: string, grade: number) => {
    setGrades(prev => ({ ...prev, [assignmentId]: grade }));
  };

  const handleSubmitGrade = async (assignmentId: string) => {
    const grade = grades[assignmentId];
    if (grade === undefined || grade < 0 || grade > 100) {
      toast({ 
        title: "Invalid grade", 
        description: "Please enter a grade between 0 and 100",
        variant: "destructive" 
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('student_assignments')
        .update({ grade })
        .eq('id', assignmentId);

      if (error) throw error;

      toast({ title: "✅ Grade submitted successfully!" });
      fetchPendingReview();
      
      // Clear the grade input
      setGrades(prev => {
        const updated = { ...prev };
        delete updated[assignmentId];
        return updated;
      });
    } catch (error: any) {
      toast({ 
        title: "Failed to submit grade", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  if (pendingAssignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Pending Reviews
          </CardTitle>
          <CardDescription>Short answer questions awaiting review</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">No assignments need review</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-500" />
          Pending Reviews
          <Badge variant="destructive">{pendingAssignments.length}</Badge>
        </CardTitle>
        <CardDescription>Short answer questions awaiting your review</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-2">
          {pendingAssignments.map((assignment) => (
            <AccordionItem key={assignment.id} value={assignment.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">{assignment.student_name}</span>
                    <Badge variant="outline">
                      {new Date(assignment.created_at).toLocaleDateString()}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">{assignment.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {assignment.content.questions?.map((question: any, qIdx: number) => {
                  if (question.type !== 'short_answer') return null;
                  
                  const studentAnswer = assignment.quiz_responses?.[qIdx];
                  
                  return (
                    <div key={qIdx} className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold">Question {qIdx + 1}: {question.question}</h4>
                      
                      <div className="bg-muted/50 p-3 rounded">
                        <p className="text-sm font-medium mb-1">Student's Answer:</p>
                        <p className="text-sm whitespace-pre-wrap">{studentAnswer || 'No answer provided'}</p>
                      </div>
                      
                      {question.expectedAnswer && (
                        <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded">
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">Expected Answer:</p>
                          <p className="text-sm text-blue-800 dark:text-blue-300">{question.expectedAnswer}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Grade (0-100)</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Enter grade"
                      value={grades[assignment.id] ?? ''}
                      onChange={(e) => handleGradeChange(assignment.id, parseInt(e.target.value))}
                      className="w-32"
                    />
                  </div>
                  <Button 
                    onClick={() => handleSubmitGrade(assignment.id)}
                    className="mt-6"
                  >
                    Submit Grade
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};
