/** Live working session — typed AND voice, with real tutor loop + persistence. */
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Sparkles, Send, Loader2, Mic, Keyboard, Volume2 } from "lucide-react";
import { T, FONT_MONO } from "@/components/edvana/tokens";
import { Button, Card, Eyebrow, StatTile } from "@/components/edvana/primitives";
import { SYMBOL_KEYS, MODE_COPY } from "@/components/edvana/data";
import { WbChrome } from "../components/WbChrome";
import { WbHandwrittenBoard } from "../components/WbHandwrittenBoard";
import { useDemoIdentity } from "../lib/demoIdentity";
import { wb, wbInvokeBinary, wbFetchJson, wbFetchAudio } from "../lib/wbClient";
import {
  ensureVariant,
  ensureSession,
  useSessionBundle,
  callTutorTurn,
  persistTurn,
  finishSession,
  TutorTurn,
} from "../lib/wbData";
import type { WbBoardStep, WbProblem, WbSession, WbVariant, Provenance } from "../lib/wbTypes";

const START_CLOCK = 154;

const provColor: Record<Provenance, string> = {
  from_you: T.textSubtle,
  corrected: T.amberText,
  self_corrected: T.emerald700,
  you_drew: T.textSubtle,
  answer: T.emerald700,
};

type SessionMode = "type" | "talk";
type VoiceStatus = "idle" | "recording" | "transcribing" | "thinking" | "speaking";

function useProblem(problemId: string | undefined) {
  return useQuery({
    queryKey: ["wb", "problem", problemId],
    enabled: !!problemId,
    queryFn: async (): Promise<WbProblem | null> => {
      const { data, error } = await wb
        .from("whiteboard_problems")
        .select("*")
        .eq("id", problemId!)
        .maybeSingle();
      if (error) throw error;
      return (data as WbProblem | null) ?? null;
    },
  });
}

