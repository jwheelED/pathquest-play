/** Live typed working session — real tutor loop with persistence. */
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Sparkles, Send, Loader2 } from "lucide-react";
import { T, FONT_MONO } from "@/components/edvana/tokens";
import { Button, Card, Eyebrow, StatTile } from "@/components/edvana/primitives";
import { SYMBOL_KEYS } from "@/components/edvana/data";
import { WbChrome } from "../components/WbChrome";
import { useDemoIdentity } from "../lib/demoIdentity";
import { wb } from "../lib/wbClient";
import {
  ensureVariant,
  ensureSession,
  useSessionBundle,
  callTutorTurn,
  persistTurn,
  finishSession,
} from "../lib/wbData";
import type { WbProblem, WbSession, WbVariant, Provenance } from "../lib/wbTypes";

const START_CLOCK = 154;

const provColor: Record<Provenance, string> = {
  from_you: T.textSubtle,
  corrected: T.amberText,
  self_corrected: T.emerald700,
  you_drew: T.textSubtle,
  answer: T.emerald700,
};

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

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [clock, setClock] = useState(START_CLOCK);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data: bundle, refetch } = useSessionBundle(session?.id);
  const steps = bundle?.steps ?? [];
  const transcript = bundle?.transcript ?? [];

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

  const askText =
    session?.current_ask ??
    (variant ? `Let's work it. Walk me through your first step for: ${variant.prompt_text}` : "");

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
      await persistTurn({
        session,
        studentName: current?.full_name.split(" ")[0] ?? "You",
        studentMessage: text,
        clockSeconds: clock,
        nextPositionBoard: steps.length,
        nextPositionTranscript: transcript.length,
        turn,
      });
      setClock((c) => c + 28);
      setDraft("");
      // refresh local session counters + bundle
      const { data: fresh } = await wb.from("whiteboard_sessions").select("*").eq("id", session.id).maybeSingle();
      if (fresh) setSession(fresh as WbSession);
      await refetch();
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "The tutor could not respond");
    } finally {
      setSending(false);
    }
  };

  const onFinish = async () => {
    if (!session) return;
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
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.emerald700 }}>QUIET MODE</span>
        </span>
        <Button size="sm" onClick={onFinish}>Finish problem</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 372px", gap: 20, alignItems: "start" }}>
        {/* Whiteboard */}
        <Card radius={24} style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: `1px solid ${T.border}` }}>
            <Pencil size={17} color={T.primary} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Whiteboard</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>Edvana writes what you type — quiet mode, no mic</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.textSubtle }}>{steps.length} STEPS</span>
          </div>
          <div style={{ padding: "26px 28px 30px", background: `linear-gradient(${T.gridLine} 1px, transparent 1px) 0 0 / 100% 30px, ${T.white}`, minHeight: 260 }}>
            <div
              style={{
                background: T.surfaceEmeraldSoft,
                border: `1px solid ${T.emerald100}`,
                borderRadius: 16,
                padding: "16px 18px",
                marginBottom: 24,
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

            {steps.length === 0 && (
              <div style={{ color: T.textSubtle, fontSize: 13.5, fontStyle: "italic" }}>
                Start typing your reasoning on the right — Edvana will write your steps here.
              </div>
            )}
            {steps.map((s) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) 96px", gap: 14, alignItems: "baseline", padding: "10px 0" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.textSubtle }}>
                  {fmt(s.at_seconds)}
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 18,
                    color: s.provenance === "answer" || s.provenance === "self_corrected" ? T.emerald700 : T.ink22,
                    textDecoration: s.struck_through ? "line-through" : "none",
                    textDecorationColor: s.struck_through ? T.amberStrike : undefined,
                  }}
                >
                  {s.content}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: provColor[s.provenance] }}>
                  {s.provenance.replace("_", "-")}
                </span>
              </div>
            ))}
          </div>
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
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0, color: T.ink22 }}>{askText}</p>

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
          </Card>
        </div>
      </div>
    </WbChrome>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
