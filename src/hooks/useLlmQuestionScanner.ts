import { useCallback, useEffect, useRef } from "react";
import { trackQuestionDetectionDrop } from "@/lib/posthogTracking";

export type ScannerFormat = "multiple_choice" | "short_answer" | "poll" | "coding";

export interface ScannerDetection {
  question: string;
  format: ScannerFormat;
  options?: string[];
  correctAnswer?: "A" | "B" | "C" | "D";
  expectedAnswer?: string;
  explanation?: string;
  priorContext: string;
}

export interface ScanRequest {
  contextText: string;
  newText: string;
  recentlySent: string[];
}

export type ScanResponse =
  | ({ detected: true } & Omit<ScannerDetection, "priorContext">)
  | { detected: false; failed?: boolean; reason?: string };

interface Options {
  enabled: boolean;
  scan: (req: ScanRequest) => Promise<ScanResponse>;
  onDetected: (d: ScannerDetection) => void;
  /** Called when a scan errors so the caller can let classic detection through. */
  onScanFailed?: () => void;
  pauseMs?: number;
  /** How long the live (interim) text must stay unchanged before it's scanned. */
  interimPauseMs?: number;
  wordTrigger?: number;
  minGapMs?: number;
  contextWindowMs?: number;
  getRecentlySent?: () => string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Token-overlap similarity (Jaccard) — used to drop repeats of the same question. */
export function questionSimilarity(a: string, b: string): number {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

/**
 * Pause-based AI scanner. Buffers transcript lines and, when the instructor
 * pauses (or after ~N new words), asks the AI whether a question was just
 * asked. One scan in flight at a time, with a minimum gap between scans.
 *
 * Deepgram can hold a FINAL line for several seconds when the room isn't
 * silent, so the live (interim) text also counts: if it stops changing for
 * `interimPauseMs`, it is scanned right away and the matching FINAL is skipped.
 */
export function useLlmQuestionScanner({
  enabled,
  scan,
  onDetected,
  onScanFailed,
  pauseMs = 500,
  interimPauseMs = 1100,
  wordTrigger = 35,
  minGapMs = 1000,
  contextWindowMs = 60_000,
  getRecentlySent,
}: Options) {
  const lines = useRef<{ text: string; at: number }[]>([]);
  const pendingText = useRef<string>("");
  const interimText = useRef<string>("");
  const scannedInterim = useRef<string>("");
  const inFlight = useRef(false);
  const lastScanAt = useRef(0);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detected = useRef<string[]>([]);
  const cbs = useRef({ scan, onDetected, onScanFailed, getRecentlySent });
  cbs.current = { scan, onDetected, onScanFailed, getRecentlySent };
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const clearTimers = () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    if (gapTimer.current) clearTimeout(gapTimer.current);
    pauseTimer.current = null;
    gapTimer.current = null;
  };

  /** Speech not yet sent to the AI: pending FINAL lines plus unscanned live text. */
  const unscanned = () => {
    const interim = interimText.current;
    const includeInterim = !!interim && interim !== scannedInterim.current;
    return { text: `${pendingText.current} ${includeInterim ? interim : ""}`.trim(), interim: includeInterim ? interim : "" };
  };

  const runScan = useCallback(async () => {
    if (!enabledRef.current || inFlight.current) return;
    const { text: newText, interim } = unscanned();
    if (words(newText) < 2) return;
    const wait = minGapMs - (Date.now() - lastScanAt.current);
    if (wait > 0) {
      if (!gapTimer.current) {
        gapTimer.current = setTimeout(() => { gapTimer.current = null; void runScan(); }, wait);
      }
      return;
    }
    const now = Date.now();
    const context = lines.current
      .filter((l) => now - l.at <= contextWindowMs)
      .map((l) => l.text)
      .join(" ");
    const pending = pendingText.current.trim();
    const contextText = pending && context.endsWith(pending) ? context.slice(0, context.length - pending.length).trim() : context;
    pendingText.current = "";
    if (interim) scannedInterim.current = interim;
    inFlight.current = true;
    lastScanAt.current = now;
    const sent = cbs.current.getRecentlySent?.() ?? [];
    try {
      const res = await cbs.current.scan({ contextText, newText, recentlySent: [...detected.current.slice(-3), ...sent].slice(0, 5) });
      if (res.detected) {
        const dup = [...detected.current, ...sent].some((q) => questionSimilarity(q, res.question) >= 0.7);
        if (!dup) {
          detected.current = [...detected.current.slice(-9), res.question];
          const { detected: _d, ...rest } = res;
          cbs.current.onDetected({ ...rest, priorContext: contextText });
        } else {
          trackQuestionDetectionDrop('duplicate', { path: 'ai_scan', text: res.question });
        }
      } else if ("failed" in res && res.failed) {
        cbs.current.onScanFailed?.();
      }
    } catch {
      cbs.current.onScanFailed?.();
    } finally {
      inFlight.current = false;
      // Speech that arrived during the scan gets its own turn right away if the
      // instructor already paused (its pause timer fired while we were busy)
      // or it's long — otherwise its pending pause timer will run it.
      const pendingWords = words(unscanned().text);
      if (pendingWords >= wordTrigger || (pendingWords >= 2 && !pauseTimer.current)) void runScan();
    }
  }, [minGapMs, contextWindowMs, wordTrigger]);

  const armPause = useCallback((ms: number) => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => { pauseTimer.current = null; void runScan(); }, ms);
  }, [runScan]);

  /** FINAL transcript line. */
  const feed = useCallback((text: string) => {
    if (!enabledRef.current || !text.trim()) return;
    const t = text.trim();
    const now = Date.now();
    lines.current = [...lines.current.filter((l) => now - l.at <= contextWindowMs), { text: t, at: now }];
    // Already scanned from the live text? Keep it as context only.
    const covered = !!scannedInterim.current && questionSimilarity(t, scannedInterim.current) >= 0.8;
    interimText.current = "";
    scannedInterim.current = "";
    if (covered) {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      pauseTimer.current = null;
      if (words(pendingText.current) >= 2) armPause(pauseMs);
      return;
    }
    pendingText.current = `${pendingText.current} ${t}`.trim();
    if (words(pendingText.current) >= wordTrigger) {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      pauseTimer.current = null;
      void runScan();
      return;
    }
    armPause(pauseMs);
  }, [armPause, contextWindowMs, pauseMs, runScan, wordTrigger]);

  /** Live (interim) transcript text for the current utterance. */
  const feedInterim = useCallback((text: string) => {
    if (!enabledRef.current) return;
    const t = text.trim();
    if (!t || norm(t) === norm(interimText.current)) return; // unchanged → keep counting the pause
    interimText.current = t;
    armPause(interimPauseMs);
  }, [armPause, interimPauseMs]);

  const reset = useCallback(() => {
    clearTimers();
    lines.current = [];
    pendingText.current = "";
    interimText.current = "";
    scannedInterim.current = "";
  }, []);

  useEffect(() => () => clearTimers(), []);
  useEffect(() => { if (!enabled) reset(); }, [enabled, reset]);

  return { feed, feedInterim, reset };
}
