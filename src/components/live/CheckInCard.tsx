import { Timer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageBanner } from "./ImageBanner";
import { ConfidenceRow } from "./ConfidenceRow";
import type { LiveQuestion } from "./useSessionState";
import { stripOptionLabel } from "@/lib/optionLabel";

interface CheckInCardProps {
  question: LiveQuestion;
  selectedOption: string | null;
  confidence: number | null;
  timeLeft: number;
  onSelectOption: (opt: string) => void;
  onSelectConfidence: (c: number) => void;
  onSubmit: () => void;
}

export function CheckInCard({
  question,
  selectedOption,
  confidence,
  timeLeft,
  onSelectOption,
  onSelectConfidence,
  onSubmit,
}: CheckInCardProps) {
  const qc = question.question_content;
  const options = qc.options || [];
  const canSubmit = !!selectedOption && selectedOption.trim() !== "" && confidence !== null;
  const timerStr = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-[780px] mx-auto bg-white rounded-[var(--radius-xl)] shadow-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Image banner */}
      {question.image_kind && (
        <ImageBanner imageUrl={question.image_url} imageStatus={question.image_status} />
      )}

      {/* Body */}
      <div className="p-5 px-7 flex flex-col gap-3.5">
        {/* Meta row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--emerald-700))]">
              {qc.type === "multiple_choice" ? "Check-in" : qc.type === "poll" ? "Poll" : "Question"}
            </span>
            <span className="text-xs text-[hsl(var(--text-subtle))]">From the last few minutes</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--slate-100))] text-[13px] font-mono text-[hsl(var(--ink))]">
            <Timer className="w-3.5 h-3.5" />
            {timerStr}
          </div>
        </div>

        {/* Question */}
        <h2 className="text-[22px] font-semibold tracking-[-0.015em] leading-[1.3] text-[hsl(var(--ink))]">
          {qc.question}
        </h2>

        {/* MCQ options: 2x2 grid */}
        {options.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {options.map((opt) => {
              const letter = opt.charAt(0);
              const text = stripOptionLabel(opt);
              const isSelected = selectedOption === letter;
              return (
                <button
                  key={letter}
                  onClick={() => onSelectOption(letter)}
                  className={`flex items-start gap-3 p-3.5 rounded-[var(--radius-lg)] border text-left transition-all duration-200 ${
                    isSelected
                      ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] shadow-[0_0_0_6px_rgba(16,185,129,.22)]"
                      : "border-[hsl(var(--slate-200))] bg-white hover:bg-[hsl(var(--slate-50))] hover:border-[hsl(var(--slate-300))]"
                  }`}
                  style={{
                    transform: isSelected ? "scale(0.98)" : "scale(1)",
                  }}
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

        {/* Written answer for short-answer / coding questions */}
        {options.length === 0 && (
          <textarea
            aria-label="Your answer"
            value={selectedOption ?? ""}
            onChange={(e) => onSelectOption(e.target.value)}
            placeholder={qc.type === "coding" ? "Write your code here…" : "Type your answer…"}
            rows={qc.type === "coding" ? 8 : 4}
            className={`w-full rounded-[var(--radius-lg)] border border-[hsl(var(--slate-200))] bg-white p-3 text-sm text-[hsl(var(--ink))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] ${qc.type === "coding" ? "font-mono" : ""}`}
          />
        )}

        {/* Divider */}
        <div className="w-full h-px bg-[hsl(var(--slate-200))]" />

        {/* Confidence + Submit */}
        <ConfidenceRow selected={confidence} onSelect={onSelectConfidence} />

        <Button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full gap-2 h-11"
        >
          <Send className="w-4 h-4" />
          Submit
        </Button>
      </div>
    </div>
  );
}
