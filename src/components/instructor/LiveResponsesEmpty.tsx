import { LectureCheckInResults } from "./LectureCheckInResults";
import { LiveSessionResults } from "./LiveSessionResults";

interface LiveResponsesEmptyProps {
  hasActiveSession: boolean;
  activeSessionId?: string;
}

export function LiveResponsesEmpty({ hasActiveSession, activeSessionId }: LiveResponsesEmptyProps) {
  if (activeSessionId) {
    return <LiveSessionResults sessionId={activeSessionId} />;
  }
  return <LectureCheckInResults />;
}
