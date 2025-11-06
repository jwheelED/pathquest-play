import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Clock, Unlock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Assignment {
  id: string;
  title: string;
  assignment_type: string;
  created_at: string;
  completed_count: number;
  total_students: number;
  answers_released: boolean;
}

export const AnswerReleaseCard = ({ instructorId }: { instructorId: string }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);

  useEffect(() => {
    fetchAssignments();

    // Real-time updates
    const channel = supabase
      .channel('assignment-releases')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_assignments',
          filter: `instructor_id=eq.${instructorId}`
        },
        () => {
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instructorId]);

  const fetchAssignments = async () => {
    setLoading(true);
    
    // Get assignments with submission statistics
    const { data, error } = await supabase
      .from('student_assignments')
      .select('*')
      .eq('instructor_id', instructorId)
      .eq('completed', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching assignments:', error);
      setLoading(false);
      return;
    }

    // Group by assignment title and aggregate stats
    const grouped = data.reduce((acc: Record<string, any>, curr) => {
      const key = `${curr.title}_${curr.created_at}`;
      if (!acc[key]) {
        acc[key] = {
          id: curr.id,
          title: curr.title,
          assignment_type: curr.assignment_type,
          created_at: curr.created_at,
          answers_released: curr.answers_released,
          completed_count: 0,
          assignment_ids: []
        };
      }
      acc[key].completed_count++;
      acc[key].assignment_ids.push(curr.id);
      return acc;
    }, {});

    // Get total student count
    const { count: totalStudents } = await supabase
      .from('instructor_students')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', instructorId);

    const assignmentList = Object.values(grouped).map((a: any) => ({
      ...a,
      total_students: totalStudents || 0
    }));

    setAssignments(assignmentList);
    setLoading(false);
  };

  const handleReleaseAnswers = async (assignmentIds: string[], title: string) => {
    setReleasing(title);

    const { error } = await supabase
      .from('student_assignments')
      .update({ answers_released: true })
      .in('id', assignmentIds);

    if (error) {
      toast.error('Failed to release answers');
      console.error('Error releasing answers:', error);
    } else {
      toast.success(`Answers released for "${title}"`);
      fetchAssignments();
    }

    setReleasing(null);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Answer Release Control</CardTitle>
          <CardDescription>Loading assignments...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pendingReleases = assignments.filter((a: any) => !a.answers_released);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Unlock className="h-5 w-5" />
          Answer Release Control
        </CardTitle>
        <CardDescription>
          Control when students can see correct answers and their scores
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pendingReleases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No assignments awaiting answer release</p>
            <p className="text-sm mt-1">All submitted assignments have answers released</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingReleases.map((assignment: any) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{assignment.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {assignment.assignment_type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {assignment.completed_count} / {assignment.total_students} submitted
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(assignment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="default"
                      disabled={releasing === assignment.title}
                    >
                      {releasing === assignment.title ? 'Releasing...' : 'Release Answers'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Release Answers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will allow all {assignment.completed_count} students who submitted 
                        "{assignment.title}" to see:
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                          <li>Their scores and grades</li>
                          <li>Correct answers and explanations</li>
                          <li>Detailed solution feedback</li>
                        </ul>
                        <p className="mt-3 font-semibold">
                          This action cannot be undone. Students will be able to share answers after release.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleReleaseAnswers(assignment.assignment_ids, assignment.title)}
                      >
                        Release Answers
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
