import { useLocation, useNavigate } from "react-router-dom";
import { useOptionalRecordingContext } from "@/contexts/RecordingContext";
import { Radio, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shows a persistent banner when recording is active and user navigates away
 * from the live lecture tab. Allows quick return to the recording.
 */
export function PersistentRecordingBanner() {
  const recordingContext = useOptionalRecordingContext();
  const location = useLocation();
  const navigate = useNavigate();

  // Don't render if no context or not recording
  if (!recordingContext?.state.isRecording) {
    return null;
  }

  // Only show on non-dashboard instructor routes (settings, slides, etc.)
  // or when on dashboard but not on live tab
  const isOnDashboard = location.pathname === "/instructor/dashboard";
  const isOnSlides = location.pathname === "/instructor/slides";
  const isOnSettings = location.pathname === "/instructor/settings";
  
  // Don't show on slides page since it has its own recording UI
  if (isOnSlides) {
    return null;
  }
  
  // Show on settings and other instructor pages
  if (!isOnSettings && isOnDashboard) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-50",
      "bg-destructive/95 backdrop-blur-sm text-destructive-foreground",
      "px-4 py-2 flex items-center justify-between gap-4",
      "shadow-lg animate-in slide-in-from-top duration-300"
    )}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 animate-pulse" />
          <span className="font-semibold text-sm">Recording Active</span>
        </div>
        <div className="h-4 w-px bg-destructive-foreground/30" />
        <span className="text-sm tabular-nums">
          {formatTime(recordingContext.state.recordingDuration)}
        </span>
        {recordingContext.state.autoQuestionEnabled && (
          <>
            <div className="h-4 w-px bg-destructive-foreground/30" />
            <span className="text-sm">
              Next Q: {formatTime(recordingContext.state.nextAutoQuestionIn)}
            </span>
          </>
        )}
      </div>
      
      <Button
        size="sm"
        variant="secondary"
        className="gap-2 bg-destructive-foreground/20 hover:bg-destructive-foreground/30 text-destructive-foreground border-0"
        onClick={() => navigate("/instructor/dashboard")}
      >
        <ArrowLeft className="h-3 w-3" />
        Return to Live Lecture
      </Button>
    </div>
  );
}
