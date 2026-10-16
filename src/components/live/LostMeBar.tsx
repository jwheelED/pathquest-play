import { useState, useEffect, useCallback } from "react";
import { CircleHelp, Check, CheckCircle2, Shield } from "lucide-react";

interface LostMeBarProps {
  onLostMe: () => void;
  lostMeSentAt: number | null;
}

export function LostMeBar({ onLostMe, lostMeSentAt }: LostMeBarProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    if (!lostMeSentAt) return;
    setShowConfirmation(true);
    const timeout = setTimeout(() => setShowConfirmation(false), 4000);
    return () => clearTimeout(timeout);
  }, [lostMeSentAt]);

  const handleLostMe = useCallback(() => {
    onLostMe();
  }, [onLostMe]);

  return (
    <footer className="sticky bottom-0 z-30 flex items-center justify-center gap-3 px-6 py-3.5 bg-white/85 backdrop-blur-[16px] border-t border-[hsl(220_15%_88%)]">
      <div className="flex items-center gap-2">
        {showConfirmation ? (
          <button
            disabled
            className="flex items-center gap-2 h-11 px-[22px] rounded-full text-sm font-semibold bg-[hsl(var(--sky-50))] border border-[hsl(var(--sky-100))] text-[hsl(var(--sky-600))] transition-all duration-300"
          >
            <CheckCircle2 className="w-4 h-4" />
            Sent anonymously
          </button>
        ) : (
          <button
            onClick={handleLostMe}
            className="flex items-center gap-2 h-11 px-[22px] rounded-full text-sm font-semibold bg-white border border-[hsl(var(--slate-200))] text-[hsl(var(--ink))] hover:bg-[hsl(var(--slate-50))] hover:border-[hsl(var(--slate-300))] transition-all duration-200"
          >
            <CircleHelp className="w-4 h-4" />
            Lost me
          </button>
        )}

        <button
          className="flex items-center gap-2 h-11 px-[22px] rounded-full text-sm font-semibold bg-transparent text-[hsl(var(--text-muted-live))] hover:bg-[hsl(var(--slate-100))] transition-all duration-200"
        >
          <Check className="w-4 h-4" />
          I'm following
        </button>
      </div>

      <div className="absolute right-6 flex items-center gap-1.5 text-xs text-[hsl(var(--text-subtle))]">
        <Shield className="w-3.5 h-3.5" />
        Always anonymous
      </div>
    </footer>
  );
}