export default function WbLiveSession() {
  const { problemId } = useParams();
  const { current } = useDemoIdentity();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: problem } = useProblem(problemId);
  const [variant, setVariant] = useState<WbVariant | null>(null);
  const [session, setSession] = useState<WbSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const [mode, setMode] = useState<SessionMode>("type");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [clock, setClock] = useState(START_CLOCK);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playFallback, setPlayFallback] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: bundle, refetch } = useSessionBundle(session?.id);
  const steps = bundle?.steps ?? [];
  const transcript = bundle?.transcript ?? [];
  const revealedIds = useRef<Set<string>>(new Set());

  // Bootstrap: variant + session for this student/problem.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!problem || !current) return;
      try {
        setBooting(true);
        const v = await ensureVariant(problem, current.id);
        const s = await ensureSession(problem, current.id, v, "type");
        if (cancelled) return;
        setVariant(v);
        setSession(s);
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : "Failed to start session");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problem, current]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  // Stop any recording/audio on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const askText =
    session?.current_ask ??
    (variant ? `Let's work it. Walk me through your first step for: ${variant.prompt_text}` : "");

  /** Shared tail: persist a completed turn and refresh local state. Used by both typed and voice paths. */
  const finalizeTurn = async (studentMessage: string, turn: TutorTurn) => {
    if (!session) return;
    await persistTurn({
      session,
      studentName: current?.full_name.split(" ")[0] ?? "You",
      studentMessage,
      clockSeconds: clock,
      nextPositionBoard: steps.length,
      nextPositionTranscript: transcript.length,
      turn,
    });
    setClock((c) => c + 28);
    const { data: fresh } = await wb.from("whiteboard_sessions").select("*").eq("id", session.id).maybeSingle();
    if (fresh) setSession(fresh as WbSession);
    await refetch();
  };

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !session || !problem || !variant || sending) return;
    setSending(true);
    try {
      const turn = await callTutorTurn({
        problemText: variant.prompt_text,
        expectedAnswer: problem.expected_answer,
        expectedSteps: problem.expected_steps,
        solutionNotes: problem.solution_notes,
        board: steps.map((s) => ({ expr: s.content, provenance: s.provenance })),
        transcript: transcript.map((t) => ({
          who: t.speaker === "ai" ? "ai" : "you",
          text: t.body,
        })),
        studentMessage: text,
        mode: "type",
      });
      await finalizeTurn(text, turn);
      setDraft("");
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "The tutor could not respond");
    } finally {
      setSending(false);
    }
  };

  /* ---------------- Voice ---------------- */

  const cancelInFlight = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayFallback(false);
    setVoiceStatus("idle");
  };

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      const myGen = ++generationRef.current;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (autoStopRef.current) {
          clearTimeout(autoStopRef.current);
          autoStopRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        void processVoiceTurn(blob, myGen);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setVoiceStatus("recording");
      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      }, 90_000);
    } catch {
      setVoiceError("Microphone access denied or unavailable — try Type it out instead.");
    }
  };

  const onMicTap = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    // Barge-in: cancel whatever is in flight or playing, then start fresh.
    cancelInFlight();
    await startRecording();
  };

  async function processVoiceTurn(blob: Blob, myGen: number) {
    if (blob.size === 0 || !problem || !variant || !session) {
      setVoiceStatus("idle");
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setVoiceStatus("transcribing");
    try {
      const data = await wbInvokeBinary<{ transcript?: string; error?: string }>(
        "wb-transcribe",
        blob,
        ac.signal,
      );
      if (myGen !== generationRef.current) return;
      if (data.error) throw new Error(data.error);
      const text = (data.transcript ?? "").trim();
      if (!text) {
        setVoiceStatus("idle");
        setVoiceError("Didn't catch that — try again.");
        return;
      }

      setVoiceStatus("thinking");
      const res = await wbFetchJson<{ turn: TutorTurn }>(
        "wb-tutor-turn",
        {
          problemText: variant.prompt_text,
          expectedAnswer: problem.expected_answer,
          expectedSteps: problem.expected_steps,
          solutionNotes: problem.solution_notes,
          board: steps.map((s) => ({ expr: s.content, provenance: s.provenance })),
          transcript: transcript.map((t) => ({
            who: t.speaker === "ai" ? "ai" : "you",
            text: t.body,
          })),
          studentMessage: text,
          mode: "talk",
        },
        ac.signal,
      );
      if (myGen !== generationRef.current) return;
      const turn = res.turn;

      await finalizeTurn(text, turn);
      if (myGen !== generationRef.current) return;

      setVoiceStatus("speaking");
      const audioBlob = await wbFetchAudio("wb-tutor-tts", { text: turn.reply }, ac.signal);
      if (myGen !== generationRef.current) return;

      const url = URL.createObjectURL(audioBlob);
      if (audioRef.current) {
        audioRef.current.src = url;
        try {
          await audioRef.current.play();
        } catch {
          setPlayFallback(true);
        }
      }
      setVoiceStatus("idle");
    } catch (e) {
      if (myGen !== generationRef.current) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setVoiceStatus("idle");
      setVoiceError(e instanceof Error ? e.message : "The tutor could not respond");
    }
  }

  const onFinish = async () => {
    if (!session) return;
    cancelInFlight();
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    await finishSession(session.id);
    qc.invalidateQueries({ queryKey: ["wb"] });
    navigate("/wb/student");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  if (booting) return <WbChrome><div style={{ padding: 40, color: T.textMuted }}>Starting session…</div></WbChrome>;
  if (bootError && !session) return <WbChrome><div style={{ padding: 40, color: T.redText }}>{bootError}</div></WbChrome>;

  const canSend = draft.trim().length > 0 && !sending;
  const thinking = mode === "talk" && (voiceStatus === "transcribing" || voiceStatus === "thinking");
  const pillCopy = MODE_COPY[mode === "talk" ? "talk" : "type"];
  const boardSubtitle =
    mode === "talk"
      ? "Edvana writes what you say — tap the mic to talk"
      : "Edvana writes what you type — quiet mode, no mic";

  return (
    <WbChrome>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 22 }}>
        <div>
          <Eyebrow style={{ color: T.eyebrowGreen }}>Working session</Eyebrow>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em", margin: "4px 0 0" }}>
            {problem?.title}
          </h1>
        </div>
        <span style={{ flex: 1 }} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: T.emerald50,
            border: `1px solid ${T.emerald100}`,
            borderRadius: 9999,
            padding: "7px 14px",
          }}
        >
          <span className="edv-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: T.emerald500 }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.emerald700 }}>{pillCopy.pill}</span>
        </span>
        <Button size="sm" onClick={onFinish}>Finish problem</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 372px", gap: 20, alignItems: "start" }}>
        {/* Whiteboard */}
        <Card radius={24} style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: `1px solid ${T.border}` }}>
            <Pencil size={17} color={T.primary} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Whiteboard</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>{boardSubtitle}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.textSubtle }}>{steps.length} STEPS</span>
          </div>
          <WbHandwrittenBoard
            steps={steps}
            revealedIds={revealedIds}
            writing={thinking || sending}
            emptyHint={
              mode === "talk"
                ? "Tap the mic and talk me through your first step…"
                : "Type your reasoning on the right — I'll write it here…"
            }
          >
            <div
              style={{
                background: T.surfaceEmeraldSoft,
                border: `1px solid ${T.emerald100}`,
                borderRadius: 16,
                padding: "14px 16px",
                marginBottom: 22,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Eyebrow style={{ color: T.eyebrowGreen }}>The problem</Eyebrow>
                {variant && (
                  <span style={{ background: T.white, border: `1px solid ${T.emerald100}`, borderRadius: 9999, padding: "3px 9px", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", color: T.emerald700 }}>
                    VARIANT {variant.variant_label} · YOUR NUMBERS
                  </span>
                )}
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.55, margin: 0, color: T.ink20 }}>{variant?.prompt_text}</p>
            </div>
          </WbHandwrittenBoard>

          <StepsList steps={steps} />
        </Card>

        {/* Right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 18 }}>
            <Eyebrow style={{ marginBottom: 12 }}>This session</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatTile value={session?.probes_answered ?? 0} label="probes answered" />
              <StatTile value={session?.hints_used ?? 0} label="hints used" />
              <StatTile value={session?.self_corrections ?? 0} label="self-corrections" />
              <StatTile value={session?.words_written ?? 0} label="words written" />
            </div>
          </Card>

          <Card style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <Eyebrow>Transcript</Eyebrow>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: T.textSubtle }}>live</span>
            </div>
            <div ref={scrollerRef} className="edv-scroller" style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 360, overflowY: "auto", paddingRight: 6 }}>
              {transcript.length === 0 && <div style={{ fontSize: 13, color: T.textSubtle }}>No turns yet.</div>}
              {transcript.map((t) => (
                <div key={t.id}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.speaker === "ai" ? T.emerald700 : T.ink25 }}>
                      {t.speaker === "ai" ? "Edvana" : t.speaker_name ?? "You"}
                    </span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.textSubtle }}>{fmt(t.at_seconds)}</span>
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "3px 0 0", color: t.speaker === "ai" ? T.ink22 : T.textMuted }}>
                    {t.body}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ background: T.surfaceEmeraldSoft, border: `1px solid ${T.emerald100}`, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Sparkles size={14} color={T.emerald700} />
              <Eyebrow style={{ color: T.eyebrowGreen }}>Edvana is asking</Eyebrow>
              <span style={{ flex: 1 }} />
              <ModeToggle
                mode={mode}
                onChange={(m) => {
                  if (m === mode) return;
                  cancelInFlight();
                  if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
                  setRecording(false);
                  setVoiceError(null);
                  setMode(m);
                }}
              />
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0, color: T.ink22 }}>{askText}</p>

            {mode === "type" ? (
              <div style={{ marginTop: 14, background: T.white, border: `1px solid ${T.emerald100}`, borderRadius: 12, overflow: "hidden" }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  rows={3}
                  placeholder="Write your reasoning — a sentence is enough."
                  disabled={sending}
                  style={{ width: "100%", border: "none", outline: "none", resize: "none", padding: "12px 13px 8px", fontSize: 13.5, fontFamily: "inherit", color: T.ink22, background: "transparent" }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "8px 10px", borderTop: `1px solid ${T.border}` }}>
                  {SYMBOL_KEYS.map((k) => (
                    <button
                      key={k.glyph}
                      type="button"
                      title={k.tip}
                      onClick={() => setDraft((d) => d + k.glyph)}
                      style={{ minWidth: 26, height: 26, padding: "0 6px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.white, fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink25, cursor: "pointer" }}
                    >
                      {k.glyph}
                    </button>
                  ))}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => void onSend()}
                    disabled={!canSend}
                    style={{ height: 30, padding: "0 14px", borderRadius: 9999, border: "none", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: canSend ? "pointer" : "default", background: canSend ? T.primary : T.slate100, color: canSend ? T.white : T.textSubtle }}
                  >
                    {sending ? <Loader2 size={13} className="edv-spin" /> : <Send size={13} />}
                    {sending ? "Thinking…" : "Send"}
                  </button>
                </div>
              </div>
            ) : (
              <VoicePanel
                recording={recording}
                status={voiceStatus}
                error={voiceError}
                playFallback={playFallback}
                onMicTap={() => void onMicTap()}
                onPlayFallback={() => {
                  audioRef.current?.play().catch(() => {});
                  setPlayFallback(false);
                }}
              />
            )}
          </Card>
        </div>
      </div>
      <audio ref={audioRef} style={{ display: "none" }} />
    </WbChrome>
  );
}

function ModeToggle({ mode, onChange }: { mode: SessionMode; onChange: (m: SessionMode) => void }) {
  const item = (m: SessionMode, Icon: typeof Mic, label: string) => {
    const active = mode === m;
    return (
      <button
        type="button"
        onClick={() => onChange(m)}
        title={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 9px",
          borderRadius: 9999,
          border: `1px solid ${active ? T.emerald100 : "transparent"}`,
          background: active ? T.white : "transparent",
          color: active ? T.emerald700 : T.textSubtle,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Icon size={12} />
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "inline-flex", gap: 2, background: T.slate100, borderRadius: 9999, padding: 2 }}>
      {item("type", Keyboard, "Type")}
      {item("talk", Mic, "Talk")}
    </div>
  );
}

function VoicePanel({
  recording,
  status,
  error,
  playFallback,
  onMicTap,
  onPlayFallback,
}: {
  recording: boolean;
  status: VoiceStatus;
  error: string | null;
  playFallback: boolean;
  onMicTap: () => void;
  onPlayFallback: () => void;
}) {
  const label =
    status === "recording"
      ? "Listening — tap to stop"
      : status === "transcribing"
        ? "Reading what you said…"
        : status === "thinking"
          ? "Edvana is thinking…"
          : status === "speaking"
            ? "Edvana is replying…"
            : "Tap to talk";
  const busy = status === "transcribing" || status === "thinking" || status === "speaking";

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={onMicTap}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: recording ? T.redText2 : T.primary,
          color: T.white,
          boxShadow: recording ? "0 0 0 6px hsl(0 60% 42% / 0.15)" : "0 0 0 6px hsl(160 84% 29% / 0.12)",
        }}
      >
        {recording ? (
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
            {[0, 0.12, 0.24].map((d, i) => (
              <span
                key={i}
                className="edv-wave-bar"
                style={{ width: 3, height: 16, borderRadius: 2, background: T.white, animationDelay: `${d}s` }}
              />
            ))}
          </div>
        ) : busy ? (
          <Loader2 size={20} className="edv-spin" />
        ) : (
          <Mic size={22} />
        )}
      </button>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.emerald700 }}>{label}</span>
      {playFallback && (
        <button
          type="button"
          onClick={onPlayFallback}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: T.primary, background: "none", border: `1px solid ${T.emerald100}`, borderRadius: 9999, padding: "5px 12px", cursor: "pointer" }}
        >
          <Volume2 size={13} /> Play reply
        </button>
      )}
      {error && <div style={{ fontSize: 12, color: T.redText, textAlign: "center" }}>{error}</div>}
    </div>
  );
}

/** The precise, timestamped record of every board step — collapsed by default. */
function StepsList({ steps }: { steps: WbBoardStep[] }) {
  if (steps.length === 0) return null;
  return (
    <details style={{ borderTop: `1px solid ${T.border}`, background: T.white }}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "12px 22px",
          fontSize: 12.5,
          fontWeight: 600,
          color: T.textMuted,
        }}
      >
        Steps and timestamps ({steps.length})
      </summary>
      <div style={{ padding: "4px 22px 18px" }}>
        {steps.map((step) => (
          <div
            key={step.id}
            style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) 96px", gap: 14, alignItems: "baseline", padding: "8px 0" }}
          >
            <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.textSubtle }}>{fmt(step.at_seconds)}</span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                color: step.provenance === "answer" || step.provenance === "self_corrected" ? T.emerald700 : T.ink22,
                textDecoration: step.struck_through ? "line-through" : "none",
                textDecorationColor: step.struck_through ? T.amberStrike : undefined,
              }}
            >
              {step.content}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: provColor[step.provenance] }}>
              {step.provenance.replace("_", "-")}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
