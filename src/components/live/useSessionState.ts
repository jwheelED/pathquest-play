import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type SessionPhase = "listening" | "checkin" | "feedback" | "recap";
export type ImageStatus = "pending" | "ready" | "failed";
export type ImageKind = "illustration" | "diagram";

export interface LiveQuestion {
  id: string;
  question_content: {
    question: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
    type: string;
    language?: string;
    expectedAnswer?: string;
  };
  question_number: number;
  sent_at: string;
  image_url: string | null;
  image_status: ImageStatus;
  image_kind: ImageKind;
}

export interface SessionState {
  phase: SessionPhase;
  sessionId: string | null;
  sessionTitle: string;
  participantId: string | null;
  currentQuestion: LiveQuestion | null;
  selectedOption: string | null;
  confidence: number | null;
  timeLeft: number;
  totalDuration: number;
  lostMeSentAt: number | null;
  feedbackData: FeedbackData | null;
  roomStats: { inRoom: number; sameAnswerPct: number | null };
  recapData: RecapItem[];
}

export interface FeedbackData {
  wasCorrect: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  explanation: string;
  sameAnswerPct: number | null;
  aiGrade?: number | null;
  aiFeedback?: string | null;
}

export interface RecapItem {
  questionNumber: number;
  question: string;
  wasCorrect: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  confidence: number | null;
  changedMind: boolean;
}

const QUESTION_DURATION = 30;
const LOST_ME_DEBOUNCE_MS = 60_000;

