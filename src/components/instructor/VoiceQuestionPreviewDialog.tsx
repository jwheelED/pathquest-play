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
import { Mic, MessageSquare, ListChecks, Loader2 } from 'lucide-react';

export interface ExtractedVoiceQuestion {
  question_text: string;
  suggested_type: 'short_answer' | 'multiple_choice';
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
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState<'short_answer' | 'multiple_choice'>('short_answer');
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');

  // Initialize state when extracted question changes
  useEffect(() => {
    if (extractedQuestion) {
      setQuestionText(extractedQuestion.question_text);
      setQuestionType(extractedQuestion.suggested_type);
      // Reset MCQ options when a new question is extracted
      setMcqOptions(['', '', '', '']);
      setCorrectAnswer('A');
    }
  }, [extractedQuestion]);

  const handleConfirm = () => {
    onConfirmSend({
      question_text: questionText,
      suggested_type: questionType,
    });
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
              <Label>Answer Options</Label>
              <p className="text-xs text-muted-foreground">
                Add options for students to choose from. Leave blank for AI to generate.
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
                      placeholder={`Option ${letter} (optional)`}
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
