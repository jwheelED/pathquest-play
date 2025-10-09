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
                  <div>
                    <h4 className="font-semibold mb-2">Content</h4>
                    <p className="text-sm text-muted-foreground">
                      {assignment.content.slideText || assignment.content.description || 'No content available'}
                    </p>
                  </div>

                  {assignment.mode === "hints_only" && (
                    <div>
                      <h4 className="font-semibold mb-2">Hints</h4>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        <li>Hint 1: Conceptual approach</li>
                        <li>Hint 2: Nudge in the right direction</li>
                        <li>Hint 3: Pseudo-code guidance</li>
                      </ul>
                    </div>
                  )}

                  {assignment.mode === "hints_solutions" && (
                    <div>
                      <h4 className="font-semibold mb-2">Solution Available</h4>
                      <p className="text-sm text-muted-foreground">
                        Hints and full solution are available for this assignment
                      </p>
                    </div>
                  )}

                  {assignment.content.codeExample && (
                    <div>
                      <h4 className="font-semibold mb-2">Code Example</h4>
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                        {assignment.content.codeExample}
                      </pre>
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