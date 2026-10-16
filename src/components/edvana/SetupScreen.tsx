/** Screen 5 — instructor assignment authoring. */
import { Check } from "lucide-react";
import { T, FONT_MONO } from "./tokens";
import { Screen } from "./data";
import { Button, Card, Eyebrow } from "./primitives";

interface Props {
  reasoningWeight: number;
  answerWeight: number;
  variantsEnabled: boolean;
  setScreen: (s: Screen) => void;
}

const PROBLEMS = [
  { title: "Sliding ladder", range: "Pythagorean · 2 variants of setup" },
  { title: "Draining cone", range: "Similar triangles · radius/height ratio varied" },
  { title: "Inflating balloon", range: "dV/dt ∈ [25, 60] cm³/s · r ∈ [4, 12] cm" },
  { title: "Walking shadow", range: "Lamp height and walk speed varied" },
  { title: "Two cars", range: "Speeds and starting distances varied" },
];

function RadioRow({
  selected,
  disabled,
  title,
  desc,
}: {
  selected?: boolean;
  disabled?: boolean;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        borderRadius: 12,
        padding: "11px 13px",
        border: selected ? `1.5px solid ${T.primary}` : `1.5px solid ${T.slate300}`,
        background: selected ? T.surfaceEmeraldSoft : T.white,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginTop: 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: selected ? `5px solid ${T.primary}` : `1.5px solid ${T.slate300}`,
          background: T.white,
          boxSizing: "border-box",
        }}
      />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 40,
        height: 23,
        borderRadius: 9999,
        background: on ? T.primary : T.slate300,
        position: "relative",
        flexShrink: 0,
        display: "inline-block",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? "auto" : 3,
          right: on ? 3 : "auto",
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: T.white,
        }}
      />
    </span>
  );
}

function PolicyRow({
  title,
  desc,
  right,
  first,
}: {
  title: string;
  desc: string;
  right: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 0",
        borderTop: first ? "none" : `1px solid ${T.slate100}`,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>{desc}</div>
      </div>
      {right}
    </div>
  );
}

export default function SetupScreen({
  reasoningWeight,
  answerWeight,
  variantsEnabled,
  setScreen,
}: Props) {
  const chips = ["Talk it through", "Type it out · quiet mode", "Draw on the board", "Photograph paper"];
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <Eyebrow style={{ color: T.eyebrowGreen }}>Draft · not yet published</Eyebrow>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", margin: "4px 0 4px" }}>
          Homework 7 — Related rates
        </h1>
        <div style={{ fontSize: 14, color: T.textMuted }}>
          MATH 151 · Section 04 · 34 students · due Sunday 11:59 pm
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 20, alignItems: "start" }}>
        {/* Left — Problems */}
        <Card style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 20px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700 }}>Problems</span>
            <span style={{ flex: 1 }} />
            {variantsEnabled && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 11px",
                  borderRadius: 9999,
                  background: T.emerald50,
                  border: `1px solid ${T.emerald100}`,
                  color: T.emerald700,
                }}
              >
                <Check size={12} />
                34 unique number sets generated
              </span>
            )}
          </div>
          {PROBLEMS.map((p, i) => {
            const active = i === 2;
            return (
              <div
                key={p.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "15px 20px",
                  borderTop: i === 0 ? "none" : `1px solid ${T.slate100}`,
                  background: active ? T.slate50 : "transparent",
                }}
              >
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, width: 14, color: T.textSubtle }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{p.range}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.emerald700 }}>VARIED</span>
              </div>
            );
          })}
        </Card>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <Eyebrow style={{ marginBottom: 12 }}>How the tutor behaves</Eyebrow>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <RadioRow selected title="Socratic only" desc="Asks questions. Never states the step." />
              <RadioRow title="Hints on request" desc="Student can spend a hint, logged" />
              <RadioRow disabled title="Show worked solution" desc="Disabled by department policy" />
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <Eyebrow style={{ marginBottom: 12 }}>Ways to work</Eyebrow>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {chips.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: 9999,
                    background: T.emerald50,
                    border: `1px solid ${T.emerald100}`,
                    color: T.emerald700,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0, color: T.textSubtle }}>
              Students choose per session. Quiet mode types instead of speaking — the probes and the
              scoring are identical.
            </p>
          </Card>

          <Card style={{ padding: 20 }}>
            <Eyebrow style={{ marginBottom: 14 }}>What the score weighs</Eyebrow>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, width: 36 }}>{reasoningWeight}%</span>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 9999,
                  background: T.secondary,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${reasoningWeight}%`,
                    height: "100%",
                    background: T.primary,
                    borderRadius: 9999,
                  }}
                />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, width: 36, textAlign: "right" }}>
                {answerWeight}%
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 12, color: T.textMuted }}>Explanation quality</span>
              <span style={{ fontSize: 12, color: T.textMuted }}>Correct answer</span>
            </div>
          </Card>

          <Card style={{ padding: "6px 20px 14px" }}>
            <PolicyRow
              first
              title="Require an explanation"
              desc="Spoken or typed — a bare answer won't submit"
              right={<Toggle on />}
            />
            <PolicyRow
              title="Probe depth"
              desc="2–3 follow-ups per step"
              right={
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    background: T.slate100,
                    color: T.ink25,
                  }}
                >
                  Standard
                </span>
              }
            />
            <PolicyRow
              title="Hint budget"
              desc="Hints reduce explanation score"
              right={<span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 500 }}>0</span>}
            />
          </Card>

          <Button size="lg" style={{ width: "100%" }} onClick={() => setScreen("review")}>
            Publish to 34 students
          </Button>
        </div>
      </div>
    </div>
  );
}
