import { ArrowRight, Lightbulb, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FeedbackData } from "./useSessionState";

interface FeedbackCardProps {
  feedback: FeedbackData;
  onDismiss: () => void;
}

export function FeedbackCard({ feedback, onDismiss }: FeedbackCardProps) {
  const { wasCorrect, selectedAnswer, correctAnswer, explanation, sameAnswerPct } = feedback;

  return (
    <div className="w-full max-w-[720px] mx-auto bg-white rounded-[var(--radius-xl)] shadow-md p-[30px_32px] flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-subtle))]">
          Your response
        </span>
        <h2 className="text-[32px] font-bold tracking-[-0.02em] text-[hsl(var(--ink))]">
          {wasCorrect ? (
            "Nice work!"
          ) : (
            <>
              You found a{" "}
              <span className="text-[hsl(var(--primary))]">misconception.</span>
            </>
          )}
        </h2>
        <p className="text-sm text-[hsl(var(--text-muted-live))]">
          You chose {selectedAnswer}
          {!wasCorrect && `. The answer is ${correctAnswer}.`}
        </p>
      </div>

      {/* Answer comparison */}
      {!wasCorrect && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <AnswerTile letter={selectedAnswer} variant="incorrect" />
          <ArrowRight className="w-5 h-5 text-[hsl(var(--slate-400))]" />
          <AnswerTile letter={correctAnswer} variant="correct" />
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div className="flex gap-3 p-4 rounded-[var(--radius-lg)] bg-[hsl(var(--slate-50))]">
          <Lightbulb className="w-5 h-5 shrink-0 text-[hsl(var(--amber-strong))] mt-0.5" />
          <p className="text-sm leading-relaxed text-[hsl(var(--text-muted-live))]">{explanation}</p>
        </div>
      )}

      {/* Room stats */}
      <div className="flex items-center justify-between text-sm">
        {sameAnswerPct !== null && (
          <span className="flex items-center gap-2 text-[hsl(var(--sky-500))]">
            <Users className="w-4 h-4" />
            <span>
              <strong>You weren't alone.</strong> {sameAnswerPct}% of the class made the same choice.
            </span>
          </span>
        )}
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function AnswerTile({ letter, variant }: { letter: string; variant: "correct" | "incorrect" }) {
  return (
    <div
      className={`flex items-center justify-center h-16 rounded-[var(--radius-lg)] text-2xl font-bold ${
        variant === "correct"
          ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] text-[hsl(var(--primary))]"
          : "border border-[hsl(var(--slate-200))] bg-[hsl(var(--slate-50))] text-[hsl(var(--slate-400))]"
      }`}
    >
      {letter}
    </div>
  );
}
