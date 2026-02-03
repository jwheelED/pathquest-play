import { useState, useEffect, createContext, useContext, ReactNode, lazy, Suspense } from "react";
import { Outlet, useLocation, useOutletContext, useMatch } from "react-router-dom";
import { cn } from "@/lib/utils";
import { RecordingProvider, useRecordingContext, useRecordingContextSafe } from "@/contexts/RecordingContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Radio, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

// Lazy load the dashboard to avoid circular imports
const InstructorDashboard = lazy(() => import("@/pages/InstructorDashboard"));

/**
 * Persistent recording banner shown when instructor navigates away from dashboard while recording
 */
function PersistentRecordingBanner() {
  const context = useRecordingContextSafe();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Don't show banner if not recording or if on the main dashboard
  if (!context?.recordingState.isRecording) return null;
  if (location.pathname === "/instructor/dashboard") return null;
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Alert className="fixed bottom-4 right-4 z-50 w-auto max-w-md border-destructive/50 bg-destructive/10 backdrop-blur-sm shadow-lg">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-destructive animate-pulse" />
          <AlertDescription className="text-sm font-medium">
            Recording in progress
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatTime(context.recordingState.recordingDuration)}</span>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          className="h-7 text-xs"
          onClick={() => navigate("/instructor/dashboard")}
        >
          Return to Lecture
        </Button>
      </div>
    </Alert>
  );
}

// Context to pass recording context to child routes
interface InstructorLayoutContextType {
  recordingContext: ReturnType<typeof useRecordingContext>;
}

export function useInstructorLayoutContext() {
  return useOutletContext<InstructorLayoutContextType>();
}

/**
 * Inner layout component that renders the persistent recording UI
 * Must be inside RecordingProvider to access context
 * 
 * KEY ARCHITECTURE:
 * - The InstructorDashboard is ALWAYS mounted (but hidden when not on dashboard route)
 * - This ensures the LectureTranscription component inside it stays alive
 * - Other routes are rendered via Outlet when navigating away from dashboard
 */
function InstructorLayoutInner() {
  const location = useLocation();
  const context = useRecordingContext();
  
  const isOnDashboard = location.pathname === "/instructor/dashboard";
  // Track if we've ever been on the dashboard (to lazy-mount it)
  const [hasMountedDashboard, setHasMountedDashboard] = useState(false);
  
  useEffect(() => {
    if (isOnDashboard) {
      setHasMountedDashboard(true);
    }
  }, [isOnDashboard]);
  
  // Once mounted, keep dashboard mounted forever (hidden when not active)
  const shouldKeepDashboardMounted = hasMountedDashboard || isOnDashboard;
  
  return (
    <>
      {/* Persistent recording banner for non-dashboard pages */}
      <PersistentRecordingBanner />
      
      {/* 
        Dashboard is kept mounted but hidden when navigating away.
        This preserves the LectureTranscription component and its recording state.
      */}
      {shouldKeepDashboardMounted && (
        <div className={cn(isOnDashboard ? "" : "hidden")}>
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          }>
            <InstructorDashboard />
          </Suspense>
        </div>
      )}
      
      {/* Render other routes via Outlet when not on dashboard */}
      {!isOnDashboard && (
        <Outlet context={{ recordingContext: context }} />
      )}
    </>
  );
}

/**
 * Instructor Layout Wrapper
 * 
 * This component wraps all instructor routes and provides:
 * 1. RecordingContext for persistent recording state
 * 2. A persistent InstructorDashboard that stays mounted across route changes
 * 3. A persistent banner showing recording status when not on the dashboard
 * 
 * This ensures that live lecture recordings continue even when the instructor
 * navigates to settings, materials, or other pages.
 */
export function InstructorLayout() {
  return (
    <RecordingProvider>
      <InstructorLayoutInner />
    </RecordingProvider>
  );
}
