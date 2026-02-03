import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Code, ListChecks, MessageSquare, CheckCircle2 } from "lucide-react";
import { QuestionBankItem, isCodingContent, isMCQContent, isShortAnswerContent } from "./types";
import { cn } from "@/lib/utils";

interface QuestionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: QuestionBankItem | null;
}

export function QuestionPreviewDialog({ 
  open, 
  onOpenChange, 
  question 
}: QuestionPreviewDialogProps) {
  if (!question) return null;

  const content = question.question_content;

  const renderCodingPreview = () => {
    if (!isCodingContent(content)) return null;

    return (
      <div className="space-y-4">
        {/* Problem Statement */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Problem</h4>
          <p className="text-foreground whitespace-pre-wrap">{content.question}</p>
        </div>

        {/* Examples */}
        {content.examples?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Examples</h4>
            <div className="space-y-3">
              {content.examples.map((example, idx) => (
                <Card key={idx} className="bg-muted/50">
                  <CardContent className="p-3 text-sm font-mono">
                    <div><span className="text-muted-foreground">Input:</span> {example.input}</div>
                    <div><span className="text-muted-foreground">Output:</span> {example.output}</div>
                    {example.explanation && (
                      <div className="text-muted-foreground mt-1 text-xs">
                        {example.explanation}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Constraints */}
        {content.constraints?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Constraints</h4>
            <ul className="text-sm list-disc list-inside space-y-1">
              {content.constraints.map((constraint, idx) => (
                <li key={idx} className="text-foreground">{constraint}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Starter Code */}
        {content.starterCode && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Starter Code</h4>
            <div className="rounded-md overflow-hidden border bg-slate-900 p-4">
              <pre className="text-sm font-mono text-slate-100 whitespace-pre-wrap overflow-x-auto">
                {content.starterCode}
              </pre>
            </div>
          </div>
        )}

        {/* Hints */}
        {content.hints?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Hints Available</h4>
            <p className="text-sm text-muted-foreground">
              {content.hints.length} hint{content.hints.length > 1 ? 's' : ''} available to students
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderMCQPreview = () => {
    if (!isMCQContent(content)) return null;

    return (
      <div className="space-y-4">
        {/* Question */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Question</h4>
          <p className="text-foreground whitespace-pre-wrap">{content.question}</p>
        </div>

        {/* Options */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Options</h4>
          <div className="space-y-2">
            {content.options.map((option, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isCorrect = content.correctAnswer === letter || 
                                content.correctAnswer === option;
              
              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    isCorrect 
                      ? "bg-green-500/10 border-green-500/30" 
                      : "bg-muted/30 border-border"
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                    isCorrect 
                      ? "bg-green-500 text-white" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : letter}
                  </div>
                  <span className="text-sm">
                    {option.replace(/^[A-D]\.\s*/, "")}
                  </span>
                  {isCorrect && (
                    <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-600 border-green-500/30">
                      Correct
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Explanation */}
        {content.explanation && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Explanation (shown after answering)</h4>
            <Card className="bg-muted/30">
              <CardContent className="p-3 text-sm text-muted-foreground">
                {content.explanation}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const renderShortAnswerPreview = () => {
    if (!isShortAnswerContent(content)) return null;

    return (
      <div className="space-y-4">
        {/* Question */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Question</h4>
          <p className="text-foreground whitespace-pre-wrap">{content.question}</p>
        </div>

        {/* Answer area preview */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Student Answer Area</h4>
          <div className="border rounded-lg p-4 bg-muted/30 min-h-[100px] flex items-center justify-center">
            <span className="text-sm text-muted-foreground italic">
              Students will type their answer here...
            </span>
          </div>
        </div>

        {/* Expected Answer (instructor only) */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
            Expected Answer 
            <Badge variant="outline" className="ml-2 text-xs">Instructor Only</Badge>
          </h4>
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="p-3 text-sm">
              {content.expectedAnswer}
            </CardContent>
          </Card>
        </div>

        {/* Grading Notes */}
        {content.gradingNotes && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">
              Grading Notes
              <Badge variant="outline" className="ml-2 text-xs">Instructor Only</Badge>
            </h4>
            <Card className="bg-muted/30">
              <CardContent className="p-3 text-sm text-muted-foreground">
                {content.gradingNotes}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const getTypeIcon = () => {
    switch (question.question_type) {
      case "coding":
      case "coding_simple":
        return <Code className="h-5 w-5 text-primary" />;
      case "multiple_choice":
        return <ListChecks className="h-5 w-5 text-primary" />;
      case "short_answer":
        return <MessageSquare className="h-5 w-5 text-primary" />;
      default:
        return null;
    }
  };

  const getTypeLabel = () => {
    switch (question.question_type) {
      case "coding":
        return "Coding Problem";
      case "coding_simple":
        return "Coding (Simple)";
      case "multiple_choice":
        return "Multiple Choice";
      case "short_answer":
        return "Short Answer";
      default:
        return "Question";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {getTypeIcon()}
            <div>
              <div className="text-lg">{question.title}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{getTypeLabel()}</Badge>
                {question.difficulty && (
                  <Badge 
                    variant="outline"
                    className={cn(
                      question.difficulty === "easy" && "bg-green-500/10 text-green-600 border-green-500/30",
                      question.difficulty === "medium" && "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
                      question.difficulty === "hard" && "bg-red-500/10 text-red-600 border-red-500/30"
                    )}
                  >
                    {question.difficulty}
                  </Badge>
                )}
                {isCodingContent(content) && content.language && (
                  <Badge variant="outline">{content.language}</Badge>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 border-t pt-4">
          <div className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            Student View Preview
          </div>

          {(question.question_type === "coding" || question.question_type === "coding_simple") && 
            renderCodingPreview()}
          {question.question_type === "multiple_choice" && renderMCQPreview()}
          {question.question_type === "short_answer" && renderShortAnswerPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
