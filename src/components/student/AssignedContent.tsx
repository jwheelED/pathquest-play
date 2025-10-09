import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, CheckCircle, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Assignment {
  id: string;
  title: string;
  assignment_type: string;
  mode: string;
  content: any;
  completed: boolean;
  created_at: string;
}

export const AssignedContent = ({ userId }: { userId: string }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
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
    setAssignments(data || []);
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
        <Accordion type="single" collapsible>
          {assignments.map((assignment) => (
            <AccordionItem key={assignment.id} value={assignment.id}>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>{assignment.title}</span>
                  <Badge variant={assignment.completed ? "default" : "secondary"}>
                    {assignment.assignment_type.replace('_', ' ')}
                  </Badge>
                  {assignment.completed && <CheckCircle className="h-4 w-4 text-green-500" />}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {/* Quiz Display */}
                  {assignment.assignment_type === 'quiz' && assignment.content.questions && (
                    <div className="space-y-4">
                      {assignment.content.questions.map((q: any, idx: number) => (
                        <div key={idx} className="border rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                          <div className="space-y-1">
                            {q.options?.map((opt: string, i: number) => (
                              <div key={i} className="text-sm">{opt}</div>
                            ))}
                          </div>
                          
                          {(assignment.mode === "hints_only" || assignment.mode === "hints_solutions") && (
                            <div className="bg-muted/50 p-3 rounded space-y-2">
                              <p className="text-xs font-medium">Hint 1 (Conceptual):</p>
                              <p className="text-xs text-muted-foreground">{q.hint1}</p>
                              <p className="text-xs font-medium">Hint 2 (Narrowing):</p>
                              <p className="text-xs text-muted-foreground">{q.hint2}</p>
                              <p className="text-xs font-medium">Hint 3 (Reasoning):</p>
                              <p className="text-xs text-muted-foreground">{q.hint3}</p>
                            </div>
                          )}
                          
                          {assignment.mode === "hints_solutions" && (
                            <div className="bg-primary/5 p-3 rounded space-y-1">
                              <p className="text-xs font-semibold">Answer: {q.correctAnswer}</p>
                              <p className="text-xs text-muted-foreground">{q.solution}</p>
                            </div>
                          )}
                        </div>
                      ))}
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

                  {!assignment.completed && (
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