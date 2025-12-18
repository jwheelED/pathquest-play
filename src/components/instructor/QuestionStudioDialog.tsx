import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { QuestionStudio } from "./QuestionStudio";

interface QuestionStudioDialogProps {
  trigger?: React.ReactNode;
  lectureId?: string;
}

export const QuestionStudioDialog = ({ trigger, lectureId }: QuestionStudioDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Open Question Studio
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {lectureId ? "Calibrate Questions" : "Question Studio"}
          </DialogTitle>
        </DialogHeader>
        <QuestionStudio lectureId={lectureId} />
      </DialogContent>
    </Dialog>
  );
};
