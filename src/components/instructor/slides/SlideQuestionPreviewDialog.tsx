import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, X, Code, FileText, ListChecks, BarChart3 } from 'lucide-react';

export type QuestionType = 'mcq' | 'short_answer' | 'coding';

export interface MCQData {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  isPoll?: boolean;
}

export interface ShortAnswerData {
  question: string;
  expected_answer: string;
  explanation?: string;
  isPoll?: boolean;
}

export interface CodingData {
  problem: string;
  function_name: string;
  parameters?: string;
  return_type?: string;
  examples?: string[];
  constraints?: string[];
  starter_code?: string;
}

export interface ExtractedQuestionData {
  mcq?: MCQData;
  short_answer?: ShortAnswerData;
  coding?: CodingData;
  isPoll?: boolean;
}

interface SlideQuestionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionType: QuestionType;
  extractedData: ExtractedQuestionData | null;
  onConfirmSend: (editedData: ExtractedQuestionData, isPollMode: boolean) => void;
  isSending?: boolean;
}

export function SlideQuestionPreviewDialog({
  open,
  onOpenChange,
  questionType,
  extractedData,
  onConfirmSend,
  isSending = false,
}: SlideQuestionPreviewDialogProps) {
  // Poll mode disabled by default so MCQs are graded and correct answers are marked
  const isPollMode = false;
  // Editable state for MCQ
  const [mcqQuestion, setMcqQuestion] = useState('');
  const [mcqOptions, setMcqOptions] = useState<string[]>(['', '', '', '']);
  const [mcqCorrectAnswer, setMcqCorrectAnswer] = useState('A');
  const [mcqExplanation, setMcqExplanation] = useState('');

  // Editable state for Short Answer
  const [saQuestion, setSaQuestion] = useState('');
  const [saExpectedAnswer, setSaExpectedAnswer] = useState('');
  const [saExplanation, setSaExplanation] = useState('');

  // Editable state for Coding
  const [codingProblem, setCodingProblem] = useState('');
  const [codingFunctionName, setCodingFunctionName] = useState('');
  const [codingParameters, setCodingParameters] = useState('');
  const [codingReturnType, setCodingReturnType] = useState('');
  const [codingExamples, setCodingExamples] = useState('');
  const [codingConstraints, setCodingConstraints] = useState('');
  const [codingStarterCode, setCodingStarterCode] = useState('');

  // Reset all form state when dialog opens - ensures fresh state on each open
  // Uses `open` as trigger to force re-initialization even if extractedData reference is same
  useEffect(() => {
    if (!open || !extractedData) return;

    console.log('📋 SlideQuestionPreviewDialog opened, initializing state from extractedData');

    if (questionType === 'mcq' && extractedData.mcq) {
      const mcq = extractedData.mcq;
      setMcqQuestion(mcq.question || '');
      
      // Validate and pad options - filter out empty strings, then pad to 4
      const validOptions = mcq.options?.filter(opt => opt && opt.trim() !== '') || [];
      if (validOptions.length >= 4) {
        setMcqOptions(mcq.options!.slice(0, 4));
      } else {
        // Pad with empty strings to always have 4 slots
        const paddedOptions = [...validOptions, '', '', '', ''].slice(0, 4);
        setMcqOptions(paddedOptions);
      }
      
      setMcqCorrectAnswer(mcq.correct_answer || 'A');
      setMcqExplanation(mcq.explanation || '');
    } else if (questionType === 'short_answer' && extractedData.short_answer) {
      const sa = extractedData.short_answer;
      setSaQuestion(sa.question || '');
      setSaExpectedAnswer(sa.expected_answer || '');
      setSaExplanation(sa.explanation || '');
    } else if (questionType === 'coding' && extractedData.coding) {
      const coding = extractedData.coding;
      setCodingProblem(coding.problem || '');
      setCodingFunctionName(coding.function_name || '');
      setCodingParameters(coding.parameters || '');
      setCodingReturnType(coding.return_type || '');
      setCodingExamples(coding.examples?.join('\n') || '');
      setCodingConstraints(coding.constraints?.join('\n') || '');
      setCodingStarterCode(coding.starter_code || '');
    }
  }, [open, extractedData, questionType]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...mcqOptions];
    newOptions[index] = value;
    setMcqOptions(newOptions);
  };

  const handleConfirm = () => {
    let editedData: ExtractedQuestionData = {};

    if (questionType === 'mcq') {
      editedData.mcq = {
        question: mcqQuestion,
        options: mcqOptions,
        correct_answer: mcqCorrectAnswer,
        explanation: mcqExplanation,
        isPoll: isPollMode,
      };
    } else if (questionType === 'short_answer') {
      editedData.short_answer = {
        question: saQuestion,
        expected_answer: saExpectedAnswer,
        explanation: saExplanation,
        isPoll: isPollMode,
      };
    } else if (questionType === 'coding') {
      editedData.coding = {
        problem: codingProblem,
        function_name: codingFunctionName,
        parameters: codingParameters,
        return_type: codingReturnType,
        examples: codingExamples.split('\n').filter(Boolean),
        constraints: codingConstraints.split('\n').filter(Boolean),
        starter_code: codingStarterCode,
      };
    }

    editedData.isPoll = isPollMode;
    onConfirmSend(editedData, isPollMode);
  };

  const getTypeIcon = () => {
    switch (questionType) {
      case 'mcq':
        return <ListChecks className="h-4 w-4" />;
      case 'short_answer':
        return <FileText className="h-4 w-4" />;
      case 'coding':
        return <Code className="h-4 w-4" />;
    }
  };

  const getTypeLabel = () => {
    switch (questionType) {
      case 'mcq':
        return 'Multiple Choice';
      case 'short_answer':
        return 'Short Answer';
      case 'coding':
        return 'Coding';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Preview & Edit Question
            <Badge variant="secondary" className="ml-2 gap-1">
              {getTypeIcon()}
              {getTypeLabel()}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Poll Mode Info - for MCQ and Short Answer */}
          {(questionType === 'mcq' || questionType === 'short_answer') && (
            <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <p className="text-sm text-blue-400">
                📊 Responses will be collected as a poll (no grading)
              </p>
            </div>
          )}

          {/* MCQ Editor */}
          {questionType === 'mcq' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="mcq-question">Question</Label>
                <Textarea
                  id="mcq-question"
                  value={mcqQuestion}
                  onChange={(e) => setMcqQuestion(e.target.value)}
                  placeholder="Enter the question..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-3">
                <Label>Answer Options</Label>
                <div className="space-y-2">
                  {['A', 'B', 'C', 'D'].map((letter, index) => (
                    <div key={letter} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-6 text-muted-foreground">
                        {letter}:
                      </span>
                      <Input
                        value={mcqOptions[index]}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        placeholder={`Option ${letter}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Short Answer Editor */}
          {questionType === 'short_answer' && (
            <div className="space-y-2">
              <Label htmlFor="sa-question">Question</Label>
              <Textarea
                id="sa-question"
                value={saQuestion}
                onChange={(e) => setSaQuestion(e.target.value)}
                placeholder="Enter the question..."
                className="min-h-[80px]"
              />
            </div>
          )}

          {/* Coding Editor */}
          {questionType === 'coding' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="coding-problem">Problem Statement</Label>
                <Textarea
                  id="coding-problem"
                  value={codingProblem}
                  onChange={(e) => setCodingProblem(e.target.value)}
                  placeholder="Describe the coding problem..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="coding-function">Function Name</Label>
                  <Input
                    id="coding-function"
                    value={codingFunctionName}
                    onChange={(e) => setCodingFunctionName(e.target.value)}
                    placeholder="e.g., calculateSum"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coding-return">Return Type</Label>
                  <Input
                    id="coding-return"
                    value={codingReturnType}
                    onChange={(e) => setCodingReturnType(e.target.value)}
                    placeholder="e.g., number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coding-params">Parameters</Label>
                <Input
                  id="coding-params"
                  value={codingParameters}
                  onChange={(e) => setCodingParameters(e.target.value)}
                  placeholder="e.g., nums: number[], target: number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coding-examples">Examples (one per line)</Label>
                <Textarea
                  id="coding-examples"
                  value={codingExamples}
                  onChange={(e) => setCodingExamples(e.target.value)}
                  placeholder="Input: [1, 2, 3]&#10;Output: 6"
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coding-constraints">Constraints (one per line)</Label>
                <Textarea
                  id="coding-constraints"
                  value={codingConstraints}
                  onChange={(e) => setCodingConstraints(e.target.value)}
                  placeholder="1 <= nums.length <= 1000"
                  className="min-h-[60px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coding-starter">Starter Code (optional)</Label>
                <Textarea
                  id="coding-starter"
                  value={codingStarterCode}
                  onChange={(e) => setCodingStarterCode(e.target.value)}
                  placeholder="function solve(nums) {&#10;  // Your code here&#10;}"
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSending}>
            <Send className="h-4 w-4 mr-2" />
            {isSending ? 'Sending...' : 'Send to Students'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
