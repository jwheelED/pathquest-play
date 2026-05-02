import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Mic, MessageSquare, ListChecks, Loader2, Sparkles, RefreshCw, Eye, Send, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MathRenderer } from '@/components/ui/math-renderer';

export interface ExtractedVoiceQuestion {
  question_text: string;
  suggested_type: 'short_answer' | 'multiple_choice' | 'poll';
  // MCQ fields (pre-generated for editing)
  options?: string[];
  correct_answer?: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  // Short answer expected answer (for grading reference)
  expected_answer?: string;
  // Source transcript for context display
  source_transcript?: string;
}

interface VoiceQuestionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedQuestion: ExtractedVoiceQuestion | null;
  onConfirmSend: (editedQuestion: ExtractedVoiceQuestion) => void;
  isSending: boolean;
  sourceTranscript?: string;
  courseId?: string | null;
}

export function VoiceQuestionPreviewDialog({
  open,
  onOpenChange,
  extractedQuestion,
  onConfirmSend,
  isSending,
  sourceTranscript,
  courseId,
}: VoiceQuestionPreviewDialogProps) {
  const { toast } = useToast();
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState<'short_answer' | 'multiple_choice' | 'poll'>('short_answer');
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false);
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [isGeneratingExpectedAnswer, setIsGeneratingExpectedAnswer] = useState(false);
  const [showMathPreview, setShowMathPreview] = useState(false);
  const [bankMatch, setBankMatch] = useState<{ id: string; title: string; source: string } | null>(null);

  // Reset bank match indicator when the question changes
  useEffect(() => {
    setBankMatch(null);
  }, [extractedQuestion?.question_text]);

  /**
   * Look up an exact/semantic match in the instructor's question bank for the
   * given format. Returns true if a match was found and applied to local state
   * (caller should then skip AI generation).
   */
  const tryApplyBankMatch = async (
    format: 'multiple_choice' | 'poll' | 'short_answer'
  ): Promise<boolean> => {
    try {
      const { data: matchData } = await supabase.functions.invoke('match-bank-question', {
        body: { question_text: questionText, course_id: courseId ?? null, format },
      });
      const m = matchData?.match;
      if (!m || !m.question_content) return false;
      const qc = m.question_content;

      if (format === 'multiple_choice' || format === 'poll') {
        const opts: string[] | undefined = Array.isArray(qc.options) ? qc.options : undefined;
        if (opts && opts.length === 4) {
          setMcqOptions(opts);
          const ca = qc.correctAnswer || qc.correct_answer;
          if (ca && ['A', 'B', 'C', 'D'].includes(ca) && format === 'multiple_choice') {
            setCorrectAnswer(ca as 'A' | 'B' | 'C' | 'D');
          }
          setBankMatch({ id: m.id, title: m.title, source: matchData?.source || 'match' });
          toast({
            title: 'Matched from Question Bank',
            description: `Using "${m.title}" instead of generating new options.`,
          });
          return true;
        }
      } else if (format === 'short_answer') {
        const ea = qc.expectedAnswer || qc.expected_answer || qc.finalAnswer;
        if (ea) {
          setExpectedAnswer(String(ea));
          setBankMatch({ id: m.id, title: m.title, source: matchData?.source || 'match' });
          toast({
            title: 'Matched from Question Bank',
            description: `Using expected answer from "${m.title}".`,
          });
          return true;
        }
      }
    } catch (e) {
      console.warn('Bank match lookup failed, falling back to AI', e);
    }
    return false;
  };

  // Initialize state when extracted question changes
  useEffect(() => {
    if (extractedQuestion) {
      // Strip any HTML tags as defense-in-depth (AI sometimes returns markup)
      const sanitizedText = extractedQuestion.question_text.replace(/<[^>]*>/g, '').trim();
      setQuestionText(sanitizedText);
      setQuestionType(extractedQuestion.suggested_type);
      
      // Initialize MCQ options from pre-generated data or reset
      if (extractedQuestion.options && extractedQuestion.options.length === 4) {
        setMcqOptions(extractedQuestion.options);
      } else {
        setMcqOptions(['', '', '', '']);
      }
      
      // Initialize correct answer from pre-generated data or default
      if (extractedQuestion.correct_answer) {
        setCorrectAnswer(extractedQuestion.correct_answer);
      } else {
        setCorrectAnswer('A');
      }

      // Initialize expected answer for short answer questions
      if (extractedQuestion.expected_answer) {
        setExpectedAnswer(extractedQuestion.expected_answer);
      } else {
        setExpectedAnswer('');
      }
    }
  }, [extractedQuestion]);

  const hasOptions = mcqOptions.some(opt => opt.trim() !== '');

  // Track if we've already attempted auto-generation for this question
  const [hasAttemptedAutoGenerate, setHasAttemptedAutoGenerate] = useState(false);

  // Reset auto-generate flag when question changes
  useEffect(() => {
    if (extractedQuestion) {
      setHasAttemptedAutoGenerate(false);
    }
  }, [extractedQuestion?.question_text]);

  // Auto-generate options when dialog opens with MCQ type and empty options
  useEffect(() => {
    if (!open) return; // Only trigger when dialog is open
    if (hasAttemptedAutoGenerate) return; // Don't auto-generate twice
    
    const optionsEmpty = !mcqOptions.some(opt => opt.trim() !== '');
    const shouldAutoGenerate = 
      (questionType === 'multiple_choice' || questionType === 'poll') && 
      optionsEmpty && 
      questionText.trim() !== '' &&
      !isGeneratingOptions;
      
    if (shouldAutoGenerate) {
      console.log('📋 Auto-generating MCQ options...');
      setHasAttemptedAutoGenerate(true);
      handleGenerateOptionsAuto();
    }
  }, [questionType, open, questionText, hasAttemptedAutoGenerate, mcqOptions, isGeneratingOptions]);

  // Track if we've already attempted auto-generation for expected answer
  const [hasAttemptedExpectedAnswerGenerate, setHasAttemptedExpectedAnswerGenerate] = useState(false);

  // Reset expected answer auto-generate flag when question changes
  useEffect(() => {
    if (extractedQuestion) {
      setHasAttemptedExpectedAnswerGenerate(false);
    }
  }, [extractedQuestion?.question_text]);

  // Auto-generate expected answer when dialog opens with Short Answer type and empty expected answer
  useEffect(() => {
    if (!open) return; // Only trigger when dialog is open
    if (hasAttemptedExpectedAnswerGenerate) return; // Don't auto-generate twice
    
    const shouldAutoGenerate = 
      questionType === 'short_answer' && 
      expectedAnswer.trim() === '' && 
      questionText.trim() !== '' &&
      !isGeneratingExpectedAnswer;
      
    if (shouldAutoGenerate) {
      console.log('📋 Auto-generating expected answer...');
      setHasAttemptedExpectedAnswerGenerate(true);
      handleGenerateExpectedAnswerAuto();
    }
  }, [questionType, open, questionText, hasAttemptedExpectedAnswerGenerate, expectedAnswer, isGeneratingExpectedAnswer]);

  const handleGenerateExpectedAnswerAuto = async () => {
    if (!questionText.trim() || isGeneratingExpectedAnswer) return;

    setIsGeneratingExpectedAnswer(true);
    try {
      // First try the question bank for an exact/semantic match
      const bankHit = await tryApplyBankMatch('short_answer');
      if (bankHit) return;

      const { data, error } = await supabase.functions.invoke('generate-expected-answer', {
        body: {
          question_text: questionText,
          source_transcript: sourceTranscript || extractedQuestion?.source_transcript,
        },
      });

      if (error) throw error;

      if (data?.expected_answer) {
        setExpectedAnswer(data.expected_answer);
        toast({
          title: "Expected answer generated",
          description: "You can edit the expected answer before sending.",
        });
      }
    } catch (error: any) {
      console.error("Failed to auto-generate expected answer:", error);
      // Silent fail for auto-generation, user can click regenerate
    } finally {
      setIsGeneratingExpectedAnswer(false);
    }
  };

  const handleGenerateExpectedAnswer = async () => {
    if (!questionText.trim()) {
      toast({
        title: "No question text",
        description: "Please enter a question first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingExpectedAnswer(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-expected-answer', {
        body: {
          question_text: questionText,
          source_transcript: sourceTranscript || extractedQuestion?.source_transcript,
        },
      });

      if (error) throw error;

      if (data?.expected_answer) {
        setExpectedAnswer(data.expected_answer);
        toast({
          title: "Expected answer generated",
          description: "You can edit the expected answer before sending.",
        });
      } else {
        throw new Error("Invalid response from AI");
      }
    } catch (error: any) {
      console.error("Failed to generate expected answer:", error);
      toast({
        title: "Failed to generate expected answer",
        description: error.message || "Could not generate expected answer",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingExpectedAnswer(false);
    }
  };

  const handleGenerateOptionsAuto = async () => {
    if (!questionText.trim() || isGeneratingOptions) return;

    setIsGeneratingOptions(true);
    try {
      console.log('🔄 Auto-generating MCQ options for:', questionText.substring(0, 50));

      const { data, error } = await supabase.functions.invoke('generate-mcq-options', {
        body: {
          question_text: questionText,
          source_transcript: sourceTranscript || extractedQuestion?.source_transcript,
        },
      });

      if (error) {
        console.error('Error from generate-mcq-options:', error);
        throw error;
      }

      if (data?.options && data.options.length === 4) {
        console.log('✅ MCQ options generated successfully:', data.options);
        setMcqOptions(data.options);
        if (data.correct_answer) {
          setCorrectAnswer(data.correct_answer);
        }
        toast({
          title: "Options generated",
          description: "MCQ options have been generated. You can edit them before sending.",
        });
      } else {
        console.warn('⚠️ Invalid MCQ options response:', data);
        // Don't throw - just log and let user manually generate
      }
    } catch (error: any) {
      console.error("Failed to auto-generate MCQ options:", error);
      // Show a subtle toast to let user know they need to manually generate
      toast({
        title: "Auto-generation unavailable",
        description: "Click 'Generate Options' to create MCQ choices.",
        variant: "default",
      });
    } finally {
      setIsGeneratingOptions(false);
    }
  };

  const handleGenerateOptions = async () => {
    if (!questionText.trim()) {
      toast({
        title: "No question text",
        description: "Please enter a question first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingOptions(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-mcq-options', {
        body: {
          question_text: questionText,
          source_transcript: sourceTranscript || extractedQuestion?.source_transcript,
        },
      });

      if (error) throw error;

      if (data?.options && data.options.length === 4) {
        setMcqOptions(data.options);
        if (data.correct_answer) {
          setCorrectAnswer(data.correct_answer);
        }
        toast({
          title: "Options generated",
          description: "MCQ options have been generated. You can edit them before sending.",
        });
      } else {
        throw new Error("Invalid response from AI");
      }
    } catch (error: any) {
      console.error("Failed to generate MCQ options:", error);
      toast({
        title: "Failed to generate options",
        description: error.message || "Could not generate MCQ options",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOptions(false);
    }
  };

  const handleConfirm = () => {
    const questionData: ExtractedVoiceQuestion = {
      question_text: questionText,
      suggested_type: questionType,
    };
    
    // Include MCQ data if this is a multiple choice or poll question
    if (questionType === 'multiple_choice' || questionType === 'poll') {
      // Only include options if at least one is filled
      if (hasOptions) {
        questionData.options = mcqOptions;
        // Only set correct_answer for graded MCQ, not poll
        if (questionType === 'multiple_choice') {
          questionData.correct_answer = correctAnswer;
        }
      }
    }

    // Include expected answer for short answer questions
    if (questionType === 'short_answer' && expectedAnswer.trim()) {
      questionData.expected_answer = expectedAnswer;
    }
    
    onConfirmSend(questionData);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...mcqOptions];
    newOptions[index] = value;
    setMcqOptions(newOptions);
  };

  const getTypeIcon = () => {
    if (questionType === 'multiple_choice') return <ListChecks className="h-5 w-5 text-primary" />;
    if (questionType === 'poll') return <BarChart3 className="h-5 w-5 text-primary" />;
    return <MessageSquare className="h-5 w-5 text-primary" />;
  };

  const getTypeLabel = () => {
    if (questionType === 'multiple_choice') return 'Multiple Choice';
    if (questionType === 'poll') return 'Poll';
    return 'Short Answer';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Review Audience Check
          </DialogTitle>
          <DialogDescription>
            Review and refine before sending to the room.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transcript Context - Shows where question came from */}
          {sourceTranscript && (
            <div className="mb-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="font-medium">From lecture transcript:</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-sm text-muted-foreground leading-relaxed max-h-32 overflow-y-auto">
                <p className="italic">"...{sourceTranscript.trim()}..."</p>
              </div>
            </div>
          )}

          {/* Question Type Selector */}
          <div className="space-y-2">
            <Label>Question Type</Label>
            <RadioGroup
              value={questionType}
              onValueChange={(value: 'short_answer' | 'multiple_choice' | 'poll') => {
                setQuestionType(value);
                // Auto-generate options when switching to MCQ or Poll and options are empty
                if ((value === 'multiple_choice' || value === 'poll') && !mcqOptions.some(opt => opt.trim() !== '') && questionText.trim() && !isGeneratingOptions) {
                  console.log('📋 Switching to MCQ/Poll - triggering option generation');
                  setTimeout(() => handleGenerateOptionsAuto(), 100);
                }
                // Auto-generate expected answer when switching to short answer and it's empty
                if (value === 'short_answer' && !expectedAnswer.trim() && questionText.trim() && !isGeneratingExpectedAnswer) {
                  console.log('📋 Switching to Short Answer - triggering expected answer generation');
                  setTimeout(() => handleGenerateExpectedAnswerAuto(), 100);
                }
              }}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="short_answer" id="short_answer" />
                <Label htmlFor="short_answer" className="flex items-center gap-1 cursor-pointer">
                  <MessageSquare className="h-4 w-4" />
                  Short Answer
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple_choice" id="multiple_choice" />
                <Label htmlFor="multiple_choice" className="flex items-center gap-1 cursor-pointer">
                  <ListChecks className="h-4 w-4" />
                  Multiple Choice
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="poll" id="poll" />
                <Label htmlFor="poll" className="flex items-center gap-1 cursor-pointer">
                  <BarChart3 className="h-4 w-4" />
                  Poll
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="question-text" className="flex items-center gap-2">
                {getTypeIcon()}
                {getTypeLabel()} Question
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowMathPreview(!showMathPreview)}
                className="gap-1.5 text-xs"
              >
                <Eye className="h-3 w-3" />
                {showMathPreview ? 'Hide' : 'Show'} Preview
              </Button>
            </div>
            <Textarea
              id="question-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter the question... (use $...$ for inline math, $$...$$ for display math)"
              className="min-h-[100px] font-mono text-sm"
            />
            {showMathPreview && questionText && (
              <div className="p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs text-muted-foreground mb-2 block">Math Preview:</Label>
                <div className="text-base">
                  <MathRenderer content={questionText} />
                </div>
              </div>
            )}
          </div>

          {/* Expected Answer (only shown for short answer) */}
          {questionType === 'short_answer' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="expected-answer">Expected Answer (for grading reference)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateExpectedAnswer}
                  disabled={isGeneratingExpectedAnswer || !questionText.trim()}
                  className="gap-1.5 text-xs"
                >
                  {isGeneratingExpectedAnswer ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating...
                    </>
                  ) : expectedAnswer.trim() ? (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="expected-answer"
                value={expectedAnswer}
                onChange={(e) => setExpectedAnswer(e.target.value)}
                placeholder="Enter the expected/ideal answer for grading..."
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">
                This will be used as a reference when grading student responses.
              </p>
            </div>
          )}

          {/* MCQ Options (shown for multiple choice and poll) */}
          {(questionType === 'multiple_choice' || questionType === 'poll') && (
            <div className="space-y-3">
              {questionType === 'poll' && (
                <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <BarChart3 className="h-5 w-5 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-500">
                    📊 Responses will be collected as a poll (no grading)
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Answer Options</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateOptions}
                  disabled={isGeneratingOptions || !questionText.trim()}
                  className="gap-1.5 text-xs"
                >
                  {isGeneratingOptions ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating...
                    </>
                  ) : hasOptions ? (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Generate Options
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {hasOptions 
                  ? questionType === 'poll' 
                    ? "Edit the generated options below."
                    : "Edit the generated options below. Select the correct answer."
                  : "Click 'Generate Options' to create choices, or add them manually."}
              </p>
              {questionType === 'multiple_choice' ? (
                <RadioGroup
                  value={correctAnswer}
                  onValueChange={(value) => setCorrectAnswer(value as 'A' | 'B' | 'C' | 'D')}
                  className="space-y-3"
                >
                  {['A', 'B', 'C', 'D'].map((letter, index) => (
                    <div key={letter} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <RadioGroupItem
                            value={letter}
                            id={`correct-${letter}`}
                          />
                          <Label htmlFor={`correct-${letter}`} className="font-medium cursor-pointer">
                            {letter}
                          </Label>
                        </div>
                        <Input
                          value={mcqOptions[index]}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          placeholder={`Option ${letter}`}
                          className="flex-1"
                        />
                      </div>
                      {showMathPreview && mcqOptions[index] && (
                        <div className="ml-[88px] p-2 rounded border bg-muted/30 text-sm">
                          <MathRenderer content={mcqOptions[index]} />
                        </div>
                      )}
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                /* Poll mode: no correct answer selector, just option inputs */
                <div className="space-y-3">
                  {['A', 'B', 'C', 'D'].map((letter, index) => (
                    <div key={letter} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium w-6 text-muted-foreground">{letter}:</span>
                        <Input
                          value={mcqOptions[index]}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          placeholder={`Option ${letter}`}
                          className="flex-1"
                        />
                      </div>
                      {showMathPreview && mcqOptions[index] && (
                        <div className="ml-8 p-2 rounded border bg-muted/30 text-sm">
                          <MathRenderer content={mcqOptions[index]} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {questionType === 'multiple_choice' && (
                <p className="text-xs text-muted-foreground">
                  Select the radio button next to the correct answer.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSending || !questionText.trim()}
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Send to Room
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
