import { LectureCheckInResults } from "./LectureCheckInResults";

interface LiveResponsesEmptyProps {
  hasActiveSession: boolean;
}

export function LiveResponsesEmpty({ hasActiveSession }: LiveResponsesEmptyProps) {
  return <LectureCheckInResults />;
}
