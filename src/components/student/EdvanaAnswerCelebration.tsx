import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { playMasteryChime, playReflectTone } from "@/lib/audioNotification";

export type CelebrationTier = "soft" | "lift" | "soar";

interface EdvanaAnswerCelebrationProps {
  /** Set to a unique key each time you want to fire a celebration */
  trigger: number | null;
  isCorrect: boolean;
  /** Confidence multiplier (0.5–3.0). Determines tier for correct answers. */
  multiplier?: number;
  /** Optional message override */
  message?: string;
}

function getTier(multiplier: number): CelebrationTier {
  if (multiplier >= 2.5) return "soar";
  if (multiplier >= 1.5) return "lift";
  return "soft";
}

const CORRECT_PHRASES = [
  "Mastery moment",
  "Locked in",
  "On the path",
  "Crystal clear",
  "That's the signal",
];

const REFLECT_PHRASES = [
  "Worth revisiting",
  "Almost — let's reflect",
  "A learning moment",
  "Stay with it",
];

export function EdvanaAnswerCelebration({
  trigger,
  isCorrect,
  multiplier = 1,
  message,
}: EdvanaAnswerCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const [phrase, setPhrase] = useState("");
  const tier = getTier(multiplier);

  useEffect(() => {
    if (trigger === null) return;
    const pool = isCorrect ? CORRECT_PHRASES : REFLECT_PHRASES;
    setPhrase(message || pool[Math.floor(Math.random() * pool.length)]);
    setVisible(true);

    if (isCorrect) playMasteryChime(tier);
    else playReflectTone();

    // Haptic where supported
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(isCorrect ? (tier === "soar" ? [12, 40, 18] : [10]) : [22]);
      } catch {}
    }

    const dur = isCorrect ? (tier === "soar" ? 2200 : 1700) : 1500;
    const t = setTimeout(() => setVisible(false), dur);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (!visible || trigger === null) return null;

  // Tier-driven visuals
  const ringColor = isCorrect
    ? tier === "soar"
      ? "bg-emerald-400/40"
      : tier === "lift"
      ? "bg-emerald-400/30"
      : "bg-emerald-400/25"
    : "bg-indigo-300/25";

  const glowColor = isCorrect
    ? tier === "soar"
      ? "shadow-[0_0_120px_40px_rgba(16,185,129,0.55)]"
      : tier === "lift"
      ? "shadow-[0_0_90px_30px_rgba(16,185,129,0.42)]"
      : "shadow-[0_0_60px_18px_rgba(16,185,129,0.32)]"
    : "shadow-[0_0_60px_18px_rgba(99,102,241,0.28)]";

  const markSize = tier === "soar" ? "w-40 h-40" : tier === "lift" ? "w-32 h-32" : "w-24 h-24";

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Soft scrim */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          isCorrect ? "bg-emerald-50/30" : "bg-slate-900/5"
        )}
      />

      {/* Concentric pulses (centered with translate origin in keyframes) */}
      <span
        className={cn(
          "absolute left-1/2 top-1/2 rounded-full animate-edvana-pulse-1",
          ringColor,
          tier === "soar" ? "w-64 h-64" : "w-52 h-52"
        )}
      />
      <span
        className={cn(
          "absolute left-1/2 top-1/2 rounded-full animate-edvana-pulse-2",
          ringColor,
          tier === "soar" ? "w-96 h-96" : "w-72 h-72"
        )}
      />
      {tier === "soar" && isCorrect && (
        <span className="absolute left-1/2 top-1/2 rounded-full bg-emerald-400/15 w-[32rem] h-[32rem] animate-edvana-pulse-3" />
      )}

      {/* Edvana mark */}
      <div className="relative flex flex-col items-center gap-4 animate-edvana-rise">
        <div
          className={cn(
            "relative rounded-full flex items-center justify-center",
            glowColor,
            !isCorrect && "grayscale-[0.4] opacity-90"
          )}
        >
          <img
            src={edvanaMark}
            alt=""
            aria-hidden="true"
            className={cn(
              markSize,
              "object-contain drop-shadow-xl",
              isCorrect ? "animate-edvana-spin-soft" : "animate-edvana-breath"
            )}
          />
        </div>

        {/* Caption */}
        <div className="text-center">
          <p
            className={cn(
              "text-xs uppercase tracking-[0.28em] font-semibold mb-1",
              isCorrect ? "text-emerald-700/80" : "text-indigo-700/70"
            )}
          >
            {isCorrect ? "Edvana" : "Reflect"}
          </p>
          <p
            className={cn(
              "font-semibold",
              isCorrect ? "text-emerald-900" : "text-slate-700",
              tier === "soar" ? "text-2xl" : "text-xl"
            )}
          >
            {phrase}
          </p>
          {isCorrect && tier !== "soft" && (
            <p className="text-xs text-amber-700/90 mt-1.5 font-medium">
              ✦ {multiplier.toFixed(1)}× confidence payoff
            </p>
          )}
        </div>
      </div>

      {/* Streak Spark — amber flame for high-tier */}
      {isCorrect && tier === "soar" && (
        <>
          <span className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-amber-400 animate-edvana-spark-1" />
          <span className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-amber-300 animate-edvana-spark-2" />
          <span className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-orange-400 animate-edvana-spark-3" />
        </>
      )}
    </div>
  );
}
