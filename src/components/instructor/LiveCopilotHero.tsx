import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Mic,
  MicOff,
  Sparkles,
  Send,
  Eye,
  Pause,
  Play,
  Pencil,
  Check,
  Loader2,
  Monitor,
  BarChart2,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { PassiveQuestionCandidate } from "@/hooks/usePassiveQuestionDetection";
import { useNavigate } from "react-router-dom";

// ─── Types ──────────────────────────────────────────────────────────────────

type QuestionType = "mcq" | "short_answer" | "poll";

interface SentQuestionStats {
  responded: number;
  total: number;
  correctPercent: number;
  mostWrong?: string;
  responseSpeed?: "fast" | "moderate" | "slow";
}

interface SentQuestion {
  text: string;
  type: QuestionType;
  stats?: SentQuestionStats;
}

interface MCQOption {
  label: string;
  text: string;
  isCorrect: boolean;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface LiveCopilotHeroProps {
  isListening: boolean;
  autoQuestionEnabled: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleAutoQuestion: (enabled: boolean) => void;
  participantCount?: number;
  transcriptChunks?: string[];
  currentTranscript?: string;
  questionCandidate?: PassiveQuestionCandidate | null;
  isSendingQuestion?: boolean;
  onSendQuestion?: (text: string, type?: QuestionType, options?: string[], correctAnswer?: string, expectedAnswer?: string) => void;
  onPreviewQuestion?: (text: string) => void;
  onDismissQuestion?: () => void;
  isQuestionHeld?: boolean;
  onToggleQuestionHold?: () => void;
  sentQuestion?: SentQuestion | null;
  onViewLiveResponses?: () => void;
  onSendFollowUp?: () => void;
  formatPreference?: 'multiple_choice' | 'short_answer' | 'poll';
}

// ─── Default MCQ options ─────────────────────────────────────────────────────

const DEFAULT_MCQ: MCQOption[] = [
  { label: "A", text: "154", isCorrect: false },
  { label: "B", text: "206", isCorrect: true },
  { label: "C", text: "270", isCorrect: false },
  { label: "D", text: "300", isCorrect: false },
];

const DEFAULT_POLL: MCQOption[] = [
  { label: "A", text: "Very excited", isCorrect: false },
  { label: "B", text: "Somewhat", isCorrect: false },
  { label: "C", text: "Neutral", isCorrect: false },
  { label: "D", text: "Not really", isCorrect: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimer(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

const FLOW_STEPS = ["Listening", "Drafting", "Review", "Send", "Room Signal"] as const;

function getActiveStep(
  hasQuestion: boolean,
  isModalOpen: boolean,
  isSent: boolean
): number {
  if (isSent) return 3; // "Send" step lit, Room Signal next
  if (isModalOpen) return 2; // "Review"
  if (hasQuestion) return 1; // "Drafting" done, Review is next
  return 0; // "Listening"
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  open,
  onClose,
  onSend,
  initialText,
  transcriptSource,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (text: string, type: QuestionType, options: string[], correctAnswer: string, expectedAnswer: string) => void;
  initialText: string;
  transcriptSource?: string;
}) {
  const [qType, setQType] = useState<QuestionType>("mcq");
  const [questionText, setQuestionText] = useState(initialText);
  const [mcqOptions, setMcqOptions] = useState<MCQOption[]>(DEFAULT_MCQ);
  const [shortAnswer, setShortAnswer] = useState("");
  const [pollOptions, setPollOptions] = useState<MCQOption[]>(DEFAULT_POLL);
  const [isLoading, setIsLoading] = useState(false);

  const typeLabels: Record<QuestionType, string> = {
    mcq: "Multiple Choice",
    short_answer: "Short Answer",
    poll: "Poll",
  };

  const questionLabel: Record<QuestionType, string> = {
    mcq: "Multiple Choice Question",
    short_answer: "Short Answer Question",
    poll: "Poll Question",
  };

  const fetchMcqOptions = async (text: string, transcript: string | undefined) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-mcq-options", {
        body: { question_text: text, source_transcript: transcript ?? "" },
      });
      if (!error && data?.options && Array.isArray(data.options)) {
        const labels = ["A", "B", "C", "D"];
        const correctLetter: string = data.correct_answer ?? "A";
        const parsed: MCQOption[] = (data.options as string[]).slice(0, 4).map((opt, i) => {
          const stripped = opt.replace(/^[A-D]\.\s*/i, "");
          return { label: labels[i] ?? String.fromCharCode(65 + i), text: stripped, isCorrect: labels[i] === correctLetter };
        });
        return parsed;
      }
    } catch (_e) {
      // fall through to defaults
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  const fetchExpectedAnswer = async (text: string, transcript: string | undefined) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-expected-answer", {
        body: { question_text: text, source_transcript: transcript ?? "" },
      });
      if (!error && data?.expected_answer) {
        return data.expected_answer as string;
      }
    } catch (_e) {
      // fall through
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  // Reset state when modal opens and trigger fetch
  useEffect(() => {
    if (!open) return;
    setQuestionText(initialText);
    setMcqOptions(DEFAULT_MCQ);
    setShortAnswer("");
    setPollOptions(DEFAULT_POLL);
    setQType("mcq");

    // Trigger fetch for default type (mcq)
    fetchMcqOptions(initialText, transcriptSource).then((opts) => {
      if (opts) setMcqOptions(opts);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch when type changes
  useEffect(() => {
    if (!open) return;
    if (qType === "mcq") {
      fetchMcqOptions(questionText, transcriptSource).then((opts) => {
        if (opts) setMcqOptions(opts);
      });
    } else if (qType === "poll") {
      fetchMcqOptions(questionText, transcriptSource).then((opts) => {
        if (opts) setPollOptions(opts.map((o) => ({ ...o, isCorrect: false })));
      });
    } else if (qType === "short_answer") {
      fetchExpectedAnswer(questionText, transcriptSource).then((ans) => {
        if (ans) setShortAnswer(ans);
      });
    }
  }, [qType]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCorrect = (idx: number) => {
    setMcqOptions((prev) =>
      prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
    );
  };

  const updateMcqText = (idx: number, text: string) => {
    setMcqOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, text } : o))
    );
  };

  const updatePollText = (idx: number, text: string) => {
    setPollOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, text } : o))
    );
  };

  const handleRegenerateMcq = () => {
    fetchMcqOptions(questionText, transcriptSource).then((opts) => {
      if (opts) setMcqOptions(opts);
    });
  };

  const handleRegeneratePoll = () => {
    fetchMcqOptions(questionText, transcriptSource).then((opts) => {
      if (opts) setPollOptions(opts.map((o) => ({ ...o, isCorrect: false })));
    });
  };

  const handleRegenerateShortAnswer = () => {
    fetchExpectedAnswer(questionText, transcriptSource).then((ans) => {
      if (ans) setShortAnswer(ans);
    });
  };

  const handleSend = () => {
    if (qType === "mcq") {
      const correctOpt = mcqOptions.find((o) => o.isCorrect);
      const correctAnswer = correctOpt ? correctOpt.label : "";
      const options = mcqOptions.map((o) => `${o.label}. ${o.text}`);
      onSend(questionText, qType, options, correctAnswer, "");
    } else if (qType === "poll") {
      const options = pollOptions.map((o) => `${o.label}. ${o.text}`);
      onSend(questionText, qType, options, "", "");
    } else {
      onSend(questionText, qType, [], "", shortAnswer);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border border-neutral-200 shadow-xl bg-white">
        {/* Modal header */}
        <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-[#1a1a1a]">
              Review Audience Check
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-500 mt-0.5">
              Refine before sending to the room.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Source */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 block mb-1.5">
              From lecture transcript
            </span>
            <div className="px-3.5 py-2.5 bg-neutral-50 border border-neutral-100 rounded-xl">
              <p className="text-xs text-neutral-600 italic leading-relaxed">
                {transcriptSource
                  ? `\u201c${transcriptSource}\u201d`
                  : "No transcript context captured yet."}
              </p>
            </div>
          </div>

          {/* Type selector */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 block mb-2">
              Question Type
            </span>
            <div className="flex gap-1.5">
              {(["short_answer", "mcq", "poll"] as QuestionType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setQType(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                    qType === t
                      ? "bg-[#1a1a1a] text-white border-transparent"
                      : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                  )}
                >
                  {typeLabels[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Question text */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 block mb-1.5">
              {questionLabel[qType]}
            </span>
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="min-h-[72px] text-sm border-neutral-200 rounded-xl resize-none"
            />
          </div>

          {/* Type-specific section */}
          {qType === "mcq" && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  Answer Options
                </span>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                Edit the generated options below and select the correct answer.
              </p>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {mcqOptions.map((opt, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all",
                        opt.isCorrect
                          ? "border-emerald-300 bg-emerald-50/60"
                          : "border-neutral-200 bg-white"
                      )}
                    >
                      <button
                        onClick={() => setCorrect(i)}
                        className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                          opt.isCorrect
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-neutral-300"
                        )}
                      >
                        {opt.isCorrect && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </button>
                      <span className="text-xs font-semibold text-neutral-400 w-4 shrink-0">
                        {opt.label}.
                      </span>
                      <Input
                        value={opt.text}
                        onChange={(e) => updateMcqText(i, e.target.value)}
                        className="h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 text-[#1a1a1a] flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={handleRegenerateMcq}
                className="mt-2 h-7 px-2 text-xs text-neutral-400 hover:text-neutral-600 gap-1.5"
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                Regenerate options
              </Button>
              <p className="text-[11px] text-neutral-400 mt-1">
                Responses will be graded against the selected correct answer.
              </p>
            </div>
          )}

          {qType === "short_answer" && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 block mb-1.5">
                Expected Answer{" "}
                <span className="normal-case text-neutral-300 font-normal">
                  (for grading reference)
                </span>
              </span>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : (
                <Textarea
                  value={shortAnswer}
                  onChange={(e) => setShortAnswer(e.target.value)}
                  className="min-h-[56px] text-sm border-neutral-200 rounded-xl resize-none"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={handleRegenerateShortAnswer}
                className="mt-2 h-7 px-2 text-xs text-neutral-400 hover:text-neutral-600 gap-1.5"
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                Regenerate expected answer
              </Button>
              <p className="text-[11px] text-neutral-400 mt-1">
                This will be used as a reference when grading student responses.
              </p>
            </div>
          )}

          {qType === "poll" && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  Poll Choices
                </span>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                Edit the poll choices below. Poll responses are recorded but not
                graded.
              </p>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-neutral-200 bg-white"
                    >
                      <span className="text-xs font-semibold text-neutral-400 w-4 shrink-0">
                        {opt.label}.
                      </span>
                      <Input
                        value={opt.text}
                        onChange={(e) => updatePollText(i, e.target.value)}
                        className="h-7 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 text-[#1a1a1a] flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={handleRegeneratePoll}
                className="mt-2 h-7 px-2 text-xs text-neutral-400 hover:text-neutral-600 gap-1.5"
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                Regenerate choices
              </Button>
              <p className="text-[11px] text-neutral-400 mt-1">
                Poll responses are recorded but not graded.
              </p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/60">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full h-8 px-4 text-xs text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            className="rounded-full h-8 px-5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Send className="w-3 h-3" />
            Send to Room
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Live Flow Strip ──────────────────────────────────────────────────────────

function LiveFlowStrip({
  activeStep,
}: {
  activeStep: number;
}) {
  return (
    <div className="px-4 py-3 bg-white border border-neutral-100 rounded-xl">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400 block mb-2">
        Live Flow
      </span>
      <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
        {FLOW_STEPS.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          return (
            <div key={step} className="flex items-center gap-0.5 min-w-0">
              <span
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap px-2 py-0.5 rounded-full transition-all",
                  isActive
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : isDone
                    ? "text-neutral-400 line-through"
                    : "text-neutral-300"
                )}
              >
                {step}
              </span>
              {i < FLOW_STEPS.length - 1 && (
                <ChevronRight className="w-2.5 h-2.5 text-neutral-200 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Transcript Confidence Strip ─────────────────────────────────────────────

function TranscriptStrip({
  lastChunk,
  hasLive,
  chunkCount,
}: {
  lastChunk: string | null;
  hasLive: boolean;
  chunkCount: number;
}) {
  return (
    <div className="px-4 py-3 bg-white border border-neutral-100 rounded-xl">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400 block mb-1.5">
        Last chunk heard
      </span>
      {lastChunk ? (
        <>
          <p className="text-xs text-neutral-600 leading-relaxed">
            &ldquo;{lastChunk}&rdquo;
            {hasLive && (
              <span className="inline-block w-[2px] h-3 bg-emerald-500 ml-0.5 animate-pulse align-middle rounded-sm" />
            )}
          </p>
          <p className="text-[10px] text-neutral-300 mt-1">
            captured just now · {chunkCount} chunk{chunkCount !== 1 ? "s" : ""}{" "}
            processed
          </p>
        </>
      ) : (
        <p className="text-xs text-neutral-400 italic">
          Speak naturally — your words will appear here...
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiveCopilotHero({
  isListening,
  autoQuestionEnabled,
  onStartListening,
  onStopListening,
  onToggleAutoQuestion,
  participantCount = 0,
  transcriptChunks = [],
  currentTranscript = "",
  questionCandidate = null,
  isSendingQuestion = false,
  onSendQuestion,
  onPreviewQuestion,
  onDismissQuestion,
  isQuestionHeld = false,
  onToggleQuestionHold,
  sentQuestion = null,
  onViewLiveResponses,
  onSendFollowUp,
}: LiveCopilotHeroProps) {
  const navigate = useNavigate();
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editText, setEditText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Timer
  useEffect(() => {
    if (!isListening) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isListening]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current && isListening) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptChunks, currentTranscript, isListening]);

  // Accumulate question candidates into local history
  useEffect(() => {
    if (!questionCandidate?.text) return;
    setQuestionHistory((prev) => {
      if (prev.includes(questionCandidate.text)) return prev;
      const next = [...prev, questionCandidate.text];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [questionCandidate]);

  // Reset history when listening stops
  useEffect(() => {
    if (!isListening) {
      setQuestionHistory([]);
      setHistoryIndex(-1);
    }
  }, [isListening]);

  const displayedQuestion =
    historyIndex >= 0 && questionHistory.length > 0
      ? questionHistory[historyIndex]
      : null;
  const hasQuestion = displayedQuestion !== null;
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < questionHistory.length - 1;

  const handleStartEdit = () => {
    if (displayedQuestion) {
      setEditText(displayedQuestion);
      setIsEditingQuestion(true);
    }
  };

  const handleSaveEdit = () => {
    setIsEditingQuestion(false);
    if (editText.trim() && onSendQuestion) {
      // Replace current history entry with edited text
      setQuestionHistory((prev) =>
        prev.map((q, i) => (i === historyIndex ? editText.trim() : q))
      );
      onSendQuestion(editText.trim());
    }
  };

  const handleSendCurrent = () => {
    if (!displayedQuestion || !onSendQuestion) return;
    onSendQuestion(displayedQuestion);
    // Remove sent item from history
    setQuestionHistory((prev) => {
      const next = prev.filter((_, i) => i !== historyIndex);
      setHistoryIndex(Math.max(0, Math.min(historyIndex, next.length - 1)));
      return next;
    });
    if (historyIndex === questionHistory.length - 1) {
      onDismissQuestion?.();
    }
  };

  const handleModalSend = (text: string, type: QuestionType, options: string[], correctAnswer: string, expectedAnswer: string) => {
    setIsModalOpen(false);
    onSendQuestion?.(text, type, options, correctAnswer, expectedAnswer);
  };

  const isSent = !!sentQuestion;
  const lastChunk =
    currentTranscript || transcriptChunks[transcriptChunks.length - 1] || null;
  const activeStep = getActiveStep(hasQuestion, isModalOpen, isSent);

  // ── IDLE STATE ────────────────────────────────────────────────────────────
  if (!isListening) {
    return (
      <div className="command-hero overflow-hidden">
        <div className="p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="section-eyebrow">Live Copilot</span>
          </div>
          <h1 className="text-2xl lg:text-[1.75rem] font-semibold text-charcoal tracking-tight mb-3">
            Ready to listen for your next live question
          </h1>
          <p className="text-sm text-charcoal-muted leading-relaxed mb-6 max-w-xl">
            Edvana listens while you teach and prepares send-ready understanding
            checks in real time, so you can respond to the room without breaking
            flow.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <Button
              onClick={onStartListening}
              className={cn(
                "rounded-full px-7 h-12 gap-2.5 font-medium text-base",
                "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
                "transition-all duration-200 hover:shadow-md"
              )}
            >
              <Mic className="w-5 h-5" />
              Start Listening
            </Button>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-full border border-slate-100">
              <Sparkles className="w-4 h-4 text-charcoal-subtle" />
              <span className="text-sm font-medium text-charcoal">
                Auto-question mode
              </span>
              <Switch
                checked={autoQuestionEnabled}
                onCheckedChange={onToggleAutoQuestion}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
          </div>
          <p className="text-xs text-charcoal-subtle">
            You review every check-in before anything is sent.
          </p>
        </div>
      </div>
    );
  }

  // ── ACTIVE LISTENING STATE ────────────────────────────────────────────────
  return (
    <>
      <ReviewModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSend={handleModalSend}
        initialText={displayedQuestion ?? ""}
        transcriptSource={lastChunk ?? undefined}
      />

      <div className="space-y-3">
        {/* ── Control Bar ──────────────────────────────────────────────────── */}
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
          <div
            className={cn(
              "h-0.5 bg-gradient-to-r",
              isSent
                ? "from-teal-500 via-emerald-400 to-emerald-500"
                : "from-emerald-500 via-emerald-400 to-teal-400"
            )}
          />
          <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Left */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-sm font-semibold text-[#1a1a1a]">
                  {isSent
                    ? "Audience check is live"
                    : "Live Copilot is listening"}
                </span>
              </div>
              <p className="text-xs text-neutral-500 ml-3.5">
                {isSent
                  ? "Waiting for room responses while Edvana keeps listening."
                  : `Transcription active · Detection running · ${participantCount} participants connected`}
              </p>
              {!isSent && (
                <div className="flex flex-wrap gap-1.5 mt-2.5 ml-3.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-medium text-emerald-700">
                    <Mic className="w-2.5 h-2.5" />
                    Mic active
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-medium",
                      autoQuestionEnabled
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-neutral-100 border-neutral-200 text-neutral-500"
                    )}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Auto-question {autoQuestionEnabled ? "enabled" : "off"}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-neutral-100 border border-neutral-200 text-[10px] font-medium text-neutral-600">
                    Next question:{" "}
                    {hasQuestion
                      ? questionHistory.length > 1
                        ? `${questionHistory.length} queued`
                        : "ready"
                      : "listening"}
                  </span>
                </div>
              )}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <span className="font-mono text-sm font-medium text-neutral-400 tabular-nums min-w-[3rem] text-right">
                {formatTimer(elapsedSeconds)}
              </span>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-full border border-neutral-200">
                <Sparkles className="w-3 h-3 text-neutral-400" />
                <span className="text-[11px] font-medium text-neutral-600 hidden sm:inline">
                  Auto-question
                </span>
                <Switch
                  checked={autoQuestionEnabled}
                  onCheckedChange={onToggleAutoQuestion}
                  className="data-[state=checked]:bg-emerald-600 scale-[0.85]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/instructor/presenter")}
                className="rounded-full h-8 px-3 gap-1.5 text-xs font-medium border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              >
                <Monitor className="w-3 h-3" />
                <span className="hidden sm:inline">Presenter</span>
              </Button>
              <Button
                onClick={onStopListening}
                size="sm"
                className="rounded-full h-8 px-4 gap-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              >
                <MicOff className="w-3.5 h-3.5" />
                Stop Listening
              </Button>
            </div>
          </div>
        </div>

        {/* ── Main Card ────────────────────────────────────────────────────── */}

        {/* SENT STATE */}
        {isSent && sentQuestion && (
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-teal-500 to-emerald-400" />
            <div className="px-6 pt-5 pb-5">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-base font-semibold text-[#1a1a1a]">
                    Current Live Check
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Collecting responses from your room
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-[10px] font-semibold text-teal-700">
                  <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              </div>
              <div className="h-px bg-neutral-100 my-4" />
              <p className="text-sm text-[#1a1a1a] leading-relaxed mb-5">
                &ldquo;{sentQuestion.text}&rdquo;
              </p>

              {/* Response stats */}
              {sentQuestion.stats && (
                <div className="mb-4">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400 block mb-2">
                    Room Signal
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      {
                        label: "Responded",
                        value: `${sentQuestion.stats.responded} / ${sentQuestion.stats.total}`,
                      },
                      {
                        label: "Correct so far",
                        value: `${sentQuestion.stats.correctPercent}%`,
                        highlight: true,
                      },
                      ...(sentQuestion.stats.mostWrong
                        ? [
                            {
                              label: "Most wrong",
                              value: sentQuestion.stats.mostWrong,
                            },
                          ]
                        : []),
                      ...(sentQuestion.stats.responseSpeed
                        ? [
                            {
                              label: "Speed",
                              value: sentQuestion.stats.responseSpeed,
                            },
                          ]
                        : []),
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="px-3 py-2 bg-neutral-50 border border-neutral-100 rounded-xl"
                      >
                        <p className="text-[10px] text-neutral-400 mb-0.5">
                          {stat.label}
                        </p>
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            stat.highlight
                              ? "text-emerald-600"
                              : "text-[#1a1a1a]"
                          )}
                        >
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewLiveResponses}
                  className="rounded-full h-8 px-3 gap-1.5 text-xs border-neutral-200 text-neutral-600"
                >
                  <BarChart2 className="w-3 h-3" />
                  View Live Responses
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onSendFollowUp}
                  className="rounded-full h-8 px-3 gap-1.5 text-xs text-neutral-500 hover:text-neutral-700"
                >
                  <ArrowRight className="w-3 h-3" />
                  Send Follow-Up
                </Button>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50/60 rounded-b-2xl">
              <p className="text-[11px] text-neutral-400">
                Edvana is still listening for your next teachable moment.
              </p>
            </div>
          </div>
        )}

        {/* DRAFT-READY STATE */}
        {!isSent && hasQuestion && !isEditingQuestion && (
          <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm overflow-hidden ring-1 ring-emerald-100">
            <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-400" />
            <div className="px-6 pt-5 pb-5">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-base font-semibold text-[#1a1a1a]">
                    Question on Deck
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Ready to send
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isQuestionHeld && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700">
                      Held
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 bg-white/70 rounded-full" />
                    READY
                  </span>
                </div>
              </div>
              <div className="h-px bg-neutral-100 my-4" />

              {/* Type pill + question */}
              <div className="flex items-start gap-3 mb-5">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200 text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">
                      MCQ
                    </span>
                    {questionHistory.length > 1 && (
                      <span className="text-[10px] text-neutral-400 tabular-nums">
                        {historyIndex + 1} of {questionHistory.length}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#1a1a1a] leading-relaxed font-medium">
                    &ldquo;{displayedQuestion}&rdquo;
                  </p>
                </div>
              </div>

              {/* Primary + secondary actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleSendCurrent}
                  className="rounded-full h-9 px-5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                  disabled={isSendingQuestion}
                >
                  {isSendingQuestion ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Now
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsModalOpen(true)}
                  className="rounded-full h-9 px-4 text-xs font-medium border-neutral-200 text-neutral-700 gap-1.5"
                  disabled={isSendingQuestion}
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </Button>

                {/* Tertiary: hold, edit, back/forward nav */}
                <div className="flex items-center gap-1 ml-auto">
                  {onToggleQuestionHold && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onToggleQuestionHold}
                      className="rounded-full h-8 w-8 p-0 text-neutral-400 hover:text-neutral-700"
                      title={isQuestionHeld ? "Resume" : "Hold"}
                    >
                      {isQuestionHeld ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleStartEdit}
                    className="rounded-full h-8 w-8 p-0 text-neutral-400 hover:text-neutral-700"
                    disabled={isSendingQuestion}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {questionHistory.length > 1 && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistoryIndex((i) => i - 1)}
                        disabled={!canGoBack}
                        className="rounded-full h-8 w-8 p-0 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                        title="Previous question"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistoryIndex((i) => i + 1)}
                        disabled={!canGoForward}
                        className="rounded-full h-8 w-8 p-0 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                        title="Next question"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-2.5 border-t border-emerald-100 bg-emerald-50/40 rounded-b-2xl">
              <p className="text-[11px] text-neutral-400">
                Drafted from your live speech. Review before sending if needed.
              </p>
            </div>
          </div>
        )}

        {/* EDITING STATE */}
        {!isSent && isEditingQuestion && (
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-5">
              <h2 className="text-base font-semibold text-[#1a1a1a] mb-1">
                Question on Deck
              </h2>
              <p className="text-xs text-neutral-500 mb-4">Editing</p>
              <div className="h-px bg-neutral-100 mb-4" />
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[60px] text-sm border-neutral-200 rounded-xl resize-none"
                placeholder="Edit the question..."
                autoFocus
              />
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  className="rounded-full h-8 px-4 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  disabled={!editText.trim()}
                >
                  <Check className="w-3 h-3" />
                  Send Edited
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingQuestion(false)}
                  className="rounded-full h-8 px-3 text-xs text-neutral-500"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* PASSIVE LISTENING STATE (no question) */}
        {!isSent && !hasQuestion && !isEditingQuestion && (
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-base font-semibold text-[#1a1a1a]">
                    Question on Deck
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Listening for your next live question...
                  </p>
                </div>
              </div>
              <div className="h-px bg-neutral-100 my-4" />
              <p className="text-sm text-neutral-600 leading-relaxed max-w-md">
                Edvana is actively listening and will prepare a send-ready
                audience check when a clear question moment is detected.
              </p>
              {/* Pulse */}
              <div className="flex justify-center my-8">
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute w-28 h-28 rounded-full border border-emerald-100/60 animate-ping"
                    style={{ animationDuration: "2.8s" }}
                  />
                  <div
                    className="absolute w-20 h-20 rounded-full border border-emerald-200/50 animate-ping"
                    style={{ animationDuration: "2s" }}
                  />
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50/60 rounded-b-2xl">
              <p className="text-[11px] text-neutral-400">
                Nothing is sent automatically. You stay in control.
              </p>
            </div>
          </div>
        )}

        {/* ── Supporting strips ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TranscriptStrip
            lastChunk={lastChunk}
            hasLive={!!currentTranscript}
            chunkCount={transcriptChunks.length}
          />
          <LiveFlowStrip activeStep={activeStep} />
        </div>
        <div ref={transcriptEndRef} />
      </div>
    </>
  );
}
