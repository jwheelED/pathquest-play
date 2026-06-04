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
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { PassiveQuestionCandidate } from '@/hooks/usePassiveQuestionDetection';

export type OnDeckFormat = 'multiple_choice' | 'short_answer' | 'poll' | 'coding';

export interface OnDeckCodingPayload {
  problemStatement?: string;
  functionSignature?: string;
  language?: string;
  difficulty?: string;
  constraints?: string[];
  examples?: Array<{ input?: string; output?: string; explanation?: string }>;
  hints?: string[];
  starterCode?: string;
  testCases?: Array<{ input?: string; expectedOutput?: string }>;
  title?: string;
  // For simple style: short reference answer used for lenient auto-grading
  expected_answer?: string;
}

export interface OnDeckSendData {
  options?: string[];
  correctAnswer?: 'A' | 'B' | 'C' | 'D';
  expectedAnswer?: string;
  type: OnDeckFormat;
  sourceBankItemId?: string;
  codingStyle?: 'simple' | 'full';
  codingPayload?: OnDeckCodingPayload;
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
  suggestedType?: OnDeckFormat;
  formatPreference?: OnDeckFormat;
  /** Sub-style when format is 'coding' */
  codingStyle?: 'simple' | 'full';
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
  codingStyle,
  options,
  correctAnswer,
  expectedAnswer,
  codingPayload,
  isGenerating,
  onOptionsChange,
  onCorrectAnswerChange,
  onExpectedAnswerChange,
  onCodingPayloadChange,
  onRegenerate,
}: {
  questionText: string;
  formatType: OnDeckFormat;
  codingStyle: 'simple' | 'full';
  options: string[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  expectedAnswer: string;
  codingPayload: OnDeckCodingPayload;
  isGenerating: boolean;
  onOptionsChange: (opts: string[]) => void;
  onCorrectAnswerChange: (ans: 'A' | 'B' | 'C' | 'D') => void;
  onExpectedAnswerChange: (ans: string) => void;
  onCodingPayloadChange: (p: OnDeckCodingPayload) => void;
  onRegenerate: () => void;
}) {
  const isChoice = formatType === 'multiple_choice' || formatType === 'poll';
  const isPoll = formatType === 'poll';
  const isCoding = formatType === 'coding';
  const isFullCoding = isCoding && codingStyle === 'full';
  const isSimpleCoding = isCoding && codingStyle === 'simple';
  const letters = ['A', 'B', 'C', 'D'] as const;

  const headerLabel = isPoll
    ? 'Poll'
    : isChoice
      ? 'MCQ options'
      : isFullCoding
        ? `Coding problem (${codingPayload.language || 'python'})`
        : isSimpleCoding
          ? `Coding check-in (${codingPayload.language || 'python'})`
          : 'Expected answer';

  const headerIcon = isCoding ? (
    <Code className="h-3 w-3 text-muted-foreground" />
  ) : isChoice ? (
    isPoll ? <BarChart3 className="h-3 w-3 text-muted-foreground" /> : <ListChecks className="h-3 w-3 text-muted-foreground" />
  ) : (
    <MessageSquare className="h-3 w-3 text-muted-foreground" />
  );

  const updatePayload = (patch: Partial<OnDeckCodingPayload>) => {
    onCodingPayloadChange({ ...codingPayload, ...patch });
  };

  return (
    <div className="flex flex-col border border-border/60 rounded-xl bg-background overflow-hidden h-full">
      {/* Header */}
      <div className="px-3 py-2 bg-muted/40 border-b border-border/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          {headerIcon}
          <span className="text-[10px] text-muted-foreground font-medium">{headerLabel}</span>
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
      <div className="px-3 py-2.5 flex-1 overflow-y-auto space-y-2 max-h-[420px]">
        {isGenerating ? (
          <div className="space-y-2 pt-1">
            {[...Array(isChoice ? 4 : isFullCoding ? 6 : 2)].map((_, i) => (
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
                <Textarea
                  value={options[idx] ?? ''}
                  onChange={(e) => {
                    const next = [...options];
                    next[idx] = e.target.value;
                    onOptionsChange(next);
                  }}
                  rows={1}
                  className="text-[11px] leading-snug px-2 py-1 flex-1 min-w-0 min-h-[28px] resize-none break-words"
                  placeholder={`Option ${letter}`}
                />
              </div>
            ))}
            {!isPoll && (
              <p className="text-[9px] text-muted-foreground pt-0.5">● = correct answer</p>
            )}
          </div>
        ) : isSimpleCoding ? (
          /* Simple coding check-in — short reference answer */
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground">
              Reference answer ({codingPayload.language || 'python'}) — used as a lenient grading reference
            </p>
            <Textarea
              value={expectedAnswer}
              onChange={(e) => onExpectedAnswerChange(e.target.value)}
              className="text-[11px] min-h-[90px] resize-none font-mono"
              placeholder="e.g. age = 21"
            />
          </div>
        ) : isFullCoding ? (
          /* Full coding problem — editable fields */
          <div className="space-y-2.5">
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground font-medium">Problem statement</p>
              <Textarea
                value={codingPayload.problemStatement ?? ''}
                onChange={(e) => updatePayload({ problemStatement: e.target.value })}
                className="text-[11px] min-h-[60px] resize-none"
                placeholder="Describe the problem the student should solve…"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground font-medium">Function signature</p>
              <Input
                value={codingPayload.functionSignature ?? ''}
                onChange={(e) => updatePayload({ functionSignature: e.target.value })}
                className="text-[11px] h-7 font-mono"
                placeholder="def solve(nums: list[int]) -> int:"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground font-medium">Starter code</p>
              <Textarea
                value={codingPayload.starterCode ?? ''}
                onChange={(e) => updatePayload({ starterCode: e.target.value })}
                className="text-[11px] min-h-[70px] resize-none font-mono"
                placeholder="def solve(nums):\n    pass"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground font-medium">Examples (one per line, input → output)</p>
              <Textarea
                value={(codingPayload.examples || [])
                  .map(ex => `${ex.input ?? ''} → ${ex.output ?? ''}`)
                  .join('\n')}
                onChange={(e) => {
                  const parsed = e.target.value
                    .split('\n')
                    .map(line => {
                      const [input, output] = line.split('→').map(s => s.trim());
                      return { input: input || '', output: output || '' };
                    })
                    .filter(ex => ex.input || ex.output);
                  updatePayload({ examples: parsed });
                }}
                className="text-[11px] min-h-[50px] resize-none font-mono"
                placeholder="[1, 2, 3] → 6"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground font-medium">Constraints (one per line)</p>
              <Textarea
                value={(codingPayload.constraints || []).join('\n')}
                onChange={(e) =>
                  updatePayload({
                    constraints: e.target.value
                      .split('\n')
                      .map(s => s.trim())
                      .filter(Boolean),
                  })
                }
                className="text-[11px] min-h-[44px] resize-none"
                placeholder="1 <= n <= 10^4"
              />
            </div>
          </div>
        ) : (
          /* Short answer expected answer */
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
  codingStyle = 'simple',
  transcriptContext,
  courseId,
}: QuestionOnDeckProps) {
  const effectiveFormat: OnDeckFormat = (formatPreference ?? suggestedType) as OnDeckFormat;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Generated preview state
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [codingPayload, setCodingPayload] = useState<OnDeckCodingPayload>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [bankMatch, setBankMatch] = useState<{ id: string; title: string } | null>(null);

  // Track (candidate text + format + coding style) so a late-arriving format
  // change (e.g. profile preference loaded after the candidate was detected)
  // re-runs generation instead of being skipped by the dedupe guard.
  const generatedForRef = useRef<string | null>(null);
  // Monotonic request id — ensures a stale in-flight preview response cannot
  // overwrite state belonging to a newer format selection (e.g. MCQ response
  // arriving after we've already switched to Coding).
  const requestIdRef = useRef(0);

  const hasCandidate = !!candidate;
  const hasHistory = candidateHistory.length > 0;
  const visibleHistory = showAllHistory ? candidateHistory : candidateHistory.slice(0, 3);
  const hiddenCount = candidateHistory.length - 3;

  // Auto-generate when a new candidate appears OR when the resolved format
  // changes for the current candidate. We REQUIRE formatPreference to be
  // explicitly provided (loaded from profile) before generating — otherwise
  // an early render with the default MCQ format would kick off an MCQ preview
  // that races the real coding/short_answer preview.
  useEffect(() => {
    if (!candidate) return;
    if (formatPreference === undefined || formatPreference === null) return;
    const key = `${candidate.text}::${effectiveFormat}::${codingStyle}`;
    if (generatedForRef.current === key) return;
    generatedForRef.current = key;
    generatePreview(candidate.text, effectiveFormat, candidate.priorContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.text, effectiveFormat, codingStyle, formatPreference]);

  // Reset generated state when candidate is cleared
  useEffect(() => {
    if (!candidate) {
      generatedForRef.current = null;
      setMcqOptions(['', '', '', '']);
      setCorrectAnswer('A');
      setExpectedAnswer('');
      setCodingPayload({});
      setBankMatch(null);
    }
  }, [candidate]);

  const generatePreview = async (
    questionText: string,
    format: OnDeckFormat,
    priorContext?: string,
  ) => {
    const reqId = ++requestIdRef.current;
    const isLatest = () => requestIdRef.current === reqId;

    setIsGenerating(true);
    setMcqOptions(['', '', '', '']);
    setExpectedAnswer('');
    setCodingPayload({});
    setBankMatch(null);

    try {
      const body: Record<string, unknown> = {
        question_text: questionText,
        source_transcript: transcriptContext,
      };
      if (priorContext && priorContext.trim()) {
        body.prior_context = priorContext;
      }

      // ─── Coding format ────────────────────────────────────────────────
      if (format === 'coding') {
        const { data, error } = await supabase.functions.invoke('generate-coding-preview', {
          body: { ...body, style: codingStyle },
        });
        if (!isLatest()) return;
        if (!error && data) {
          if (codingStyle === 'simple') {
            setExpectedAnswer(data.expected_answer || '');
            setCodingPayload({
              language: data.language,
              expected_answer: data.expected_answer || '',
            });
          } else {
            setCodingPayload({
              title: data.title,
              problemStatement: data.problemStatement,
              functionSignature: data.functionSignature,
              language: data.language,
              difficulty: data.difficulty,
              constraints: data.constraints || [],
              examples: data.examples || [],
              hints: data.hints || [],
              starterCode: data.starterCode || '',
              testCases: data.testCases || [],
            });
          }
        } else if (error) {
          console.warn('generate-coding-preview failed', error);
        }
        return;
      }

      // ─── Non-coding: bank match in parallel with AI generation ────────
      const bankPromise = supabase.functions
        .invoke('match-bank-question', {
          body: { question_text: questionText, course_id: courseId ?? null, format },
        })
        .catch((e) => {
          console.warn('Bank match lookup failed', e);
          return { data: null } as { data: null };
        });

      const aiPromise =
        format === 'multiple_choice' || format === 'poll'
          ? supabase.functions.invoke('generate-mcq-options', { body })
          : supabase.functions.invoke('generate-expected-answer', { body });

      const [bankRes, aiRes] = await Promise.all([bankPromise, aiPromise]);
      if (!isLatest()) return;

      // 1) Prefer high-confidence bank match.
      const matchData: any = (bankRes as any)?.data;
      const m = matchData?.match;
      const confidence: number = typeof matchData?.confidence === 'number' ? matchData.confidence : 0;
      const isHighConfidenceBank =
        m && m.question_content && (matchData?.source === 'exact_match' || confidence >= 0.8);

      if (isHighConfidenceBank) {
        const qc = m.question_content;
        if (format === 'multiple_choice' || format === 'poll') {
          const opts: string[] | undefined = Array.isArray(qc.options) ? qc.options : undefined;
          if (opts && opts.length === 4) {
            setMcqOptions(opts);
            const ca = qc.correctAnswer || qc.correct_answer;
            if (ca && ['A', 'B', 'C', 'D'].includes(ca) && format === 'multiple_choice') {
              setCorrectAnswer(ca as 'A' | 'B' | 'C' | 'D');
            }
            setBankMatch({ id: m.id, title: m.title });
            return;
          }
        } else if (format === 'short_answer') {
          const ea = qc.expectedAnswer || qc.expected_answer || qc.finalAnswer;
          if (ea) {
            setExpectedAnswer(String(ea));
            setBankMatch({ id: m.id, title: m.title });
            return;
          }
        }
      }

      // 2) Fall back to the AI result we kicked off in parallel.
      const { data, error } = aiRes as { data: any; error: any };
      if (!error) {
        if (format === 'multiple_choice' || format === 'poll') {
          if (data?.options?.length === 4) {
            setMcqOptions(data.options);
            if (data.correct_answer && format === 'multiple_choice') {
              setCorrectAnswer(data.correct_answer);
            }
          }
        } else if (data?.expected_answer) {
          setExpectedAnswer(data.expected_answer);
        }
      }
    } catch {
      // Silent — user can still edit manually
    } finally {
      if (isLatest()) setIsGenerating(false);
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
    const isCoding = effectiveFormat === 'coding';
    const hasOptions = mcqOptions.some(o => o.trim());

    let data: OnDeckSendData;
    if (isCoding) {
      const payload: OnDeckCodingPayload = codingStyle === 'simple'
        ? { ...codingPayload, expected_answer: expectedAnswer }
        : { ...codingPayload };
      data = {
        type: 'coding',
        codingStyle,
        codingPayload: payload,
        ...(codingStyle === 'simple' && expectedAnswer.trim()
          ? { expectedAnswer }
          : {}),
        ...(bankMatch ? { sourceBankItemId: bankMatch.id } : {}),
      };
    } else {
      data = {
        type: effectiveFormat,
        ...(isChoice && hasOptions
          ? { options: mcqOptions, correctAnswer: effectiveFormat === 'multiple_choice' ? correctAnswer : undefined }
          : {}),
        ...(!isChoice && expectedAnswer.trim() ? { expectedAnswer } : {}),
        ...(bankMatch ? { sourceBankItemId: bankMatch.id } : {}),
      };
    }

    onSendNow(questionText, data);
  };

  const formatBadgeLabel = effectiveFormat === 'multiple_choice'
    ? 'MCQ'
    : effectiveFormat === 'poll'
      ? 'Poll'
      : effectiveFormat === 'coding'
        ? (codingStyle === 'simple' ? 'Coding (Check-in)' : 'Coding (Full)')
        : 'Short Answer';

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
                {formatBadgeLabel}
              </Badge>
            )}
            {hasCandidate && bankMatch && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-emerald-500/40 text-emerald-700 bg-emerald-50"
                title={`Matched from question bank: ${bankMatch.title}`}
              >
                From bank
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
            <div className="w-[22rem] xl:w-[26rem] shrink-0">
              <PreviewPanel
                questionText={candidate.text}
                formatType={effectiveFormat}
                codingStyle={codingStyle}
                options={mcqOptions}
                correctAnswer={correctAnswer}
                expectedAnswer={expectedAnswer}
                codingPayload={codingPayload}
                isGenerating={isGenerating}
                onOptionsChange={setMcqOptions}
                onCorrectAnswerChange={setCorrectAnswer}
                onExpectedAnswerChange={setExpectedAnswer}
                onCodingPayloadChange={setCodingPayload}
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
