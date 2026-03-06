import { Radio, HelpCircle, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";

interface InstructorQuickActionsProps {
  onNavigate: (tab: string) => void;
}

export function InstructorQuickActions({ onNavigate }: InstructorQuickActionsProps) {
  const { selectedCourse } = useCourseContext();

  const handleInviteStudents = () => {
    if (selectedCourse) {
      navigator.clipboard.writeText(selectedCourse.course_code);
      toast.success("Join code copied — share it with your students!");
    }
  };

  return (
    <Card className="headspace-card h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          className="w-full justify-start gap-3 rounded-xl bg-success text-success-foreground hover:bg-success/90"
          onClick={() => onNavigate("live")}
        >
          <Radio className="w-4 h-4" />
          Start Live Session
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 rounded-xl"
          onClick={() => onNavigate("question-bank")}
        >
          <HelpCircle className="w-4 h-4" />
          Create Question
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 rounded-xl"
          onClick={() => onNavigate("question-bank")}
        >
          <Upload className="w-4 h-4" />
          Upload Slides
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 rounded-xl"
          onClick={handleInviteStudents}
        >
          <UserPlus className="w-4 h-4" />
          Invite Students
        </Button>
      </CardContent>
    </Card>
  );
}
