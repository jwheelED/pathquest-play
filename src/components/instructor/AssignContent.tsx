import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Student {
  id: string;
  name: string;
}

interface ApprovedContent {
  id: string;
  topic: string;
  assignment_type: string;
  slide_text: string;
  code_example: string | null;
  demo_snippets: any;
}

export const AssignContent = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [approvedContent, setApprovedContent] = useState<ApprovedContent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedContent, setSelectedContent] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<"hints_only" | "hints_solutions" | "auto_grade">("hints_only");
  const { toast } = useToast();

  useEffect(() => {
    fetchStudents();
    fetchApprovedContent();
  }, []);

  const fetchStudents = async () => {
    const { data: instructorStudents } = await supabase
      .from('instructor_students')
      .select('student_id');

    if (!instructorStudents) return;

    const studentIds = instructorStudents.map(is => is.student_id);
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', studentIds);

    setStudents(users || []);
  };

  const fetchApprovedContent = async () => {
    const { data } = await supabase
      .from('content_drafts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    setApprovedContent(data || []);
  };

  const handleAssign = async () => {
    if (!selectedStudent || !selectedContent) {
      toast({ title: "Please select student and content", variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const content = approvedContent.find(c => c.id === selectedContent);
    if (!content) return;

    const { error } = await supabase
      .from('student_assignments')
      .insert([{
        instructor_id: user.id,
        student_id: selectedStudent,
        draft_id: content.id,
        assignment_type: content.assignment_type as any,
        mode: assignmentMode,
        title: content.slide_text,
        content: content.demo_snippets
      }]);

    if (error) {
      toast({ title: "Failed to assign content", variant: "destructive" });
      return;
    }

    toast({ title: "Content assigned successfully!" });
    setSelectedStudent("");
    setSelectedContent("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign Content</CardTitle>
        <CardDescription>Assign approved content to students</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Student</Label>
          <Select value={selectedStudent} onValueChange={setSelectedStudent}>
            <SelectTrigger>
              <SelectValue placeholder="Select student" />
            </SelectTrigger>
            <SelectContent>
              {students.map(student => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
          <Select value={selectedContent} onValueChange={setSelectedContent}>
            <SelectTrigger>
              <SelectValue placeholder="Select content" />
            </SelectTrigger>
            <SelectContent>
              {approvedContent.map(content => (
                <SelectItem key={content.id} value={content.id}>
                  {content.topic} <Badge variant="outline" className="ml-2">{content.assignment_type}</Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Assignment Mode</Label>
          <Select value={assignmentMode} onValueChange={(v: any) => setAssignmentMode(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hints_only">Hints Only</SelectItem>
              <SelectItem value="hints_solutions">Hints + Solutions</SelectItem>
              <SelectItem value="auto_grade">Auto-Grade</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {assignmentMode === "hints_only" && "Students get conceptual hints, nudges, and pseudo-code"}
            {assignmentMode === "hints_solutions" && "Students get hints and full solutions"}
            {assignmentMode === "auto_grade" && "For multiple-choice quizzes with automatic grading"}
          </p>
        </div>

        <Button onClick={handleAssign} className="w-full">
          <Send className="mr-2 h-4 w-4" />
          Assign to Student
        </Button>
      </CardContent>
    </Card>
  );
};