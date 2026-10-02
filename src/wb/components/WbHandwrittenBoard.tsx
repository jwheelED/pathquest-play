/**
 * WbHandwrittenBoard — the tutor's real writing surface.
 *
 * Board steps are rendered as marker handwriting on ruled paper and ink in
 * left-to-right at a natural writing pace, with a pen tip riding the wipe
 * edge. Lines that have already been written stay fully inked across
 * re-renders (tracked via the shared `revealedIds` set).
 *
 * Purely presentational — the tutor turn that produces the steps is unchanged.
 */
import React, { useEffect, useRef, useState } from "react";
import { T, FONT_HAND } from "@/components/edvana/tokens";
import type { WbBoardStep, Provenance } from "../lib/wbTypes";

const inkColor: Record<Provenance, string> = {
  from_you: "hsl(220 30% 22%)",
  corrected: T.amberText,
  self_corrected: T.emerald700,
  you_drew: "hsl(220 30% 22%)",
  answer: T.emerald700,
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function WbHandwrittenBoard({
  steps,
  revealedIds,
  writing,
  emptyHint,
  children,
}: {
  steps: WbBoardStep[];
  revealedIds: React.MutableRefObject<Set<string>>;
  writing: boolean;
  emptyHint: string;
  /** Problem card rendered at the top of the paper. */
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: 300,
        padding: "26px 30px 34px 74px",
        background: `
          repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 43px,
            hsl(210 40% 70% / 0.20) 43px,
            hsl(210 40% 70% / 0.20) 44px
          ),
          radial-gradient(120% 80% at 20% 0%, hsl(45 40% 99%) 0%, hsl(42 30% 97.5%) 60%, hsl(40 22% 96%) 100%)
        `,
      }}
    >
      {/* Margin rule */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 56,
          width: 1,
          background: "hsl(0 55% 60% / 0.28)",
        }}
      />

      {children}

      {steps.length === 0 && !writing && (
        <div
          style={{
            fontFamily: FONT_HAND,
            fontSize: 22,
            color: "hsl(220 12% 62%)",
            paddingTop: 6,
          }}
        >
          {emptyHint}
        </div>
      )}

      {steps.map((s) => (
        <HandwrittenLine key={s.id} step={s} revealedIds={revealedIds} />
      ))}

      {writing && <PenIdle />}
    </div>
  );
}

function HandwrittenLine({
  step,
  revealedIds,
}: {
  step: WbBoardStep;
  revealedIds: React.MutableRefObject<Set<string>>;
}) {
  const already = revealedIds.current.has(step.id);
  const reduced = prefersReducedMotion();
  const instant = already || reduced;

  const [progress, setProgress] = useState(instant ? 1 : 0);
  const textRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step.content]);

  useEffect(() => {
    if (instant) {
      revealedIds.current.add(step.id);
      return;
    }
    const chars = Math.max(step.content.length, 1);
    // Natural writing pace: ~24 chars/second, jittered a touch per line.
    const total = Math.min(4200, Math.max(700, chars * (34 + Math.random() * 16)));
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / total);
      // Slight ease so the pen slows into the end of the line.
      setProgress(p < 1 ? p - Math.sin(p * Math.PI * 6) * 0.012 : 1);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        revealedIds.current.add(step.id);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const done = progress >= 1;
  const color = inkColor[step.provenance] ?? T.ink22;
  const penX = width * Math.max(0, Math.min(1, progress));

  return (
    <div style={{ position: "relative", padding: "6px 0 10px" }}>
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
        <span
          ref={textRef}
          style={{
            display: "inline-block",
            fontFamily: FONT_HAND,
            fontSize: 30,
            lineHeight: 1.45,
            letterSpacing: "0.01em",
            color,
            transform: `rotate(${(hashOf(step.id) % 7) / 100 - 0.03}deg)`,
            clipPath: done ? "none" : `inset(-20% ${(1 - progress) * 100}% -20% -2%)`,
            whiteSpace: "pre-wrap",
          }}
        >
          {step.content}
        </span>

        {!done && width > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: penX,
              bottom: 6,
              width: 3,
              height: 22,
              borderRadius: 2,
              background: color,
              opacity: 0.65,
              transform: "rotate(12deg)",
            }}
          />
        )}

        {step.struck_through && width > 0 && (
          <svg
            aria-hidden
            width={width}
            height={14}
            viewBox={`0 0 ${Math.max(width, 1)} 14`}
            preserveAspectRatio="none"
            style={{ position: "absolute", left: 0, top: "50%", marginTop: -4, overflow: "visible" }}
          >
            <path
              d={strikePath(width)}
              fill="none"
              stroke={T.amberStrike}
              strokeWidth={2.4}
              strokeLinecap="round"
              style={{
                strokeDasharray: width + 30,
                strokeDashoffset: done ? 0 : width + 30,
                transition: reducedSafeTransition(),
              }}
            />
          </svg>
        )}
      </div>

      {step.annotation && done && (
        <div
          style={{
            fontFamily: FONT_HAND,
            fontSize: 17,
            color: T.amberText,
            marginTop: 2,
            transform: "rotate(-0.6deg)",
          }}
        >
          {step.annotation}
        </div>
      )}
    </div>
  );
}

function PenIdle() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0" }}>
      <span
        className="edv-pulse"
        style={{ width: 3, height: 22, borderRadius: 2, background: T.emerald500, transform: "rotate(12deg)" }}
      />
      <span style={{ fontFamily: FONT_HAND, fontSize: 20, color: T.textSubtle }}>
        Edvana is writing…
      </span>
    </div>
  );
}

/** Slightly wobbly hand-drawn strike across the line. */
function strikePath(w: number): string {
  const mid = w / 2;
  return `M 0 7 Q ${mid * 0.5} 4.2 ${mid} 6.4 T ${w} 5.2`;
}

function reducedSafeTransition(): string {
  return prefersReducedMotion() ? "none" : "stroke-dashoffset 520ms ease-out";
}

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
