import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MCQResponse {
  answer: string;
  is_correct: boolean;
}

interface MCQResultsRevealProps {
  questionId: string;
  options: string[];
  responses: MCQResponse[];
  revealKey: number; // bump to replay the sequence
  selectedOptionIdx: number | null;
  onOptionClick: (idx: number | null) => void;
}

// Normalize an answer string to an option index (0..3), or -1
const answerToIdx = (answer: string, options: string[]): number => {
  const trimmed = (answer || "").trim();
  const letterMatch = trimmed.match(/^([A-Da-d])[.):\s]?/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }
  const directIdx = options.findIndex((opt) => {
    const clean = opt.replace(/^[A-Da-d][.):\s]+/, "").trim();
    return clean === trimmed || opt === trimmed;
  });
  return directIdx;
};

const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
};

// Ease-out cubic
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const useCountUp = (target: number, duration: number, start: boolean, reduced: boolean) => {
  const [value, setValue] = useState(reduced || !start ? (reduced ? target : 0) : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    if (!start) {
      setValue(0);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setValue(Math.round(easeOutCubic(p) * target));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, start, reduced]);

  return value;
};

interface BarRowProps {
  letter: string;
  text: string;
  count: number;
  total: number;
  isCorrect: boolean;
  misconceptionLabel: string | null;
  beat: 1 | 2 | 3;
  delayMs: number;
  reduced: boolean;
  selected: boolean;
  anySelected: boolean;
  onClick: () => void;
}

