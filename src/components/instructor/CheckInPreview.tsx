import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3, Radio, ArrowRight } from "lucide-react";

interface CheckInPreviewProps {
  activeSessionId?: string | null;
  onNavigate: (tab: string) => void;
}

export function CheckInPreview({ activeSessionId, onNavigate }: CheckInPreviewProps) {
  if (!activeSessionId) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-7 h-7" />}
        title="Live check-in results"
        description="During a live session, check-in results appear here in real time. You'll see how students respond to each question as it happens."
        action={{
          label: "Start Live Session",
          onClick: () => onNavigate("live"),
        }}
      />
    );
  }

  return (
    <Card className="headspace-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Live Check-In Results
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary hover:underline gap-1"
            onClick={() => onNavigate("live")}
          >
            View all check-ins <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Radio className="w-4 h-4 text-destructive animate-pulse" />
          Session is active — switch to the Live Session tab for full results.
        </div>
      </CardContent>
    </Card>
  );
}
