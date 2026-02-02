import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface RecordingState {
  isRecording: boolean;
  recordingStartTime: Date | null;
  recordingDuration: number;
  transcriptBuffer: string;
  // Auto-question state
  autoQuestionEnabled: boolean;
  autoQuestionInterval: number;
  nextAutoQuestionIn: number;
  // Session info
  sessionId: string | null;
  studentCount: number;
}

interface RecordingContextValue {
  state: RecordingState;
  // Recording controls
  setIsRecording: (value: boolean) => void;
  setRecordingStartTime: (time: Date | null) => void;
  setRecordingDuration: (duration: number) => void;
  setTranscriptBuffer: (buffer: string) => void;
  appendToTranscript: (text: string) => void;
  // Auto-question controls
  setAutoQuestionEnabled: (enabled: boolean) => void;
  setAutoQuestionInterval: (interval: number) => void;
  setNextAutoQuestionIn: (seconds: number) => void;
  // Session controls
  setSessionId: (id: string | null) => void;
  setStudentCount: (count: number) => void;
  // Reset all state
  resetRecording: () => void;
}

const initialState: RecordingState = {
  isRecording: false,
  recordingStartTime: null,
  recordingDuration: 0,
  transcriptBuffer: "",
  autoQuestionEnabled: false,
  autoQuestionInterval: 15,
  nextAutoQuestionIn: 0,
  sessionId: null,
  studentCount: 0,
};

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RecordingState>(initialState);

  const setIsRecording = useCallback((value: boolean) => {
    setState(prev => ({ ...prev, isRecording: value }));
  }, []);

  const setRecordingStartTime = useCallback((time: Date | null) => {
    setState(prev => ({ ...prev, recordingStartTime: time }));
  }, []);

  const setRecordingDuration = useCallback((duration: number) => {
    setState(prev => ({ ...prev, recordingDuration: duration }));
  }, []);

  const setTranscriptBuffer = useCallback((buffer: string) => {
    setState(prev => ({ ...prev, transcriptBuffer: buffer }));
  }, []);

  const appendToTranscript = useCallback((text: string) => {
    setState(prev => {
      const MAX_BUFFER = 50000;
      const KEEP_RECENT = 40000;
      let newBuffer = prev.transcriptBuffer + " " + text;
      if (newBuffer.length > MAX_BUFFER) {
        newBuffer = newBuffer.slice(-KEEP_RECENT);
      }
      return { ...prev, transcriptBuffer: newBuffer };
    });
  }, []);

  const setAutoQuestionEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, autoQuestionEnabled: enabled }));
  }, []);

  const setAutoQuestionInterval = useCallback((interval: number) => {
    setState(prev => ({ ...prev, autoQuestionInterval: interval }));
  }, []);

  const setNextAutoQuestionIn = useCallback((seconds: number) => {
    setState(prev => ({ ...prev, nextAutoQuestionIn: seconds }));
  }, []);

  const setSessionId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, sessionId: id }));
  }, []);

  const setStudentCount = useCallback((count: number) => {
    setState(prev => ({ ...prev, studentCount: count }));
  }, []);

  const resetRecording = useCallback(() => {
    setState(initialState);
  }, []);

  const value: RecordingContextValue = {
    state,
    setIsRecording,
    setRecordingStartTime,
    setRecordingDuration,
    setTranscriptBuffer,
    appendToTranscript,
    setAutoQuestionEnabled,
    setAutoQuestionInterval,
    setNextAutoQuestionIn,
    setSessionId,
    setStudentCount,
    resetRecording,
  };

  return (
    <RecordingContext.Provider value={value}>
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

// Optional hook that returns null if not in provider (for conditional use)
export function useOptionalRecordingContext() {
  return useContext(RecordingContext);
}
