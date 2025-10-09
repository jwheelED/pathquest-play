import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, FileText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Assignment {
  id: string;
  title: string;
  assignment_type: string;
  mode: string;
  completed: boolean;
  grade: number | null;
  created_at: string;
  student_id: string;
  studentName?: string;
}

export function AssignedContentManager() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: assignmentData, error } = await supabase
        .from("student_assignments")
        .select("id, title, assignment_type, mode, completed, grade, created_at, student_id")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!assignmentData || assignmentData.length === 0) {
        setAssignments([]);
        return;
      }

      // Fetch student names
      const studentIds = [...new Set(assignmentData.map(a => a.student_id))];
      const { data: studentData } = await supabase
        .from("users")
        .select("id, name")
        .in("id", studentIds);

      const studentMap = new Map(studentData?.map(s => [s.id, s.name]) || []);

      const enrichedAssignments = assignmentData.map(assignment => ({
        ...assignment,
        studentName: studentMap.get(assignment.student_id) || "Unknown"
      }));

      setAssignments(enrichedAssignments);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      toast.error("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("student_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
      toast.success("Assignment removed successfully!");
      fetchAssignments();
    } catch (error) {
      console.error("Error deleting assignment:", error);
      toast.error("Failed to remove assignment");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Manage Assigned Content</CardTitle>
          <CardDescription>View and remove student assignments</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Manage Assigned Content
        </CardTitle>
        <CardDescription>View and remove student assignments</CardDescription>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No assignments yet. Create and assign content to students to see them here.
          </p>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-start justify-between p-4 bg-muted/30 rounded-lg border"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold">{assignment.title}</h4>
                    <Badge variant="outline">{assignment.assignment_type}</Badge>
                    {assignment.completed && (
                      <Badge variant="default" className="bg-green-500">
                        Completed
                      </Badge>
                    )}
                    {assignment.grade !== null && (
                      <Badge variant="secondary">
                        Grade: {assignment.grade}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Student: {assignment.studentName} • Mode: {assignment.mode.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assigned: {new Date(assignment.created_at).toLocaleDateString()}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-2">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Assignment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove this assignment from the student's dashboard. 
                        {assignment.completed && " The student has already completed this assignment."}
                        {" "}This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleDelete(assignment.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
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
}