export function useSessionState(sessionCode: string | undefined) {
  const [phase, setPhase] = useState<SessionPhase>("listening");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalDuration, setTotalDuration] = useState(QUESTION_DURATION);
  const [lostMeSentAt, setLostMeSentAt] = useState<number | null>(null);
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [roomStats, setRoomStats] = useState({ inRoom: 0, sameAnswerPct: null as number | null });
  const [recapData, setRecapData] = useState<RecapItem[]>([]);

  const answeredIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  const [notFound, setNotFound] = useState(false);

  // Resolve session
  useEffect(() => {
    if (!sessionCode) return;
    const stored = localStorage.getItem("participantId");
    if (stored) setParticipantId(stored);

    const init = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-live-session", {
          body: { sessionCode },
        });
        if (error || !data?.session) {
          setNotFound(true);
          return;
        }
        if (!data.session.is_active) {
          setPhase("recap");
          return;
        }
        setSessionId(data.session.id);
        setSessionTitle(data.session.title || "");
        if (data.questions?.length > 0) {
          handleNewQuestion(data.questions[0]);
        }
      } catch {
        setNotFound(true);
      }
    };
    init();
  }, [sessionCode]);

  const handleNewQuestion = useCallback((raw: Record<string, unknown>) => {
    const q = normalizeQuestion(raw);
    if (!q || answeredIdsRef.current.has(q.id)) return;
    setCurrentQuestion(q);
    setSelectedOption(null);
    setConfidence(null);
    setFeedbackData(null);
    setPhase("checkin");
    setTotalDuration(QUESTION_DURATION);
    setTimeLeft(QUESTION_DURATION);
  }, []);

  // Realtime: new questions (INSERT) + image updates (UPDATE) + session end
  useEffect(() => {
    if (!sessionId) return;

    const questionChannel = supabase
      .channel(`live-q-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_questions", filter: `session_id=eq.${sessionId}` },
        (payload) => handleNewQuestion(payload.new as Record<string, unknown>),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_questions", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setCurrentQuestion((prev) => {
            if (!prev || prev.id !== updated.id) return prev;
            return {
              ...prev,
              image_url: (updated.image_url as string) ?? prev.image_url,
              image_status: (updated.image_status as ImageStatus) ?? prev.image_status,
            };
          });
        },
      )
      .subscribe();

    const sessionChannel = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (updated.is_active === false) {
            setPhase("recap");
          }
        },
      )
      .subscribe();

    channelsRef.current = [questionChannel, sessionChannel];

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [sessionId, handleNewQuestion]);

  // Timer countdown
  useEffect(() => {
    if (phase !== "checkin" || timeLeft <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, timeLeft]);

  // Auto-submit on timer expiry
  useEffect(() => {
    if (phase === "checkin" && timeLeft === 0 && currentQuestion && !answeredIdsRef.current.has(currentQuestion.id)) {
      submitAnswer();
    }
  }, [timeLeft, phase]);

  // Fallback polling
  useEffect(() => {
    if (!sessionId || !sessionCode) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("resolve-live-session", {
          body: { sessionCode },
        });
        if (data?.questions?.length > 0) {
          handleNewQuestion(data.questions[0] as Record<string, unknown>);
        }
        if (data?.session && !data.session.is_active) {
          setPhase("recap");
        }
      } catch {
        // silent
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [sessionId, sessionCode, handleNewQuestion]);

  const selectOption = useCallback((opt: string) => {
    if (phase !== "checkin") return;
    setSelectedOption(opt);
  }, [phase]);

  const selectConfidence = useCallback((c: number) => {
    setConfidence(c);
  }, []);

  const submitAnswer = useCallback(async () => {
    if (!currentQuestion || !participantId) return;
    answeredIdsRef.current.add(currentQuestion.id);

    const answer = selectedOption || "";
    let correct = currentQuestion.question_content.correctAnswer || "";
    const isMcq = (currentQuestion.question_content.options?.length ?? 0) > 0;
    let wasCorrect: boolean | null = isMcq && correct
      ? answer.charAt(0).toUpperCase() === correct.charAt(0).toUpperCase()
      : null;

    let aiGrade: number | null = null;
    let aiFeedback: string | null = null;
    // Grade + save server-side (points, confidence multiplier, gradebook sync).
    try {
      const { data } = await supabase.functions.invoke("submit-live-response", {
        body: {
          questionId: currentQuestion.id,
          participantId,
          answer,
          confidenceLevel: confidence === null ? null : String(confidence),
          responseTimeMs: (totalDuration - timeLeft) * 1000,
        },
      });
      const resp = data?.response as
        | { isCorrect?: boolean; correctAnswer?: string; aiGrade?: number | null; aiFeedback?: string | null }
        | undefined;
      aiGrade = resp?.aiGrade ?? null;
      aiFeedback = resp?.aiFeedback ?? null;
      if (resp && typeof resp.isCorrect === "boolean") wasCorrect = resp.isCorrect;
      if (resp?.correctAnswer) correct = resp.correctAnswer;
    } catch {
      // best effort
    }

    setFeedbackData({
      wasCorrect: wasCorrect ?? false,
      selectedAnswer: answer,
      correctAnswer: correct || "",
      explanation: currentQuestion.question_content.explanation || "",
      sameAnswerPct: null,
      aiGrade,
      aiFeedback,
    });

    setRecapData((prev) => [
      ...prev,
      {
        questionNumber: currentQuestion.question_number,
        question: currentQuestion.question_content.question,
        wasCorrect: wasCorrect ?? false,
        selectedAnswer: answer,
        correctAnswer: correct || "",
        confidence,
        changedMind: false,
      },
    ]);

    setPhase("feedback");
  }, [currentQuestion, participantId, selectedOption, confidence, totalDuration, timeLeft]);

  const dismissFeedback = useCallback(() => {
    setPhase("listening");
    setCurrentQuestion(null);
    setFeedbackData(null);
  }, []);

  const sendLostMe = useCallback(async () => {
    if (!sessionId || !participantId) return;
    const now = Date.now();
    if (lostMeSentAt && now - lostMeSentAt < LOST_ME_DEBOUNCE_MS) return;

    setLostMeSentAt(now);
    try {
      await supabase.from("live_confusion_signals").insert({
        session_id: sessionId,
        participant_id: participantId,
      });
    } catch {
      // best effort
    }
  }, [sessionId, participantId, lostMeSentAt]);

  return {
    phase,
    notFound,
    sessionId,
    sessionTitle,
    participantId,
    currentQuestion,
    selectedOption,
    confidence,
    timeLeft,
    totalDuration,
    lostMeSentAt,
    feedbackData,
    roomStats,
    recapData,
    selectOption,
    selectConfidence,
    submitAnswer,
    dismissFeedback,
    sendLostMe,
  };
}

function normalizeQuestion(raw: Record<string, unknown>): LiveQuestion | null {
  if (!raw.id || !raw.question_content) return null;
  let qc = raw.question_content as Record<string, unknown>;
  if (qc.questions && Array.isArray(qc.questions) && qc.questions.length > 0) {
    const inner = qc.questions[0] as Record<string, unknown>;
    qc = {
      question: inner.question || inner.title || "",
      options: inner.options || [],
      correctAnswer: inner.correctAnswer || "",
      type: inner.type || "short_answer",
      language: inner.language,
      explanation: inner.explanation || "",
      expectedAnswer: inner.expectedAnswer || "",
    };
  }
  return {
    id: raw.id as string,
    question_content: qc as LiveQuestion["question_content"],
    question_number: (raw.question_number as number) || 1,
    sent_at: (raw.sent_at as string) || new Date().toISOString(),
    image_url: (raw.image_url as string) || null,
    image_status: (raw.image_status as ImageStatus) || "pending",
    image_kind: (raw.image_kind as ImageKind) || "illustration",
  };
}
