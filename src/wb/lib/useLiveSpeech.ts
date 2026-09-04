/**
 * useLiveSpeech — live, on-device preview of what the student is saying.
 *
 * Uses the browser's built-in SpeechRecognition (no network AI service, no
 * gateway) purely to show words as they are spoken. The authoritative
 * transcript still comes from the existing wb-transcribe (Deepgram) call when
 * the clip is finished — this is display only.
 *
 * Silently no-ops on browsers without SpeechRecognition (Firefox).
 */
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface ResultsEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export function useLiveSpeech() {
  const [liveText, setLiveText] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const latestRef = useRef("");
  const wantRef = useRef(false);
  const supported = getCtor() !== null;

  /** Latest recognized text, readable synchronously (state may lag). */
  const getText = useCallback(() => latestRef.current.trim(), []);

  const start = useCallback(() => {

    const Ctor = getCtor();
    if (!Ctor) return;
    finalRef.current = "";
    setLiveText("");
    wantRef.current = true;
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        const e = event as ResultsEvent;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalRef.current += r[0].transcript;
          else interim += r[0].transcript;
        }
        setLiveText((finalRef.current + interim).trimStart());
      };
      rec.onerror = () => {};
      rec.onend = () => {
        // Chrome ends the session on pauses — restart while still recording.
        if (wantRef.current) {
          try {
            rec.start();
          } catch {
            /* already starting */
          }
        }
      };
      rec.start();
      recRef.current = rec;
    } catch {
      /* recognition unavailable — preview stays empty */
    }
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
    recRef.current = null;
  }, []);

  const clear = useCallback(() => {
    finalRef.current = "";
    setLiveText("");
  }, []);

  useEffect(() => {
    return () => {
      wantRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { liveText, supported, start, stop, clear };
}
