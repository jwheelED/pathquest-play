import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Users, CheckCircle, Code, FileText, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import type { BankQuestion } from "./QuestionBankCard";

interface PushQuestionDialogProps {
  question: BankQuestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const typeConfig: Record<string, { icon: React.ElementType; label: string }> = {
  multiple_choice: { icon: CheckSquare, label: "Multiple Choice" },
  short_answer: { icon: FileText, label: "Short Answer" },
  coding: { icon: Code, label: "Coding" },
  coding_simple: { icon: Code, label: "Coding" },
};

export function PushQuestionDialog({
  question,
  open,
  onOpenChange,
  onSuccess,
}: PushQuestionDialogProps) {
  const { selectedCourseId, selectedCourse } = useCourseContext();
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; studentCount: number } | null>(null);

  if (!question) return null;

  const config = typeConfig[question.question_type] || typeConfig.short_answer;
  const Icon = config.icon;

  // Get preview text
  const getPreviewText = () => {
    const content = question.question_content;
    if (content.question) return content.question;
    if (content.problemText) return content.problemText;
    return "No preview available";
  };

  const handlePush = async () => {
    if (!selectedCourseId) {
      toast.error("Please select a course first");
      return;
    }

    setPushing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("push-bank-question", {
        body: {
          questionId: question.id,
          courseId: selectedCourseId,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setResult({
        success: true,
        studentCount: data.studentCount || 0,
      });

      toast.success(`Question pushed to ${data.studentCount} student(s)!`);
      onSuccess();
    } catch (error: any) {
      console.error("Error pushing question:", error);
      toast.error(error.message || "Failed to push question");
      setResult(null);
    } finally {
      setPushing(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Push Question to Students
          </DialogTitle>
          <DialogDescription>
            Send this question to all students in your current course
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question Preview */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="shrink-0">
                  <Icon className="w-3 h-3 mr-1" />
                  {config.label}
                </Badge>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm mb-1">{question.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {getPreviewText()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Target Course */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Users className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {selectedCourse?.title || "No course selected"}
              </p>
              <p className="text-xs text-muted-foreground">
                All enrolled students will receive this question
              </p>
            </div>
          </div>

          {/* Success Result */}
          {result?.success && (
            <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Question Sent!</p>
                <p className="text-sm text-muted-foreground">
                  Delivered to {result.studentCount} student{result.studentCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result?.success ? "Done" : "Cancel"}
          </Button>
          {!result?.success && (
            <Button onClick={handlePush} disabled={pushing || !selectedCourseId}>
              {pushing ? (
                "Pushing..."
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Push Now
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
