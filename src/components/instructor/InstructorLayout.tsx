import { ReactNode, createContext, useContext, useState, useCallback } from "react";
import { useLocation, Outlet } from "react-router-dom";
import { CourseProvider } from "@/hooks/useCourseContext";
import { PersistentRecordingBanner } from "./PersistentRecordingBanner";
import { LectureTranscription } from "./LectureTranscription";
import { cn } from "@/lib/utils";

interface InstructorLayoutContextValue {
  showTranscription: boolean;
  setShowTranscription: (show: boolean) => void;
}

const InstructorLayoutContext = createContext<InstructorLayoutContextValue | null>(null);

export function useInstructorLayout() {
  const context = useContext(InstructorLayoutContext);
  if (!context) {
    throw new Error("useInstructorLayout must be used within InstructorLayout");
  }
  return context;
}

// Optional hook that won't throw if not in context
export function useOptionalInstructorLayout() {
  return useContext(InstructorLayoutContext);
}

/**
 * Layout route component for instructor pages.
 * Uses React Router's Outlet for nested routes.
 * Keeps LectureTranscription mounted across route changes to persist recording.
 */
export function InstructorLayoutRoute() {
  const location = useLocation();
  const [showTranscription, setShowTranscription] = useState(false);
  
  // Only show LectureTranscription UI on the dashboard route when live tab is active
  const isOnDashboard = location.pathname === "/instructor/dashboard";
  const shouldShowTranscription = isOnDashboard && showTranscription;
  
  return (
    <InstructorLayoutContext.Provider value={{ showTranscription, setShowTranscription }}>
      <CourseProvider>
        <PersistentRecordingBanner />
        
        {/* 
          LectureTranscription is kept mounted but hidden when navigating away.
          This preserves the audio stream, Deepgram connection, and recording state.
        */}
        <div className={cn("min-w-0 mb-6", !shouldShowTranscription && "hidden")}>
          <LectureTranscription onQuestionGenerated={() => {}} />
        </div>
        
        <Outlet />
      </CourseProvider>
    </InstructorLayoutContext.Provider>
  );
}

interface InstructorLayoutProps {
  children: ReactNode;
}

/**
 * Wrapper component for instructor pages (when not using layout routes).
 * @deprecated Use InstructorLayoutRoute with nested routes for recording persistence.
 */
export function InstructorLayout({ children }: InstructorLayoutProps) {
  const location = useLocation();
  const [showTranscription, setShowTranscription] = useState(false);
  
  const isOnDashboard = location.pathname === "/instructor/dashboard";
  const shouldShowTranscription = isOnDashboard && showTranscription;
  
  return (
    <InstructorLayoutContext.Provider value={{ showTranscription, setShowTranscription }}>
      <CourseProvider>
        <PersistentRecordingBanner />
        
        <div className={cn("min-w-0 mb-6", !shouldShowTranscription && "hidden")}>
          <LectureTranscription onQuestionGenerated={() => {}} />
        </div>
        
        {children}
      </CourseProvider>
    </InstructorLayoutContext.Provider>
  );
}
