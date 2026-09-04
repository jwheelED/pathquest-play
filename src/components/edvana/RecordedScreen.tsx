/** Screen 3 — post-submission receipt. */
import { AudioLines, Play, Camera, Clock, Check } from "lucide-react";
import { T } from "./tokens";
import { Screen } from "./data";
import { Button, Card, Eyebrow, ProgressBar } from "./primitives";

interface Props {
  suggested: string;
  setScreen: (s: Screen) => void;
}

const SIGNALS: { icon: typeof Play; title: string; detail: string }[] = [
  { icon: AudioLines, title: "Your full reasoning", detail: "1:58 of you explaining, transcribed" },
  { icon: Play, title: "A replayable board", detail: "6 steps, timestamped as you built them" },
  { icon: Camera, title: "Your scratch paper", detail: "1 photo, attached at 00:44" },
  { icon: Clock, title: "Where you slowed down", detail: "One sticking point at 00:51" },
];

interface Bar {
  label: string;
  pct: number;
  verdict: string;
  fill: string;
  verdictColor: string;
}

const BARS: Bar[] = [
  { label: "Setting up a related-rates equation", pct: 100, verdict: "Solid", fill: T.primary, verdictColor: T.emerald700 },
  { label: "Chain rule in implicit differentiation", pct: 72, verdict: "Nearly there", fill: T.amber, verdictColor: T.amberText },
  { label: "Naming units and interpreting the result", pct: 100, verdict: "Solid", fill: T.primary, verdictColor: T.emerald700 },
];

export default function RecordedScreen({ suggested, setScreen }: Props) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: T.emerald50,
            border: `1px solid ${T.emerald100}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Check size={26} color={T.primary} />
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 6px" }}>
          Recorded. That's your homework.
        </h1>
        <div style={{ fontSize: 14, color: T.textMuted }}>
          Problem 3 · 4 minutes 12 seconds · nothing to scan, nothing to hand in.
        </div>
      </div>

      {/* What Dr. Osei will see */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 14 }}>What Dr. Osei will see</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {SIGNALS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                style={{
                  display: "flex",
                  gap: 11,
                  border: `1px solid ${T.tileBorder}`,
                  borderRadius: 12,
                  padding: "13px 15px",
                }}
              >
                <Icon size={15} color={T.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>{s.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Where you stand */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 16 }}>Where you stand</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {BARS.map((b) => (
            <div key={b.label}>
              <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{b.label}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: b.verdictColor }}>
                  {b.verdict}
                </span>
              </div>
              <ProgressBar pct={b.pct} fill={b.fill} />
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            background: T.surfaceEmeraldSoft,
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 13,
            lineHeight: 1.55,
            color: T.successBody,
          }}
        >
          You dropped the dr/dt at 00:51 and caught it yourself after one question. That's recorded
          as a self-correction — it helps your score, it doesn't hurt it.
        </div>
      </Card>

      {/* Score row */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Suggested score {suggested} / 10</span>
          <span style={{ fontSize: 12.5, color: T.textMuted }}>
            Pending Dr. Osei's review — she can change it after listening.
          </span>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              padding: "4px 10px",
              borderRadius: 9999,
              background: T.slate100,
              color: T.textMuted,
            }}
          >
            NOT FINAL
          </span>
        </div>
      </Card>

      {/* Footer */}
      <div style={{ display: "flex", gap: 12 }}>
        <Button onClick={() => setScreen("assign")}>Next problem</Button>
        <Button variant="outline" onClick={() => setScreen("session")}>
          Replay this session
        </Button>
      </div>
    </div>
  );
}
