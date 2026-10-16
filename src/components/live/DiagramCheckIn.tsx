import { Timer, Send, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageBanner } from "./ImageBanner";
import { ConfidenceRow } from "./ConfidenceRow";
import type { LiveQuestion } from "./useSessionState";

interface DiagramCheckInProps {
  question: LiveQuestion;
  selectedOption: string | null;
  confidence: number | null;
  timeLeft: number;
  onSelectOption: (opt: string) => void;
  onSelectConfidence: (c: number) => void;
  onSubmit: () => void;
}

export function DiagramCheckIn({
  question,
  selectedOption,
  confidence,
  timeLeft,
  onSelectOption,
  onSelectConfidence,
  onSubmit,
}: DiagramCheckInProps) {
  const qc = question.question_content;
  const options = qc.options || [];
  const canSubmit = selectedOption !== null && confidence !== null;
  const timerStr = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-[780px] mx-auto flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top row: diagram + quote */}
      <div className="grid grid-cols-[1fr_250px] gap-3 h-[190px]">
        <div className="rounded-[var(--radius-xl)] overflow-hidden">
          <ImageBanner imageUrl={question.image_url} imageStatus={question.image_status} />
        </div>
        <div className="flex flex-col gap-2 p-4 bg-white rounded-[var(--radius-xl)] border border-[hsl(var(--slate-200))]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-subtle))]">
            From the lecture
          </span>
          <div className="flex-1 flex items-start gap-2">
            <Quote className="w-4 h-4 shrink-0 text-[hsl(var(--emerald-300))] mt-0.5" />
            <p className="text-sm text-[hsl(var(--text-muted-live))] leading-relaxed line-clamp-5 italic">
              {qc.question}
            </p>
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className="bg-white rounded-[var(--radius-xl)] shadow-md p-5 px-7 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--sky-600))]">
              Application
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--slate-100))] text-[13px] font-mono text-[hsl(var(--ink))]">
            <Timer className="w-3.5 h-3.5" />
            {timerStr}
          </div>
        </div>

        <h2 className="text-[22px] font-semibold tracking-[-0.015em] leading-[1.3] text-[hsl(var(--ink))]">
          {qc.question}
        </h2>

        {options.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {options.map((opt) => {
              const letter = opt.charAt(0);
              const text = opt.replace(/^[A-D][\).\-\s]+\s*/i, "").trim();
              const isSelected = selectedOption === letter;
              return (
                <button
                  key={letter}
                  onClick={() => onSelectOption(letter)}
                  className={`flex items-start gap-3 p-3.5 rounded-[var(--radius-lg)] border text-left transition-all duration-200 ${
                    isSelected
                      ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]"
                      : "border-[hsl(var(--slate-200))] bg-white hover:bg-[hsl(var(--slate-50))]"
                  }`}
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-semibold ${
                      isSelected
                        ? "bg-[hsl(var(--primary))] text-white"
                        : "bg-[hsl(var(--slate-100))] text-[hsl(var(--text-muted-live))]"
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="text-sm leading-snug text-[hsl(var(--ink))] pt-0.5">{text}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Confidence strip */}
        <div className="p-3 bg-[hsl(var(--slate-50))] rounded-[var(--radius-lg)] flex items-center gap-4">
          <ConfidenceRow selected={confidence} onSelect={onSelectConfidence} />
          <Button onClick={onSubmit} disabled={!canSubmit} size="sm" className="shrink-0 gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
