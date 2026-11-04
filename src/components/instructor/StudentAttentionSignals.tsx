import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import type { AttentionSignal, StudentStatus } from "@/lib/studentSignals";

interface Props {
  signals: AttentionSignal[];
  suggestedAction: string | null;
  status: StudentStatus;
}

export function StudentAttentionSignals({ signals, suggestedAction, status }: Props) {
  if (status === "new") {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          No data yet — signals appear after their first check-in or lecture.
        </p>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">No flags — participating normally.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-foreground">Why this student is flagged</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {signals.map((s, i) => (
          <Badge key={i} variant="outline" className="font-medium bg-background">
            {s.label}
            {s.detail && <span className="ml-1.5 font-normal text-muted-foreground">· {s.detail}</span>}
          </Badge>
        ))}
      </div>
      {suggestedAction && (
        <p className="text-sm text-foreground flex items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold">Suggested:</span> {suggestedAction}
        </p>
      )}
    </div>
  );
}
