/** Screen 4 — instructor session review / replay. */
import { Play } from "lucide-react";
import { T, FONT_MONO } from "./tokens";
import { BOARD_STEPS, round1 } from "./data";
import { Button, Card, Eyebrow, ProgressBar } from "./primitives";

interface Props {
  suggested: string;
  reasoningWeight: number;
  answerWeight: number;
}

function PlayerBar() {
  return (
    <Card style={{ padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: T.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Play size={16} color={T.white} fill={T.white} />
        </div>
        <div style={{ flex: 1 }}>
          {/* Track */}
          <div
            style={{
              position: "relative",
              height: 8,
              background: T.slate100,
              borderRadius: 9999,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: "34%",
                background: T.primary,
                borderRadius: 9999,
              }}
            />
            {/* Event markers */}
            <span
              style={{
                position: "absolute",
                left: "20.5%",
                top: -4,
                width: 4,
                height: 16,
                borderRadius: 2,
                background: T.amber,
              }}
            />
            <span
              style={{
                position: "absolute",
                left: "30%",
                top: -4,
                width: 4,
                height: 16,
                borderRadius: 2,
                background: T.emerald500,
              }}
            />
            {/* Thumb */}
            <span
              style={{
                position: "absolute",
                left: "34%",
                top: "50%",
                marginTop: -7,
                marginLeft: -7,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: T.white,
                border: `2px solid ${T.primary}`,
              }}
            />
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
            <LegendSwatch color={T.amber} label="00:51 chain rule dropped" />
            <LegendSwatch color={T.emerald500} label="01:15 explained why, unprompted" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.textMuted }}>
            01:26 / 04:12
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 9999,
              background: T.slate100,
              color: T.ink25,
            }}
          >
            1.5×
          </span>
        </div>
      </div>
    </Card>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 600, color: T.ink25 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function CompactBoard() {
  return (
    <Card style={{ padding: 20 }}>
      <Eyebrow style={{ marginBottom: 12 }}>Board at 04:12</Eyebrow>
      <div>
        {BOARD_STEPS.map((step) => {
          const isAmber = step.provenance === "corrected";
          const isAnswer = step.provenance === "answer";
          return (
            <div
              key={step.time}
              style={{
                display: "grid",
                gridTemplateColumns: "40px minmax(0,1fr)",
                gap: 12,
                alignItems: "baseline",
                padding: isAmber ? "6px 8px" : "6px 0",
                margin: isAmber ? "0 -8px" : 0,
                background: isAmber ? T.amberBg : "transparent",
                borderRadius: isAmber ? 8 : 0,
                borderTop: isAnswer ? `1px solid ${T.border}` : "none",
                marginTop: isAnswer ? 6 : undefined,
                paddingTop: isAnswer ? 12 : undefined,
              }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.textSubtle }}>
                {step.time}
              </span>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: step.content.startsWith("Given") ? 13.5 : isAnswer ? 15 : 14.5,
                  color: isAmber ? T.amberText : isAnswer ? T.emerald700 : T.ink22,
                  textDecoration: step.struck ? "line-through" : "none",
                  textDecorationColor: step.struck ? T.amberStrike : undefined,
                }}
              >
                {step.content}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const METRICS = [
  { value: "4:12", label: "time on task" },
  { value: "6/6", label: "probes answered" },
  { value: "0", label: "hints used" },
  { value: "1:58", label: "student talk time" },
];

function TagRow({
  tag,
  color,
  bg,
  children,
}: {
  tag: string;
  color: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 11,
        borderRadius: 12,
        padding: "12px 14px",
        border: `1px solid ${T.tileBorder}`,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          alignSelf: "flex-start",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: "3px 8px",
          borderRadius: 9999,
          background: bg,
          color,
        }}
      >
        {tag}
      </span>
      <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: T.ink25 }}>{children}</p>
    </div>
  );
}

