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
  /** null = no picture planned for this question */
  image_kind: ImageKind | null;
}

export interface SessionState {
  phase: SessionPhase;
  sessionId: string | null;
  sessionTitle: string;
  participantId: string | null;
  currentQuestion: LiveQuestion | null;
  selectedOption: string | null;
  confidence: number | null;
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
  questionId: string;
  imageUrl: string | null;
}

const LOST_ME_DEBOUNCE_MS = 60_000;

export function useSessionState(sessionCode: string | undefined) {
  const [phase, setPhase] = useState<SessionPhase>("listening");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [lostMeSentAt, setLostMeSentAt] = useState<number | null>(null);
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [roomStats, setRoomStats] = useState({ inRoom: 0, sameAnswerPct: null as number | null });
  const [recapData, setRecapData] = useState<RecapItem[]>([]);

  const answeredIdsRef = useRef<Set<string>>(new Set());
  const pendingQuestionsRef = useRef<LiveQuestion[]>([]);
  const showingQuestionRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const initialQuestionNumberRef = useRef(0);
  const questionOpenedAtRef = useRef(0);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  const [notFound, setNotFound] = useState(false);
  const [needsJoin, setNeedsJoin] = useState(false);

  // Resolve session
  useEffect(() => {
    if (!sessionCode) return;
    // Participant ids are scoped per session; the legacy global key is a
    // fallback for guests who joined via the code form.
    const stored =
      localStorage.getItem(`participantId:${sessionCode}`) ||
      localStorage.getItem("participantId");
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
          sessionEndedRef.current = true;
          setPhase("recap");
          return;
        }
        setSessionId(data.session.id);
        setSessionTitle(data.session.title || "");

        // Signed-in student without a participant yet: auto-join so their
        // answers link to their account history. Guests must join via code.
        if (!stored) {
          const { data: authData } = await supabase.auth.getSession();
          if (authData.session) {
            const { data: joinData, error: joinError } = await supabase.functions.invoke(
              "join-live-session",
              { body: { sessionCode } },
            );
            if (!joinError && joinData?.participant?.id) {
              localStorage.setItem(`participantId:${sessionCode}`, joinData.participant.id);
              localStorage.setItem("participantId", joinData.participant.id);
              localStorage.setItem("participantNickname", joinData.participant.nickname);
              setParticipantId(joinData.participant.id);
            } else {
              setNeedsJoin(true);
              return;
            }
          } else {
            setNeedsJoin(true);
            return;
          }
        }

        if (data.questions?.length > 0) {
          initialQuestionNumberRef.current = Number(data.questions[0].question_number) || 0;
          handleNewQuestion(data.questions[0]);
        }
      } catch {
        setNotFound(true);
      }
    };
    init();
  }, [sessionCode]);

  const currentQuestionIdRef = useRef<string | null>(null);

  const showQuestion = useCallback((q: LiveQuestion) => {
    showingQuestionRef.current = true;
    currentQuestionIdRef.current = q.id;
    setCurrentQuestion(q);
    setSelectedOption(null);
    setConfidence(null);
    setFeedbackData(null);
    setPhase("checkin");
    questionOpenedAtRef.current = Date.now();
  }, []);

  const handleNewQuestion = useCallback((raw: Record<string, unknown>) => {
    const q = normalizeQuestion(raw);
    if (!q) return;
    // Same question again (fallback poll): only refresh its picture — never
    // reset the participant's choice or confidence. This must also run
    // after answering, since the answer picture is shown on the feedback card.
    if (currentQuestionIdRef.current === q.id) {
      if (q.image_status === "ready" && q.image_url) {
        const url = q.image_url;
        setRecapData((items) =>
          items.some((i) => i.questionId === q.id && i.imageUrl !== url)
            ? items.map((i) => (i.questionId === q.id ? { ...i, imageUrl: url } : i))
            : items,
        );
      }
      setCurrentQuestion((prev) => {
        if (!prev || prev.id !== q.id) return prev;
        if (
          prev.image_url === q.image_url &&
          prev.image_status === q.image_status &&
          prev.image_kind === q.image_kind
        ) return prev;
        return { ...prev, image_url: q.image_url, image_status: q.image_status, image_kind: q.image_kind };
      });
      return;
    }
    if (answeredIdsRef.current.has(q.id)) return;
    if (sessionEndedRef.current) return;
    // Do not replay questions from before this participant opened the room.
    if (q.question_number < initialQuestionNumberRef.current) return;
    if (showingQuestionRef.current) {
      const pending = pendingQuestionsRef.current;
      const existing = pending.findIndex((item) => item.id === q.id);
      if (existing >= 0) pending[existing] = q;
      else pending.push(q);
      pending.sort((a, b) => a.question_number - b.question_number);
      return;
    }
    showQuestion(q);
  }, [showQuestion]);

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
          if (updated.image_status === "ready" && typeof updated.image_url === "string") {
            const url = updated.image_url;
            setRecapData((items) =>
              items.some((i) => i.questionId === updated.id && i.imageUrl !== url)
                ? items.map((i) => (i.questionId === updated.id ? { ...i, imageUrl: url } : i))
                : items,
            );
          }
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
            sessionEndedRef.current = true;
            pendingQuestionsRef.current = [];
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

  // Guest delivery relies on polling, not authenticated Realtime. Recover
  // every newer row, in order, even when several arrived between polls.
  useEffect(() => {
    if (!sessionId || !sessionCode) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || cancelled || sessionEndedRef.current) return;
      inFlight = true;
      try {
        const { data, error } = await supabase.functions.invoke("resolve-live-session", {
          body: { sessionCode },
        });
        if (cancelled || error) return;
        if (data?.session && !data.session.is_active) {
          sessionEndedRef.current = true;
          pendingQuestionsRef.current = [];
          setPhase("recap");
          return;
        }
        if (Array.isArray(data?.questions)) {
          const questions = data.questions as Record<string, unknown>[];
          questions.slice().sort((a, b) => Number(a.question_number) - Number(b.question_number))
            .forEach(handleNewQuestion);
        }
      } catch {
        // The next poll or foreground event retries transient network errors.
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    const interval = setInterval(poll, 3_000);
    window.addEventListener("online", poll);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", poll);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, sessionCode, handleNewQuestion]);

  const selectOption = useCallback((opt: string) => {
    if (phase !== "checkin") return;
    setSelectedOption(opt);
  }, [phase]);

  const selectConfidence = useCallback((c: number) => {
    setConfidence(c);
  }, []);

  const submitAnswer = useCallback(async () => {
    if (!currentQuestion || !participantId || answeredIdsRef.current.has(currentQuestion.id)) return;
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
          responseTimeMs: Math.max(0, Date.now() - questionOpenedAtRef.current),
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
        questionId: currentQuestion.id,
        imageUrl: currentQuestion.image_status === "ready" ? currentQuestion.image_url : null,
      },
    ]);

    if (!sessionEndedRef.current) setPhase("feedback");
  }, [currentQuestion, participantId, selectedOption, confidence]);

  const dismissFeedback = useCallback(() => {
    if (sessionEndedRef.current) return;
    const next = pendingQuestionsRef.current.shift();
    if (next) {
      showQuestion(next);
      return;
    }
    showingQuestionRef.current = false;
    setPhase("listening");
    setCurrentQuestion(null);
    setFeedbackData(null);
  }, [showQuestion]);

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
    needsJoin,
    sessionId,
    sessionTitle,
    participantId,
    currentQuestion,
    selectedOption,
    confidence,
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
    image_status: (raw.image_status as ImageStatus) || (raw.image_url ? "ready" : "pending"),
    image_kind: raw.image_kind === "diagram" || raw.image_kind === "illustration"
      ? (raw.image_kind as ImageKind)
      : null,
  };
}