const BarRow = ({
  letter,
  text,
  count,
  total,
  isCorrect,
  misconceptionLabel,
  beat,
  delayMs,
  reduced,
  selected,
  anySelected,
  onClick,
}: BarRowProps) => {
  const [grown, setGrown] = useState(reduced);
  const pct = total > 0 ? (count / total) * 100 : 0;
  const displayPct = Math.round(pct);

  useEffect(() => {
    if (reduced) {
      setGrown(true);
      return;
    }
    setGrown(false);
    const t = setTimeout(() => setGrown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs, reduced, beat]);

  const liveCount = useCountUp(count, 600, grown, reduced);

  const showCorrectEmphasis = beat >= 2 && isCorrect;
  const showIncorrectFade = beat >= 2 && !isCorrect;
  const showMisconception = beat >= 3 && !!misconceptionLabel;
  const pulse = beat === 2 && isCorrect && !reduced;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`Option ${letter}: ${text}. ${count} of ${total} responses${isCorrect ? ", correct answer" : ""}${showMisconception ? `, ${misconceptionLabel}` : ""}. Click to filter responses.`}
        className={cn(
          "w-full flex items-center gap-3 text-left rounded-lg px-2 py-2 transition-all duration-300 group",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
          showIncorrectFade && !selected ? "opacity-85" : "opacity-100",
          anySelected && !selected && "opacity-50",
          selected && "ring-2 ring-emerald-500/40 bg-emerald-50/30",
          pulse && "animate-mcq-pulse",
        )}
      >
        {/* Letter chip */}
        <span
          className={cn(
            "shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-sm font-bold transition-colors",
            showCorrectEmphasis
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-600",
          )}
        >
          {letter}
        </span>

        {/* Bar + text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm text-foreground truncate">{text}</span>
            <div className="flex items-center gap-2 shrink-0">
              {showCorrectEmphasis && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                  Correct
                </span>
              )}
              <span className="text-base font-bold tabular-nums text-foreground">
                {liveCount}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                {grown ? displayPct : 0}%
              </span>
            </div>
          </div>
          <div
            className={cn(
              "h-3 w-full rounded-full overflow-hidden bg-slate-100 relative",
              showCorrectEmphasis && "ring-1 ring-emerald-400/70",
              showMisconception && "ring-1 ring-amber-500",
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] ease-out",
                showCorrectEmphasis ? "bg-emerald-500" : "bg-slate-400",
              )}
              style={{
                width: grown ? `${pct}%` : "0%",
                transitionDuration: reduced ? "0ms" : "600ms",
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>
          {showMisconception && (
            <p className="text-xs italic text-slate-600 mt-1 animate-fade-in">
              {misconceptionLabel}
            </p>
          )}
        </div>
      </button>
    </div>
  );
};

export const MCQResultsReveal = ({
  questionId,
  options,
  responses,
  revealKey,
  selectedOptionIdx,
  onOptionClick,
}: MCQResultsRevealProps) => {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [beat, setBeat] = useState<1 | 2 | 3>(reduced ? 3 : 1);
  const announcedRef = useRef<string>("");
  const [announcement, setAnnouncement] = useState("");

  // Compute counts per option + correct index
  const { counts, correctIdx, total } = useMemo(() => {
    const c = new Array(options.length).fill(0);
    let cIdx = -1;
    for (const r of responses) {
      const idx = answerToIdx(r.answer, options);
      if (idx >= 0) c[idx] += 1;
      if (r.is_correct && cIdx < 0) cIdx = idx;
    }
    return { counts: c, correctIdx: cIdx, total: responses.length };
  }, [responses, options]);

  // Misconception detection — single incorrect option ≥25%
  const { misconceptionIdx, allCorrect, classWideMisconception } = useMemo(() => {
    if (total === 0) return { misconceptionIdx: -1, allCorrect: false, classWideMisconception: false };
    const correctCount = correctIdx >= 0 ? counts[correctIdx] : 0;
    if (correctCount === total) return { misconceptionIdx: -1, allCorrect: true, classWideMisconception: false };

    const incorrectEntries = counts
      .map((n, i) => ({ n, i }))
      .filter(({ i }) => i !== correctIdx);
    const overThreshold = incorrectEntries.filter(({ n }) => n / total >= 0.25);

    if (overThreshold.length === 0) {
      return { misconceptionIdx: -1, allCorrect: false, classWideMisconception: false };
    }
    // Tie among incorrect ≥25% → skip
    const top = overThreshold.reduce((a, b) => (a.n >= b.n ? a : b));
    const tied = overThreshold.filter(({ n }) => n === top.n);
    if (tied.length > 1) {
      return { misconceptionIdx: -1, allCorrect: false, classWideMisconception: false };
    }
    const classWide = top.n === total; // all incorrect responses are this one + no correct
    return { misconceptionIdx: top.i, allCorrect: false, classWideMisconception: classWide };
  }, [counts, correctIdx, total]);

  // Stage timing
  useEffect(() => {
    if (total === 0) return;
    if (reduced) {
      setBeat(3);
      return;
    }
    setBeat(1);
    const t1 = setTimeout(() => setBeat(2), 1000);
    const t2 = setTimeout(() => setBeat(3), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [revealKey, total, reduced]);

  // Screen reader announcement after Beat 3
  useEffect(() => {
    if (beat !== 3 || total === 0) return;
    const correctLetter = correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : "—";
    const correctCount = correctIdx >= 0 ? counts[correctIdx] : 0;
    let msg = `Results revealed. Correct answer was ${correctLetter}. ${correctCount} of ${total} participants answered correctly.`;
    if (misconceptionIdx >= 0) {
      const letter = String.fromCharCode(65 + misconceptionIdx);
      const label = classWideMisconception ? "Class-wide misconception" : "Most common misconception";
      msg += ` ${label}: ${letter} selected by ${counts[misconceptionIdx]} participants.`;
    } else if (correctCount === total) {
      msg += " Full class got it.";
    }
    if (announcedRef.current !== msg + revealKey) {
      announcedRef.current = msg + revealKey;
      setAnnouncement(msg);
    }
  }, [beat, counts, correctIdx, misconceptionIdx, classWideMisconception, total, revealKey]);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-3">
        No responses yet
      </p>
    );
  }

  const correctCount = correctIdx >= 0 ? counts[correctIdx] : 0;
  const fullClassGotIt = correctCount === total && beat >= 2;

  return (
    <div className="space-y-2" key={questionId}>
      <style>{`
        @keyframes mcq-pulse-kf {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .animate-mcq-pulse { animation: mcq-pulse-kf 400ms ease-in-out 1; }
      `}</style>

      {options.map((opt, idx) => {
        const cleanText = opt.replace(/^[A-Da-d][.):\s]+/, "").trim() || opt;
        return (
          <BarRow
            key={idx}
            letter={String.fromCharCode(65 + idx)}
            text={cleanText}
            count={counts[idx]}
            total={total}
            isCorrect={idx === correctIdx}
            misconceptionLabel={
              idx === misconceptionIdx
                ? classWideMisconception
                  ? "Class-wide misconception"
                  : "Most common misconception"
                : null
            }
            beat={beat}
            delayMs={reduced ? 0 : idx * 100}
            reduced={reduced}
            selected={selectedOptionIdx === idx}
            anySelected={selectedOptionIdx !== null}
            onClick={() => onOptionClick(selectedOptionIdx === idx ? null : idx)}
          />
        );
      })}


      {fullClassGotIt && (
        <p className="text-xs font-medium text-emerald-600 text-center pt-1 animate-fade-in">
          Full class got it
        </p>
      )}

      {/* Live region for screen readers */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  );
};
