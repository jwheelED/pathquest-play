import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2, XCircle, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { isConfidentWrong, type ConfidenceLevel } from "@/lib/studentSignals";
import type { VideoResponseGroup, QuestionResponse } from "@/hooks/useStudentDetail";

interface StudentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  groups: VideoResponseGroup[];
}

const confidenceLabel: Record<ConfidenceLevel, string> = {
  absolutely_sure: "Absolutely sure",
  pretty_sure: "Pretty sure",
  maybe: "Maybe",
  not_sure: "Not sure",
};

function ResultBadge({ r }: { r: QuestionResponse }) {
  if (r.correct === true || (r.correct === null && r.grade !== null && r.grade >= 70)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {r.correct === null && r.grade !== null ? `${Math.round(r.grade)}%` : "Correct"}
      </span>
    );
  }
  if (r.correct === false || r.grade !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        {r.correct === null && r.grade !== null ? `${Math.round(r.grade)}%` : "Incorrect"}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Ungraded</span>;
}

export default function StudentDetailDialog({ open, onOpenChange, studentName, groups }: StudentDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {studentName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl">{studentName}</DialogTitle>
              <DialogDescription>
                Every lecture question they answered — their answer, confidence, and feedback.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No question responses yet.</p>
        ) : (
          <Accordion type="multiple" defaultValue={groups.length === 1 ? [groups[0].videoId] : []} className="w-full">
            {groups.map(group => (
              <AccordionItem key={group.videoId} value={group.videoId}>
                <AccordionTrigger className="text-left">
                  <div className="flex flex-col gap-0.5 pr-2">
                    <span className="text-sm font-semibold">{group.videoTitle}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {group.responses.length}
                      {group.questionCount > 0 ? ` of ${group.questionCount}` : ""} answered
                      {group.completedAt
                        ? ` · completed ${new Date(group.completedAt).toLocaleDateString()}`
                        : " · in progress"}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {group.responses.map((r, i) => {
                    const confidentWrong = isConfidentWrong(r);
                    return (
                      <div key={`${r.pausePointId}-${i}`} className="rounded-xl border border-border p-4 space-y-2.5">
                        <p className="text-sm font-medium text-foreground">{r.questionText}</p>
                        <div className="rounded-lg bg-muted/40 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Their answer</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {r.answer || <span className="text-muted-foreground italic">No answer recorded</span>}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <ResultBadge r={r} />
                          {r.confidence && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                confidentWrong
                                  ? "bg-destructive/10 text-destructive border-destructive/30"
                                  : "text-muted-foreground"
                              )}
                            >
                              {confidenceLabel[r.confidence]}
                              {confidentWrong && " — misconception risk"}
                            </Badge>
                          )}
                          {r.timestamp && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(r.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {r.feedback && (
                          <div className="flex gap-2 border-l-2 border-border pl-3">
                            <MessageSquareQuote className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.feedback}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </DialogContent>
    </Dialog>
  );
}
