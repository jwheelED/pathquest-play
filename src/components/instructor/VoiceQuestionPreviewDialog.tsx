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
import { Mic, MessageSquare, ListChecks, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ExtractedVoiceQuestion {
  question_text: string;
  suggested_type: 'short_answer' | 'multiple_choice';
  // MCQ fields (pre-generated for editing)
  options?: string[];
  correct_answer?: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
}

interface VoiceQuestionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedQuestion: ExtractedVoiceQuestion | null;
  onConfirmSend: (editedQuestion: ExtractedVoiceQuestion) => void;
  isSending: boolean;
}

export function VoiceQuestionPreviewDialog({
  open,
  onOpenChange,
  extractedQuestion,
  onConfirmSend,
  isSending,
}: VoiceQuestionPreviewDialogProps) {
  const { toast } = useToast();
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState<'short_answer' | 'multiple_choice'>('short_answer');
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false);

  // Initialize state when extracted question changes
  useEffect(() => {
    if (extractedQuestion) {
      setQuestionText(extractedQuestion.question_text);
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
    }
  }, [extractedQuestion]);

  const hasOptions = mcqOptions.some(opt => opt.trim() !== '');

  // Auto-generate options when switching to MCQ with empty options
  useEffect(() => {
    const optionsEmpty = !mcqOptions.some(opt => opt.trim() !== '');
    const shouldAutoGenerate = 
      questionType === 'multiple_choice' && 
      optionsEmpty && 
      questionText.trim() !== '' &&
      !isGeneratingOptions;
      
    if (shouldAutoGenerate) {
      // Trigger the generation
      handleGenerateOptionsAuto();
    }
  }, [questionType]);

  const handleGenerateOptionsAuto = async () => {
    if (!questionText.trim() || isGeneratingOptions) return;

    setIsGeneratingOptions(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-mcq-options', {
        body: {
          question_text: questionText,
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
      }
    } catch (error: any) {
      console.error("Failed to auto-generate MCQ options:", error);
      // Silent fail for auto-generation, user can click regenerate
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
    
    // Include MCQ data if this is a multiple choice question
    if (questionType === 'multiple_choice') {
      // Only include options if at least one is filled
      if (hasOptions) {
        questionData.options = mcqOptions;
        questionData.correct_answer = correctAnswer;
      }
    }
    
    onConfirmSend(questionData);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...mcqOptions];
    newOptions[index] = value;
    setMcqOptions(newOptions);
  };

  const getTypeIcon = () => {
    return questionType === 'multiple_choice' ? (
      <ListChecks className="h-5 w-5 text-primary" />
    ) : (
      <MessageSquare className="h-5 w-5 text-primary" />
    );
  };

  const getTypeLabel = () => {
    return questionType === 'multiple_choice' ? 'Multiple Choice' : 'Short Answer';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-emerald-500" />
            Voice Question Preview
          </DialogTitle>
          <DialogDescription>
            Review and edit the extracted question before sending to students.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question Type Selector */}
          <div className="space-y-2">
            <Label>Question Type</Label>
            <RadioGroup
              value={questionType}
              onValueChange={(value: 'short_answer' | 'multiple_choice') => setQuestionType(value)}
              className="flex gap-4"
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
            </RadioGroup>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <Label htmlFor="question-text" className="flex items-center gap-2">
              {getTypeIcon()}
              {getTypeLabel()} Question
            </Label>
            <Textarea
              id="question-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter the question..."
              className="min-h-[100px]"
            />
          </div>

          {/* MCQ Options (only shown for multiple choice) */}
          {questionType === 'multiple_choice' && (
            <div className="space-y-3">
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
                  ? "Edit the generated options below. Select the correct answer."
                  : "Click 'Generate Options' to create choices, or add them manually."}
              </p>
              <RadioGroup
                value={correctAnswer}
                onValueChange={(value) => setCorrectAnswer(value as 'A' | 'B' | 'C' | 'D')}
              >
                {['A', 'B', 'C', 'D'].map((letter, index) => (
                  <div key={letter} className="flex items-center gap-2">
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
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Select the radio button next to the correct answer.
              </p>
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
              'Send to Students'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
