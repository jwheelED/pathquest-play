import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Mic, MicOff, Sparkles, Send, Eye, X, Pause, Play, Pencil, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import type { PassiveQuestionCandidate } from "@/hooks/usePassiveQuestionDetection";

interface LiveCopilotHeroProps {
  isListening: boolean;
  autoQuestionEnabled: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleAutoQuestion: (enabled: boolean) => void;
  // Transcription props
  transcriptChunks?: string[];
  currentTranscript?: string;
  // Question on deck props
  questionCandidate?: PassiveQuestionCandidate | null;
  isSendingQuestion?: boolean;
  onSendQuestion?: (text: string) => void;
  onPreviewQuestion?: (text: string) => void;
  onDismissQuestion?: () => void;
  isQuestionHeld?: boolean;
  onToggleQuestionHold?: () => void;
}

export function LiveCopilotHero({
  isListening,
  autoQuestionEnabled,
  onStartListening,
  onStopListening,
  onToggleAutoQuestion,
  transcriptChunks = [],
  currentTranscript = "",
  questionCandidate = null,
  isSendingQuestion = false,
  onSendQuestion,
  onPreviewQuestion,
  onDismissQuestion,
  isQuestionHeld = false,
  onToggleQuestionHold,
}: LiveCopilotHeroProps) {
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editText, setEditText] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current && isListening) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptChunks, currentTranscript, isListening]);

  const handleStartEdit = () => {
    if (questionCandidate) {
      setEditText(questionCandidate.text);
      setIsEditingQuestion(true);
    }
  };

  const handleSaveEdit = () => {
    setIsEditingQuestion(false);
    if (editText.trim() && onSendQuestion) {
      onSendQuestion(editText.trim());
    }
  };

  const hasQuestion = !!questionCandidate;

  return (
    <div className="command-hero overflow-hidden">
      {/* Top accent bar when listening */}
      {isListening && (
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 animate-pulse" />
      )}

      <div className="p-6 lg:p-8">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-3">
          <span className="section-eyebrow">Live Copilot</span>
          {isListening && (
            <span className="live-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              LISTENING
            </span>
          )}
        </div>

        {/* Headline */}
        <h1 className="text-2xl lg:text-[1.75rem] font-semibold text-charcoal tracking-tight mb-3">
          {isListening 
            ? "Listening to your lecture..." 
            : "Ready to listen for your next live question"
          }
        </h1>

        {/* Body */}
        <p className="text-sm text-charcoal-muted leading-relaxed mb-6 max-w-xl">
          {isListening
            ? "Edvana is analyzing your lecture in real time. Questions will appear when the copilot detects a teachable moment."
            : "Edvana listens while you teach and prepares send-ready understanding checks in real time, so you can respond to the room without breaking flow."
          }
        </p>

        {/* Actions row */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Primary CTA */}
          {isListening ? (
            <Button
              onClick={onStopListening}
              className={cn(
                "rounded-full px-7 h-12 gap-2.5 font-medium text-base",
                "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
                "transition-all duration-200 hover:shadow-md"
              )}
            >
              <MicOff className="w-5 h-5" />
              Stop Listening
            </Button>
          ) : (
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
          )}

          {/* Auto-question toggle */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-full border border-slate-100">
            <Sparkles className="w-4 h-4 text-charcoal-subtle" />
            <span className="text-sm font-medium text-charcoal">Auto-question mode</span>
            <Switch
              checked={autoQuestionEnabled}
              onCheckedChange={onToggleAutoQuestion}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>

        {/* Supporting micro-line */}
        <p className="text-xs text-charcoal-subtle mb-6">
          You review every check-in before anything is sent.
        </p>

        {/* ===== LISTENING STATE: Transcription + Question On Deck ===== */}
        {isListening && (
          <div className="space-y-5 pt-5 border-t border-slate-100">
            {/* Live Transcription Panel */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-emerald-500 rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.sin(i * 1.2) * 6}px`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium text-emerald-700">Actively listening</span>
              </div>
              
              {/* Transcript chunks */}
              <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-4 max-h-32 overflow-y-auto">
                {transcriptChunks.length === 0 && !currentTranscript ? (
                  <p className="text-sm text-charcoal-subtle italic">
                    Speak naturally — your words will appear here...
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {transcriptChunks.slice(-5).map((chunk, idx) => (
                      <p key={idx} className="text-sm text-charcoal-muted leading-relaxed">
                        {chunk}
                      </p>
                    ))}
                    {currentTranscript && (
                      <p className="text-sm text-charcoal leading-relaxed">
                        {currentTranscript}
                        <span className="inline-block w-1.5 h-4 bg-emerald-500 ml-0.5 animate-pulse" />
                      </p>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Question On Deck */}
            <div className={cn(
              "rounded-xl border p-4 transition-all duration-300",
              hasQuestion
                ? "bg-emerald-50/50 border-emerald-200"
                : "bg-slate-50/50 border-slate-100"
            )}>
              <div className="flex items-center gap-2 mb-3">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center",
                  hasQuestion ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-charcoal-subtle"
                )}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-charcoal">Question on Deck</h3>
                  <p className="text-xs text-charcoal-subtle">
                    {hasQuestion ? "Ready to send" : "Listening for your next question..."}
                  </p>
                </div>
                {hasQuestion && isQuestionHeld && (
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Held
                  </span>
                )}
              </div>

              {hasQuestion && !isEditingQuestion ? (
                <div className="space-y-3">
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <p className="text-sm text-charcoal leading-relaxed">
                      "{questionCandidate.text}"
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {onPreviewQuestion && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPreviewQuestion(questionCandidate.text)}
                        className="rounded-full h-8 px-3 text-xs gap-1.5 border-slate-200"
                        disabled={isSendingQuestion}
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </Button>
                    )}
                    {onSendQuestion && (
                      <Button
                        size="sm"
                        onClick={() => onSendQuestion(questionCandidate.text)}
                        className="rounded-full h-8 px-4 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 flex-1"
                        disabled={isSendingQuestion}
                      >
                        {isSendingQuestion ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3" />
                            Send Now
                          </>
                        )}
                      </Button>
                    )}
                    {onToggleQuestionHold && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onToggleQuestionHold}
                        className="rounded-full h-8 w-8 p-0 text-charcoal-muted hover:text-charcoal"
                      >
                        {isQuestionHeld ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleStartEdit}
                      className="rounded-full h-8 w-8 p-0 text-charcoal-muted hover:text-charcoal"
                      disabled={isSendingQuestion}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {onDismissQuestion && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onDismissQuestion}
                        className="rounded-full h-8 w-8 p-0 text-charcoal-muted hover:text-charcoal"
                        disabled={isSendingQuestion}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : isEditingQuestion ? (
                <div className="space-y-3">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="min-h-[60px] text-sm border-slate-200"
                    placeholder="Edit the question..."
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
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
                      className="rounded-full h-8 px-3 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs text-charcoal-subtle">
                    Edvana is listening and will autodraft your next audience check...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
