import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  Send,
  Pause,
  Play,
  Pencil,
  Loader2,
  Radio,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ListChecks,
  MessageSquare,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { PassiveQuestionCandidate } from '@/hooks/usePassiveQuestionDetection';

export interface OnDeckSendData {
  options?: string[];
  correctAnswer?: 'A' | 'B' | 'C' | 'D';
  expectedAnswer?: string;
  type: 'multiple_choice' | 'short_answer' | 'poll';
  sourceBankItemId?: string;
}

interface QuestionOnDeckProps {
  candidate: PassiveQuestionCandidate | null;
  candidateHistory: PassiveQuestionCandidate[];
  isListening: boolean;
  isSending: boolean;
  onSendNow: (questionText: string, data?: OnDeckSendData) => void;
  onPreview: (questionText: string) => void;
  onDismiss: () => void;
  onRemoveFromHistory: (id: string) => void;
  isHeld: boolean;
  onToggleHold: () => void;
  suggestedType?: 'multiple_choice' | 'short_answer' | 'poll';
  formatPreference?: 'multiple_choice' | 'short_answer' | 'poll';
  transcriptContext?: string;
  courseId?: string | null;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function HistoryItem({
  item,
  onSend,
  onRemove,
  isSending,
}: {
  item: PassiveQuestionCandidate;
  onSend: (text: string) => void;
  onRemove: (id: string) => void;
  isSending: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-foreground leading-relaxed flex-1 line-clamp-2">
          "{item.text}"
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(item.id)}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(item.detectedAt)}
        </span>
        <Button
          size="sm"
          onClick={() => onSend(item.text)}
          className="h-6 text-[10px] px-2"
          disabled={isSending}
        >
          <Send className="h-3 w-3 mr-1" />
          Send
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editable preview panel
// ---------------------------------------------------------------------------
function PreviewPanel({
  questionText,
  formatType,
  options,
  correctAnswer,
  expectedAnswer,
  isGenerating,
  onOptionsChange,
  onCorrectAnswerChange,
  onExpectedAnswerChange,
  onRegenerate,
}: {
  questionText: string;
  formatType: 'multiple_choice' | 'short_answer' | 'poll';
  options: string[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  expectedAnswer: string;
  isGenerating: boolean;
  onOptionsChange: (opts: string[]) => void;
  onCorrectAnswerChange: (ans: 'A' | 'B' | 'C' | 'D') => void;
  onExpectedAnswerChange: (ans: string) => void;
  onRegenerate: () => void;
}) {
  const isChoice = formatType === 'multiple_choice' || formatType === 'poll';
  const isPoll = formatType === 'poll';
  const letters = ['A', 'B', 'C', 'D'] as const;

  return (
    <div className="flex flex-col border border-border/60 rounded-xl bg-background overflow-hidden h-full">
      {/* Header */}
      <div className="px-3 py-2 bg-muted/40 border-b border-border/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          {isChoice ? (
            isPoll ? <BarChart3 className="h-3 w-3 text-muted-foreground" /> : <ListChecks className="h-3 w-3 text-muted-foreground" />
          ) : (
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-[10px] text-muted-foreground font-medium">
            {isPoll ? 'Poll' : isChoice ? 'MCQ options' : 'Expected answer'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
          title="Regenerate"
        >
          <RefreshCw className={cn('h-3 w-3', isGenerating && 'animate-spin')} />
        </Button>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 flex-1 overflow-y-auto space-y-2">
        {isGenerating ? (
          <div className="space-y-2 pt-1">
            {[...Array(isChoice ? 4 : 2)].map((_, i) => (
              <div key={i} className="h-7 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : isChoice ? (
          /* MCQ / Poll options */
          <div className="space-y-1.5">
            {letters.map((letter, idx) => (
              <div key={letter} className="flex items-center gap-1.5">
                {!isPoll && (
                  <button
                    type="button"
                    onClick={() => onCorrectAnswerChange(letter)}
                    className={cn(
                      'h-4 w-4 rounded-full border-2 shrink-0 transition-colors',
                      correctAnswer === letter
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-muted-foreground/40 hover:border-emerald-400'
                    )}
                    title={`Mark ${letter} as correct`}
                  />
                )}
                <span className="text-[10px] font-semibold text-muted-foreground w-3 shrink-0">{letter}</span>
                <Input
                  value={options[idx] ?? ''}
                  onChange={(e) => {
                    const next = [...options];
                    next[idx] = e.target.value;
                    onOptionsChange(next);
                  }}
                  className="h-6 text-[11px] px-2 py-0 flex-1 min-w-0"
                  placeholder={`Option ${letter}`}
                />
              </div>
            ))}
            {!isPoll && (
              <p className="text-[9px] text-muted-foreground pt-0.5">
                ● = correct answer
              </p>
            )}
          </div>
        ) : (
          /* Short answer / coding expected answer */
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground">Expected answer (grading reference)</p>
            <Textarea
              value={expectedAnswer}
              onChange={(e) => onExpectedAnswerChange(e.target.value)}
              className="text-[11px] min-h-[70px] resize-none"
              placeholder="Expected answer..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function QuestionOnDeck({
  candidate,
  candidateHistory,
  isListening,
  isSending,
  onSendNow,
  onPreview,
  onDismiss,
  onRemoveFromHistory,
  isHeld,
  onToggleHold,
  suggestedType = 'multiple_choice',
  formatPreference,
  transcriptContext,
  courseId,
}: QuestionOnDeckProps) {
  const effectiveFormat = (formatPreference ?? suggestedType) as 'multiple_choice' | 'short_answer' | 'poll';

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Generated preview state
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [bankMatch, setBankMatch] = useState<{ id: string; title: string } | null>(null);

  // Track which candidate text we last generated for to avoid duplicate calls
  const generatedForRef = useRef<string | null>(null);

  const hasCandidate = !!candidate;
  const hasHistory = candidateHistory.length > 0;
  const visibleHistory = showAllHistory ? candidateHistory : candidateHistory.slice(0, 3);
  const hiddenCount = candidateHistory.length - 3;

  // Auto-generate when a new candidate appears
  useEffect(() => {
    if (!candidate || generatedForRef.current === candidate.text) return;
    generatedForRef.current = candidate.text;
    generatePreview(candidate.text, effectiveFormat, candidate.priorContext);
  }, [candidate?.text, effectiveFormat]);

  // Reset generated state when candidate is cleared
  useEffect(() => {
    if (!candidate) {
      generatedForRef.current = null;
      setMcqOptions(['', '', '', '']);
      setCorrectAnswer('A');
      setExpectedAnswer('');
      setBankMatch(null);
    }
  }, [candidate]);

  const generatePreview = async (questionText: string, format: typeof effectiveFormat, priorContext?: string) => {
    setIsGenerating(true);
    setMcqOptions(['', '', '', '']);
    setExpectedAnswer('');

    try {
      const body: Record<string, unknown> = {
        question_text: questionText,
        source_transcript: transcriptContext,
      };
      if (priorContext && priorContext.trim()) {
        body.prior_context = priorContext;
      }

      if (format === 'multiple_choice' || format === 'poll') {
        const { data, error } = await supabase.functions.invoke('generate-mcq-options', { body });
        if (!error && data?.options?.length === 4) {
          setMcqOptions(data.options);
          if (data.correct_answer && format === 'multiple_choice') {
            setCorrectAnswer(data.correct_answer);
          }
        }
      } else {
        const { data, error } = await supabase.functions.invoke('generate-expected-answer', { body });
        if (!error && data?.expected_answer) {
          setExpectedAnswer(data.expected_answer);
        }
      }
    } catch {
      // Silent — user can still edit manually
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartEdit = () => {
    if (candidate) {
      setEditText(candidate.text);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    if (editText.trim()) {
      fireSend(editText.trim());
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  // Build send data from current preview state and fire
  const fireSend = (questionText: string) => {
    const isChoice = effectiveFormat === 'multiple_choice' || effectiveFormat === 'poll';
    const hasOptions = mcqOptions.some(o => o.trim());

    const data: OnDeckSendData = {
      type: effectiveFormat,
      ...(isChoice && hasOptions
        ? { options: mcqOptions, correctAnswer: effectiveFormat === 'multiple_choice' ? correctAnswer : undefined }
        : {}),
      ...(!isChoice && expectedAnswer.trim() ? { expectedAnswer } : {}),
    };

    onSendNow(questionText, data);
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-500',
        hasCandidate
          ? 'border-primary/40 shadow-lg bg-gradient-to-br from-primary/[0.03] to-transparent'
          : 'border-border/60 bg-card/80'
      )}
    >
      {/* Top accent bar */}
      <div
        className={cn(
          'h-1 transition-all duration-700',
          hasCandidate
            ? 'bg-gradient-to-r from-primary via-primary/80 to-secondary'
            : isListening
              ? 'bg-gradient-to-r from-muted-foreground/20 via-muted-foreground/30 to-muted-foreground/20 animate-pulse'
              : 'bg-muted'
        )}
      />

      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
                hasCandidate ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Question on Deck</h3>
              <p className="text-xs text-muted-foreground">
                {hasCandidate
                  ? 'Ready to send'
                  : isListening
                    ? 'Listening for your next question...'
                    : 'Start recording to autodraft'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasHistory && (
              <Badge variant="outline" className="text-[10px] font-medium">
                {candidateHistory.length} saved
              </Badge>
            )}
            {hasCandidate && (
              <Badge variant="outline" className="text-[10px] font-medium border-primary/30 text-primary">
                {effectiveFormat === 'multiple_choice' ? 'MCQ' : effectiveFormat === 'poll' ? 'Poll' : 'Short Answer'}
              </Badge>
            )}
            {isHeld && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                <Pause className="h-2.5 w-2.5 mr-0.5" />
                Held
              </Badge>
            )}
            {isListening && !hasCandidate && (
              <div className="flex items-center gap-1.5">
                <Radio className="h-3 w-3 text-primary animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-medium">Live</span>
              </div>
            )}
          </div>
        </div>

        {/* Current candidate */}
        {hasCandidate && !isEditing ? (
          <div className="flex gap-4">
            {/* Left: question text + action buttons */}
            <div className="flex-1 space-y-3 min-w-0">
              <div className="p-4 rounded-xl bg-background border border-border/60">
                <p className="text-sm text-foreground leading-relaxed">
                  "{candidate.text}"
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => fireSend(candidate.text)}
                  className="gap-1.5 text-xs h-9 rounded-lg flex-1 bg-primary hover:bg-primary/90"
                  disabled={isSending || isGenerating}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sending...
                    </>
                  ) : isGenerating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Send Now
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onToggleHold}
                  className="gap-1 text-xs h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  title={isHeld ? 'Release hold' : 'Hold this draft'}
                >
                  {isHeld ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStartEdit}
                  className="gap-1 text-xs h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  title="Edit question text"
                  disabled={isSending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDismiss}
                  className="gap-1 text-xs h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  title="Dismiss"
                  disabled={isSending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Right: live editable preview */}
            <div className="w-52 shrink-0">
              <PreviewPanel
                questionText={candidate.text}
                formatType={effectiveFormat}
                options={mcqOptions}
                correctAnswer={correctAnswer}
                expectedAnswer={expectedAnswer}
                isGenerating={isGenerating}
                onOptionsChange={setMcqOptions}
                onCorrectAnswerChange={setCorrectAnswer}
                onExpectedAnswerChange={setExpectedAnswer}
                onRegenerate={() => {
                  generatedForRef.current = null;
                  generatePreview(candidate.text, effectiveFormat);
                }}
              />
            </div>
          </div>
        ) : isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="Edit the question..."
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="gap-1.5 text-xs h-8"
                disabled={!editText.trim()}
              >
                <Check className="h-3.5 w-3.5" />
                Send Edited
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="text-xs h-8">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* Empty / Listening state */
          <div className="py-6 text-center">
            <div
              className={cn(
                'mx-auto mb-3 h-12 w-12 rounded-2xl flex items-center justify-center transition-all',
                isListening ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              {isListening ? (
                <Radio className="h-5 w-5 animate-pulse" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isListening
                ? 'Edvana is listening and will autodraft your next audience check...'
                : 'Start recording to enable always-on question detection'}
            </p>
          </div>
        )}

        {/* Question History */}
        {hasHistory && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Previous detections</span>
            <div className="space-y-2">
              {visibleHistory.map((item) => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  onSend={(text) => onSendNow(text)}
                  onRemove={onRemoveFromHistory}
                  isSending={isSending}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllHistory(v => !v)}
                className="w-full h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                {showAllHistory ? (
                  <><ChevronUp className="h-3 w-3" />Show less</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />Show {hiddenCount} more</>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
