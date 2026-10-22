import { useCallback, useEffect, useRef } from "react";

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
 * Pause-based AI scanner. Buffers final transcript lines and, when the
 * instructor pauses (or after ~N new words), asks the AI whether a question
 * was just asked. One scan in flight at a time, with a minimum gap between scans.
 */
export function useLlmQuestionScanner({
  enabled,
  scan,
  onDetected,
  onScanFailed,
  pauseMs = 1600,
  wordTrigger = 35,
  minGapMs = 4000,
  contextWindowMs = 60_000,
  getRecentlySent,
}: Options) {
  const lines = useRef<{ text: string; at: number }[]>([]);
  const pendingText = useRef<string>("");
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

  const runScan = useCallback(async () => {
    if (!enabledRef.current || inFlight.current) return;
    const newText = pendingText.current.trim();
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
    const contextText = context.endsWith(newText) ? context.slice(0, context.length - newText.length).trim() : context;
    pendingText.current = "";
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
        }
      } else if (res.failed) {
        cbs.current.onScanFailed?.();
      }
    } catch {
      cbs.current.onScanFailed?.();
    } finally {
      inFlight.current = false;
      // Speech that arrived during the scan gets its own turn.
      if (words(pendingText.current) >= wordTrigger) void runScan();
    }
  }, [minGapMs, contextWindowMs, wordTrigger]);

  const feed = useCallback((text: string) => {
    if (!enabledRef.current || !text.trim()) return;
    const now = Date.now();
    lines.current = [...lines.current.filter((l) => now - l.at <= contextWindowMs), { text: text.trim(), at: now }];
    pendingText.current = `${pendingText.current} ${text.trim()}`.trim();
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    if (words(pendingText.current) >= wordTrigger) {
      pauseTimer.current = null;
      void runScan();
      return;
    }
    pauseTimer.current = setTimeout(() => { pauseTimer.current = null; void runScan(); }, pauseMs);
  }, [contextWindowMs, pauseMs, runScan, wordTrigger]);

  const reset = useCallback(() => {
    clearTimers();
    lines.current = [];
    pendingText.current = "";
  }, []);

  useEffect(() => () => clearTimers(), []);
  useEffect(() => { if (!enabled) reset(); }, [enabled, reset]);

  return { feed, reset };
}
