import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface RecordingState {
  isRecording: boolean;
  recordingDuration: number;
  autoQuestionEnabled: boolean;
  autoQuestionInterval: number;
  nextAutoQuestionIn: number;
  studentCount: number;
  lastQuestionSent?: {
    question: string;
    type: string;
    timestamp: string;
  };
}

interface RecordingContextValue {
  recordingState: RecordingState;
  setIsRecording: (value: boolean) => void;
  setRecordingDuration: (value: number) => void;
  setAutoQuestionEnabled: (value: boolean) => void;
  setAutoQuestionInterval: (value: number) => void;
  setNextAutoQuestionIn: (value: number) => void;
  setStudentCount: (value: number) => void;
  setLastQuestionSent: (value: RecordingState["lastQuestionSent"]) => void;
  updateRecordingState: (updates: Partial<RecordingState>) => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    recordingDuration: 0,
    autoQuestionEnabled: false,
    autoQuestionInterval: 15,
    nextAutoQuestionIn: 0,
    studentCount: 0,
  });

  const setIsRecording = useCallback((value: boolean) => {
    setRecordingState(prev => ({ ...prev, isRecording: value }));
  }, []);

  const setRecordingDuration = useCallback((value: number) => {
    setRecordingState(prev => ({ ...prev, recordingDuration: value }));
  }, []);

  const setAutoQuestionEnabled = useCallback((value: boolean) => {
    setRecordingState(prev => ({ ...prev, autoQuestionEnabled: value }));
  }, []);

  const setAutoQuestionInterval = useCallback((value: number) => {
    setRecordingState(prev => ({ ...prev, autoQuestionInterval: value }));
  }, []);

  const setNextAutoQuestionIn = useCallback((value: number) => {
    setRecordingState(prev => ({ ...prev, nextAutoQuestionIn: value }));
  }, []);

  const setStudentCount = useCallback((value: number) => {
    setRecordingState(prev => ({ ...prev, studentCount: value }));
  }, []);

  const setLastQuestionSent = useCallback((value: RecordingState["lastQuestionSent"]) => {
    setRecordingState(prev => ({ ...prev, lastQuestionSent: value }));
  }, []);

  const updateRecordingState = useCallback((updates: Partial<RecordingState>) => {
    setRecordingState(prev => ({ ...prev, ...updates }));
  }, []);

  return (
    <RecordingContext.Provider
      value={{
        recordingState,
        setIsRecording,
        setRecordingDuration,
        setAutoQuestionEnabled,
        setAutoQuestionInterval,
        setNextAutoQuestionIn,
        setStudentCount,
        setLastQuestionSent,
        updateRecordingState,
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecordingContext() {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error("useRecordingContext must be used within a RecordingProvider");
  }
  return context;
}

// Safe hook that doesn't throw if context is missing
export function useRecordingContextSafe() {
  return useContext(RecordingContext);
}
