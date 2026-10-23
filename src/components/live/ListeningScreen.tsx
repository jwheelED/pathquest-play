import { useEffect, useState } from "react";
import edvanaMark from "@/assets/edvana/edvana-mark.png";

export function ListeningScreen() {
  const prefersReduced = usePrefersReducedMotion();

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-7 px-4 py-12">
      {/* Breathing spiral rings */}
      <div className="relative w-60 h-60 flex items-center justify-center">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute rounded-full border border-[hsl(var(--emerald-300))] bg-[hsl(var(--emerald-100)/0.15)]"
            style={{
              width: `${240 - i * 56}px`,
              height: `${240 - i * 56}px`,
              opacity: 0.6 - i * 0.1,
              animation: prefersReduced
                ? "none"
                : `breathe 5s ease-in-out infinite ${i * 0.7}s`,
            }}
          />
        ))}
        <img
          src={edvanaMark}
          alt=""
          className="relative w-14 h-14 drop-shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
        />
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-3 text-center max-w-[420px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--emerald-700))]">
          Edvana Live
        </span>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-[hsl(var(--ink))]">
          Listening with your class
        </h1>
        <p className="text-[15px] text-[hsl(var(--text-muted-live))] leading-relaxed">
          Following the lecture and looking for a moment worth checking. You'll see it here.
        </p>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap justify-center gap-2">
        <StatusChip label="Following the lecture" />
        <StatusChip label="Finding key concepts" />
        <StatusChip label="Preparing a check-in" active pulsing={!prefersReduced} />
      </div>
    </div>
  );
}

function StatusChip({
  label,
  active,
  pulsing,
}: {
  label: string;
  active?: boolean;
  pulsing?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
        active
          ? "bg-[hsl(var(--emerald-50))] border border-[hsl(var(--emerald-100))] text-[hsl(var(--emerald-700))]"
          : "bg-white border border-[hsl(var(--slate-200))] text-[hsl(var(--text-muted-live))]"
      }`}
    >
      {pulsing && (
        <span className="relative flex h-[7px] w-[7px]">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--emerald-500))] opacity-75" />
          <span className="relative inline-flex rounded-full h-[7px] w-[7px] bg-[hsl(var(--emerald-500))]" />
        </span>
      )}
      {label}
    </span>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
