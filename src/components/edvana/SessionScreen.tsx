/** Screen 1 — the hero: live whiteboard working session. */
import { CSSProperties, KeyboardEvent, useEffect, useRef } from "react";
import {
  Pencil,
  AlertCircle,
  Check,
  Sparkles,
  Mic,
  Keyboard,
  Camera,
  Library,
  Send,
} from "lucide-react";
import { T, FONT_MONO } from "./tokens";
import {
  BOARD_STEPS,
  transcriptFor,
  PROBE_INDEX,
  MODE_COPY,
  Mode,
  Msg,
  Screen,
  SYMBOL_KEYS,
} from "./data";
import { Button, Card, Eyebrow, StatTile } from "./primitives";

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
  appended: Msg[];
  askText: string;
  variantsEnabled: boolean;
  setScreen: (s: Screen) => void;
}

const provenanceColor: Record<string, string> = {
  from_you: T.textSubtle,
  corrected: T.amberText,
  self_corrected: T.emerald700,
  you_drew: T.textSubtle,
  answer: T.emerald700,
};

function BoardStepRow({ step }: { step: (typeof BOARD_STEPS)[number] }) {
  const isAnswer = step.provenance === "answer";
  const mathSize = step.content.startsWith("Given")
    ? 16
    : isAnswer
      ? 21
      : 19;
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "52px minmax(0, 1fr) 96px",
    gap: 14,
    alignItems: "baseline",
    padding: "10px 0",
  };
  if (step.highlight) {
    Object.assign(rowStyle, {
      background: "hsl(152 76% 96% / 0.5)",
      borderRadius: 12,
      padding: "10px 10px",
    });
  }
  if (isAnswer) {
    Object.assign(rowStyle, {
      borderTop: `1px solid ${T.border}`,
      padding: "14px 0 4px",
      marginTop: 6,
    });
  }
  return (
    <div style={rowStyle}>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11.5,
          color: T.textSubtle,
          paddingLeft: step.highlight ? 8 : 0,
        }}
      >
        {step.time}
      </div>
      <div>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: mathSize,
            fontWeight: isAnswer ? 500 : 400,
            lineHeight: 1.55,
            color: isAnswer ? T.emerald700 : T.ink22,
            textDecoration: step.struck ? "line-through" : "none",
            textDecorationColor: step.struck ? T.amberStrike : undefined,
            textDecorationThickness: step.struck ? "2px" : undefined,
          }}
        >
          {step.content}
        </span>
        {step.annotation && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginLeft: 12,
              padding: "3px 9px",
              borderRadius: 9999,
              background: T.amberBg,
              border: `1px solid ${T.amberBorder}`,
              color: T.amberText,
              fontSize: 11,
              fontWeight: 600,
              verticalAlign: "middle",
            }}
          >
            <AlertCircle size={12} />
            {step.annotation}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textAlign: "right",
          color: provenanceColor[step.provenance],
          paddingRight: step.highlight ? 10 : 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          justifyContent: "flex-end",
        }}
      >
        {step.provenance === "you_drew" && <Pencil size={12} />}
        {step.provenance === "answer" && <Check size={13} />}
        {step.label}
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
        {[0, 0.12, 0.24, 0.36, 0.48].map((d, i) => (
          <span
            key={i}
            className="edv-wave-bar"
            style={{
              width: 3,
              height: 18,
              borderRadius: 2,
              background: T.emerald500,
              animationDelay: `${d}s`,
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.emerald700 }}>
        Listening — answer out loud
      </span>
    </div>
  );
}

function Composer({
  draft,
  setDraft,
  onSend,
}: {
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
}) {
  const canSend = draft.trim().length > 0;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          background: T.white,
          border: `1px solid ${T.emerald100}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Write your reasoning — a sentence is enough."
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            padding: "12px 13px 8px",
            fontSize: 13.5,
            fontFamily: "inherit",
            color: T.ink22,
            background: "transparent",
            display: "block",
          }}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            padding: "8px 10px",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          {SYMBOL_KEYS.map((k) => (
            <button
              key={k.glyph}
              type="button"
              title={k.tip}
              onClick={() => setDraft(draft + k.glyph)}
              className="edv-transition edv-symkey"
              style={{
                minWidth: 26,
                height: 26,
                padding: "0 6px",
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.white,
                fontFamily: FONT_MONO,
                fontSize: 12.5,
                fontWeight: 500,
                color: T.ink25,
                cursor: "pointer",
              }}
            >
              {k.glyph}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => canSend && onSend()}
            className="edv-transition"
            style={{
              height: 30,
              padding: "0 14px",
              borderRadius: 9999,
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: canSend ? "pointer" : "default",
              background: canSend ? T.primary : T.slate100,
              color: canSend ? T.white : T.textSubtle,
            }}
          >
            <Send size={13} />
            Send
          </button>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginTop: 10,
          fontSize: 12,
          fontWeight: 600,
          color: T.emerald700,
        }}
      >
        <Library size={13} />
        Quiet mode — mic off, nothing plays out loud
      </div>
    </div>
  );
}

const DOCK_MODES: { key: Mode; label: string; icon: typeof Mic }[] = [
  { key: "talk", label: "Talk it through", icon: Mic },
  { key: "type", label: "Type it out", icon: Keyboard },
  { key: "draw", label: "Draw", icon: Pencil },
  { key: "photo", label: "Photograph paper", icon: Camera },
];

export default function SessionScreen({
  mode,
  setMode,
  draft,
  setDraft,
  onSend,
  appended,
  askText,
  variantsEnabled,
  setScreen,
}: Props) {
  const isTyped = mode === "type";
  const copy = MODE_COPY[mode];
  const base = transcriptFor(mode);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the transcript to the bottom after each composer turn. The
  // fixed script stays scrolled to the top until the student sends something.
  useEffect(() => {
    if (appended.length === 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [appended.length]);

  const effortValue = isTyped ? "412" : "1:58";
  const effortLabel = isTyped ? "words written" : "of you talking";

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 22 }}>
        <div>
          <Eyebrow style={{ color: T.eyebrowGreen }}>Working session</Eyebrow>
          <h1
            style={{
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              margin: "4px 0 0",
            }}
          >
            Homework 7 · Problem 3 of 5
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
            padding: "7px 14px 7px 12px",
          }}
        >
          <span
            className="edv-pulse"
            style={{ width: 7, height: 7, borderRadius: "50%", background: T.emerald500 }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.emerald700 }}>
            {copy.pill} · 04:12
          </span>
        </span>
        <Button variant="outline" size="sm">
          Pause
        </Button>
        <Button size="sm" onClick={() => setScreen("recorded")}>
          Finish problem
        </Button>
      </div>

      {/* Two columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 372px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Whiteboard */}
        <Card radius={24} style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 22px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <Pencil size={17} color={T.primary} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Whiteboard</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>{copy.boardSubtitle}</span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: T.textSubtle,
                letterSpacing: "0.04em",
              }}
            >
              6 STEPS
            </span>
          </div>
          <div
            style={{
              padding: "26px 28px 30px",
              background: `linear-gradient(${T.gridLine} 1px, transparent 1px) 0 0 / 100% 30px, ${T.white}`,
            }}
          >
            {/* Problem card */}
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
                {variantsEnabled && (
                  <span
                    style={{
                      background: T.white,
                      border: `1px solid ${T.emerald100}`,
                      borderRadius: 9999,
                      padding: "3px 9px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: T.emerald700,
                    }}
                  >
                    VARIANT B-14 · YOUR NUMBERS
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.55,
                  margin: 0,
                  color: T.ink20,
                  textWrap: "pretty",
                }}
              >
                A spherical weather balloon is inflated at a rate of 40 cm³/s. How fast is
                the radius increasing at the instant the radius is 8 cm?
              </p>
            </div>

            {BOARD_STEPS.map((step) => (
              <BoardStepRow key={step.time} step={step} />
            ))}
          </div>
        </Card>

        {/* Right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* This session */}
          <Card style={{ padding: 18 }}>
            <Eyebrow style={{ marginBottom: 12 }}>This session</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatTile value="6" label="probes answered" />
              <StatTile value="0" label="hints used" />
              <StatTile value="1" label="self-correction" />
              <StatTile value={effortValue} label={effortLabel} />
            </div>
          </Card>

          {/* Transcript */}
          <Card style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <Eyebrow>Transcript</Eyebrow>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: T.textSubtle }}>live</span>
            </div>
            <div
              ref={scrollerRef}
              className="edv-scroller"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                maxHeight: 420,
                overflowY: "auto",
                paddingRight: 6,
              }}
            >
              {base.map((m, i) => (
                <div key={`base-${i}`}>
                  {i === PROBE_INDEX ? (
                    <>
                      <SpeakerLine who="ai" time={m.time} />
                      <ProbeCallout text={m.text} />
                    </>
                  ) : (
                    <TranscriptEntry m={m} />
                  )}
                  {m.who === "you" && m.time === "00:38" && <AttachmentBlock />}
                </div>
              ))}
              {appended.map((m, i) => (
                <TranscriptEntry key={`app-${i}`} m={m} />
              ))}
            </div>
          </Card>

          {/* Edvana is asking */}
          <Card
            style={{
              background: T.surfaceEmeraldSoft,
              border: `1px solid ${T.emerald100}`,
              padding: "16px 18px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Sparkles size={14} color={T.emerald700} />
              <Eyebrow style={{ color: T.eyebrowGreen }}>Edvana is asking</Eyebrow>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0, color: T.ink22 }}>
              {askText}
            </p>
            {isTyped ? (
              <Composer draft={draft} setDraft={setDraft} onSend={onSend} />
            ) : (
              <Waveform />
            )}
          </Card>
        </div>
      </div>

      {/* Mode dock */}
      <div
        style={{
          marginTop: 20,
          background: T.white,
          border: `1px solid ${T.border}`,
          borderRadius: 9999,
          boxShadow: T.shadowSm,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            gap: 4,
            background: T.slate100,
            borderRadius: 9999,
            padding: 4,
          }}
        >
          {DOCK_MODES.map((m) => {
            const Icon = m.icon;
            const selected = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className="edv-transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 15px",
                  borderRadius: 9999,
                  border: "none",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: selected ? T.white : "transparent",
                  boxShadow: selected ? T.shadowSm : "none",
                  color: selected ? T.emerald700 : T.textMuted,
                }}
              >
                <Icon size={14} />
                {m.label}
              </button>
            );
          })}
        </div>
        <span style={{ width: 1, height: 26, background: T.border }} />
        <span style={{ fontSize: 12.5, color: T.textMuted, maxWidth: 420 }}>
          {copy.dockHint}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.emerald700 }}>
          Everything in this session <i>is</i> your submission
        </span>
      </div>
    </div>
  );
}

function SpeakerLine({ who, time }: { who: "ai" | "you"; time: string }) {
  const isAi = who === "ai";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span
        style={{ fontSize: 11, fontWeight: 700, color: isAi ? T.emerald700 : T.ink25 }}
      >
        {isAi ? "Edvana" : "Jordan"}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.textSubtle }}>
        {time}
      </span>
    </div>
  );
}

function TranscriptEntry({ m }: { m: Msg }) {
  const isAi = m.who === "ai";
  return (
    <div>
      <SpeakerLine who={m.who} time={m.time} />
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          margin: "3px 0 0",
          color: isAi ? T.ink22 : T.textMuted,
        }}
      >
        {m.text}
      </p>
    </div>
  );
}

/** The 00:53 probe rendered as an amber callout. */
function ProbeCallout({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 10,
        background: T.amberBg,
        border: `1px solid ${T.amberBorder}`,
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 13,
        lineHeight: 1.5,
        color: T.amberProbeBody,
      }}
    >
      {text}
    </div>
  );
}

function AttachmentBlock() {
  return (
    <div
      style={{
        marginTop: 10,
        background: T.slate50,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11,
          fontWeight: 600,
          color: T.textMuted,
          marginBottom: 8,
        }}
      >
        <Camera size={13} />
        Jordan attached scratch work · 00:44
      </div>
      <div
        style={{
          height: 132,
          borderRadius: 8,
          border: `1px dashed ${T.slate300}`,
          background: T.white,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.textSubtle,
          fontSize: 12,
          textAlign: "center",
          padding: 12,
        }}
      >
        Drop a photo of handwritten scratch work
      </div>
    </div>
  );
}
