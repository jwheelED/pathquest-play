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
    return null; // Don't show empty state when not in session - cleaner overview
  }

  return (
    <div className="command-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="section-headline text-base">Live Check-In Results</h3>
            <p className="text-sm text-charcoal-subtle">Real-time responses from your session</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-sm text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 gap-1 rounded-full"
          onClick={() => onNavigate("live")}
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2.5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
        <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
        <span className="text-sm text-emerald-700">Session is active — switch to Live Session tab for full results.</span>
      </div>
    </div>
  );
}