export default function ReviewScreen({ suggested, reasoningWeight, answerWeight }: Props) {
  const reasoningVal = round1(8.4);
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <Eyebrow style={{ color: T.eyebrowGreen }}>Session review · 12 of 34</Eyebrow>
          <h1 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.025em", margin: "4px 0 4px" }}>
            Jordan Rivera · Problem 3
          </h1>
          <div style={{ fontSize: 13.5, color: T.textMuted }}>
            Variant B-14 · submitted Sat 9:42 pm · 4:12 total
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            padding: "6px 12px",
            borderRadius: 9999,
            background: T.sky50,
            border: `1px solid ${T.sky100}`,
            color: T.sky600,
          }}
        >
          30 SECONDS TO REVIEW
        </span>
      </div>

      <PlayerBar />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CompactBoard />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {METRICS.map((m) => (
              <Card key={m.label} style={{ padding: "13px 14px" }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{m.value}</div>
                <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>{m.label}</div>
              </Card>
            ))}
          </div>
          <Card style={{ padding: 20 }}>
            <Eyebrow style={{ marginBottom: 12 }}>What the reasoning showed</Eyebrow>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <TagRow tag="MISCONCEPTION" color={T.amberText} bg={T.amberBg}>
                Chain-rule omission when differentiating implicitly. Self-corrected after one probe —
                no hint needed. [Jump to 00:51]
              </TagRow>
              <TagRow tag="STRENGTH" color={T.emerald700} bg={T.emerald50}>
                Articulated <i>why</i> the chain rule applies without being told. Stated units
                unprompted.
              </TagRow>
              <TagRow tag="PATTERN" color={T.sky600} bg={T.sky50}>
                Same omission appeared in 9 of 34 sessions on this problem. Worth five minutes in
                Tuesday's class.
              </TagRow>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <Eyebrow style={{ marginBottom: 10 }}>Suggested score</Eyebrow>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em" }}>{suggested}</span>
              <span style={{ fontSize: 17, fontWeight: 600, color: T.textSubtle }}>/ 10</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 16 }}>
              A suggestion, not a grade. You decide.
            </div>
            <ComponentBar
              label={`Explanation quality · ${reasoningWeight}%`}
              value={reasoningVal}
              pct={84}
              fill={T.primary}
            />
            <div style={{ height: 12 }} />
            <ComponentBar
              label={`Correct answer · ${answerWeight}%`}
              value="10.0"
              pct={100}
              fill={T.secondary}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Button style={{ flex: 1 }}>Accept</Button>
              <Button variant="outline" style={{ flex: 1 }}>
                Override
              </Button>
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <Eyebrow style={{ marginBottom: 12 }}>The moment that mattered</Eyebrow>
            <MomentTurn who="Jordan" time="00:51" body="So I differentiated it and got dV/dt equals 4 pi r squared." />
            <div
              style={{
                margin: "12px 0",
                background: T.amberBg,
                border: `1px solid ${T.amberBorder}`,
                borderRadius: 12,
                padding: "11px 13px",
                fontSize: 13,
                lineHeight: 1.5,
                color: T.amberProbeBody,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: T.amberText, marginBottom: 4 }}>
                Edvana · 00:53
              </div>
              Your paper shows 4πr² sitting on its own. The left side is a rate in time — what has to
              ride along with the 4πr²?
            </div>
            <MomentTurn
              who="Jordan"
              time="01:15"
              body="Because r isn't a constant — it's a function of time. So differentiating r cubed with respect to t gives 3r squared times dr/dt."
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${T.border}`,
                flexWrap: "wrap",
              }}
            >
              <Button variant="outline" size="sm">Full transcript</Button>
              <Button variant="outline" size="sm">Scratch photo</Button>
              <Button variant="outline" size="sm">Leave a note</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ComponentBar({
  label,
  value,
  pct,
  fill,
}: {
  label: string;
  value: string;
  pct: number;
  fill: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 500, color: T.ink25 }}>
          {value}
        </span>
      </div>
      <ProgressBar pct={pct} fill={fill} />
    </div>
  );
}

function MomentTurn({ who, time, body }: { who: string; time: string; body: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.ink25 }}>{who}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.textSubtle }}>{time}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.5, margin: "3px 0 0", color: T.textMuted }}>{body}</p>
    </div>
  );
}
