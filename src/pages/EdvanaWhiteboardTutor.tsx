/**
 * Edvana — AI Whiteboard Math Tutor.
 *
 * A high-fidelity recreation of the design handoff mockup: six screens across
 * two roles, driven by a single mode/score state machine. The demo content is
 * fixed to a Calculus I related-rates problem; a small "Demo settings" panel
 * exposes the configurable props (reasoning weight, variants, opening mode/screen)
 * so the reactive scoring can be seen live.
 */
import { useMemo, useState } from "react";
import { Settings2, X } from "lucide-react";
import "@/components/edvana/edvana.css";
import { T } from "@/components/edvana/tokens";
import {
  Mode,
  Msg,
  Screen,
  REPLY_QUEUE,
  fmtClock,
  initialAsk,
  suggestedScore,
  copiedScore,
} from "@/components/edvana/data";
import { Chrome } from "@/components/edvana/Chrome";
import SessionScreen from "@/components/edvana/SessionScreen";
import AssignScreen from "@/components/edvana/AssignScreen";
import RecordedScreen from "@/components/edvana/RecordedScreen";
import ReviewScreen from "@/components/edvana/ReviewScreen";
import SetupScreen from "@/components/edvana/SetupScreen";
import IntegrityScreen from "@/components/edvana/IntegrityScreen";

const INITIAL_CLOCK = 154; // 02:34, just after the 02:09 answer

export default function EdvanaWhiteboardTutor() {
  const [screen, setScreen] = useState<Screen>("session");
  const [mode, setMode] = useState<Mode>("talk");
  const [draft, setDraft] = useState("");
  const [appended, setAppended] = useState<Msg[]>([]);
  const [replyIdx, setReplyIdx] = useState(0);
  const [clock, setClock] = useState(INITIAL_CLOCK);

  // Demo-configurable props (instructor settings + routing in production)
  const [reasoningWeight, setReasoningWeight] = useState(70);
  const [variantsEnabled, setVariantsEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const answerWeight = 100 - reasoningWeight;
  const suggested = suggestedScore(reasoningWeight);
  const copied = copiedScore(reasoningWeight);

  // askText: newest appended Edvana turn, else the mode's seed question.
  const askText = useMemo(() => {
    for (let i = appended.length - 1; i >= 0; i--) {
      if (appended[i].who === "ai") return appended[i].text;
    }
    return initialAsk(mode);
  }, [appended, mode]);

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    const reply = REPLY_QUEUE[Math.min(replyIdx, REPLY_QUEUE.length - 1)];
    setAppended((prev) => [
      ...prev,
      { who: "you", time: fmtClock(clock + 22), text },
      { who: "ai", time: fmtClock(clock + 28), text: reply },
    ]);
    setClock((c) => c + 28);
    setReplyIdx((i) => i + 1);
    setDraft("");
  };

  return (
    <div className="edv-root">
      <Chrome screen={screen} setScreen={setScreen}>
        {screen === "session" && (
          <SessionScreen
            mode={mode}
            setMode={setMode}
            draft={draft}
            setDraft={setDraft}
            onSend={onSend}
            appended={appended}
            askText={askText}
            variantsEnabled={variantsEnabled}
            setScreen={setScreen}
          />
        )}
        {screen === "assign" && (
          <AssignScreen
            reasoningWeight={reasoningWeight}
            answerWeight={answerWeight}
            variantsEnabled={variantsEnabled}
            setScreen={setScreen}
          />
        )}
        {screen === "recorded" && (
          <RecordedScreen suggested={suggested} setScreen={setScreen} />
        )}
        {screen === "review" && (
          <ReviewScreen
            suggested={suggested}
            reasoningWeight={reasoningWeight}
            answerWeight={answerWeight}
          />
        )}
        {screen === "setup" && (
          <SetupScreen
            reasoningWeight={reasoningWeight}
            answerWeight={answerWeight}
            variantsEnabled={variantsEnabled}
            setScreen={setScreen}
          />
        )}
        {screen === "integrity" && (
          <IntegrityScreen
            suggested={suggested}
            copied={copied}
            reasoningWeight={reasoningWeight}
            answerWeight={answerWeight}
          />
        )}
      </Chrome>

      <DemoSettings
        open={showSettings}
        toggle={() => setShowSettings((s) => !s)}
        reasoningWeight={reasoningWeight}
        setReasoningWeight={setReasoningWeight}
        variantsEnabled={variantsEnabled}
        setVariantsEnabled={setVariantsEnabled}
        mode={mode}
        setMode={setMode}
        suggested={suggested}
        copied={copied}
      />
    </div>
  );
}

function DemoSettings({
  open,
  toggle,
  reasoningWeight,
  setReasoningWeight,
  variantsEnabled,
  setVariantsEnabled,
  mode,
  setMode,
  suggested,
  copied,
}: {
  open: boolean;
  toggle: () => void;
  reasoningWeight: number;
  setReasoningWeight: (n: number) => void;
  variantsEnabled: boolean;
  setVariantsEnabled: (b: boolean) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  suggested: string;
  copied: string;
}) {
  return (
    <div style={{ position: "fixed", left: 20, bottom: 20, zIndex: 40 }}>
      {open ? (
        <div
          style={{
            width: 264,
            background: T.white,
            border: `1px solid ${T.border}`,
            borderRadius: 16,
            boxShadow: "0 12px 32px -8px hsl(220 25% 15% / 0.18)",
            padding: 16,
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Demo settings</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={toggle}
              aria-label="Close demo settings"
              style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMuted, padding: 2 }}
            >
              <X size={16} />
            </button>
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Reasoning weight — {reasoningWeight}% / {100 - reasoningWeight}%
          </label>
          <input
            type="range"
            min={50}
            max={90}
            step={5}
            value={reasoningWeight}
            onChange={(e) => setReasoningWeight(Number(e.target.value))}
            style={{ width: "100%", accentColor: T.primary }}
          />
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 6 }}>
            Honest {suggested}/10 · Copied {copied}/10
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={variantsEnabled}
              onChange={(e) => setVariantsEnabled(e.target.checked)}
              style={{ accentColor: T.primary }}
            />
            Per-student variants
          </label>

          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 14, marginBottom: 6 }}>
            Opening work mode
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(["talk", "type", "draw", "photo"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  border: `1px solid ${mode === m ? T.emerald100 : T.border}`,
                  background: mode === m ? T.emerald50 : T.white,
                  color: mode === m ? T.emerald700 : T.textMuted,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label="Open demo settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: T.white,
            border: `1px solid ${T.border}`,
            borderRadius: 9999,
            boxShadow: T.shadowSm,
            padding: "9px 14px",
            fontSize: 12.5,
            fontWeight: 600,
            color: T.ink25,
            cursor: "pointer",
          }}
        >
          <Settings2 size={15} />
          Demo settings
        </button>
      )}
    </div>
  );
}
