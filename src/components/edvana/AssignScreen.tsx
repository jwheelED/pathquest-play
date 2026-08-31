/** Screen 2 — student assignment / problem-set overview. */
import { Check, Info } from "lucide-react";
import { T } from "./tokens";
import { Screen } from "./data";
import { Button, Card, Eyebrow } from "./primitives";

interface Props {
  reasoningWeight: number;
  answerWeight: number;
  variantsEnabled: boolean;
  setScreen: (s: Screen) => void;
}

interface ProblemRow {
  title: string;
  sub: string;
  state: "complete" | "active" | "notstarted";
}

const ROWS: ProblemRow[] = [
  { title: "Sliding ladder", sub: "Recorded 3:40 · 4 probes · 0 hints", state: "complete" },
  { title: "Draining cone", sub: "Recorded 5:02 · 7 probes · 1 hint", state: "complete" },
  { title: "Inflating balloon", sub: "Up next · spherical volume, dV/dt given", state: "active" },
  { title: "Walking shadow", sub: "Not started", state: "notstarted" },
  { title: "Two cars at an intersection", sub: "Not started", state: "notstarted" },
];

function StepItem({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: T.emerald50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11.5,
          fontWeight: 700,
          color: T.emerald700,
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: T.textMuted, margin: "3px 0 0" }}>
          {children}
        </p>
      </div>
    </div>
  );
}

export default function AssignScreen({
  reasoningWeight,
  answerWeight,
  variantsEnabled,
  setScreen,
}: Props) {
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <Eyebrow style={{ color: T.eyebrowGreen }}>Due Sunday · 11:59 pm</Eyebrow>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em", margin: "4px 0 4px" }}>
          Homework 7 — Related rates
        </h1>
        <div style={{ fontSize: 14, color: T.textMuted }}>
          5 problems · about 35 minutes · Dr. Amara Osei
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, alignItems: "start" }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {variantsEnabled && (
            <div
              style={{
                display: "flex",
                gap: 12,
                background: T.sky50,
                border: `1px solid ${T.sky100}`,
                borderRadius: 16,
                padding: "14px 16px",
              }}
            >
              <Info size={17} color={T.sky600} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0, color: T.ink25 }}>
                This set was generated for you. Your numbers are not your classmates' numbers —
                comparing answers won't get you far.
              </p>
            </div>
          )}

          <Card style={{ overflow: "hidden" }}>
            {ROWS.map((row, i) => {
              const active = row.state === "active";
              const notStarted = row.state === "notstarted";
              return (
                <div
                  key={row.title}
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    padding: active ? 20 : "16px 20px",
                    background: active ? T.surfaceEmeraldSoft : "transparent",
                    borderTop: i === 0 ? "none" : `1px solid ${T.slate100}`,
                    opacity: notStarted ? 0.58 : 1,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: row.state === "complete" ? T.emerald50 : "transparent",
                      border: active
                        ? `2px solid ${T.emerald500}`
                        : notStarted
                          ? `1.5px solid ${T.slate300}`
                          : "none",
                    }}
                  >
                    {row.state === "complete" && <Check size={13} color={T.primary} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: active ? 15.5 : 14.5, fontWeight: active ? 700 : 600 }}>
                      {row.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        marginTop: 2,
                        color: active ? T.emerald700 : T.textMuted,
                      }}
                    >
                      {row.sub}
                    </div>
                  </div>
                  {row.state === "complete" && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.emerald700 }}>
                      Complete
                    </span>
                  )}
                  {active && (
                    <Button size="sm" onClick={() => setScreen("session")}>
                      Start session
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        </div>

        {/* Right — How this works */}
        <Card style={{ padding: 20 }}>
          <Eyebrow style={{ marginBottom: 10 }}>How this works</Eyebrow>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              lineHeight: 1.3,
              margin: "0 0 16px",
            }}
          >
            You talk. It listens. Nothing gets handed in on paper.
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <StepItem n={1} title="Work it however you work">
              Scratch paper, the whiteboard, or just your voice. Photograph the paper when you're
              done.
            </StepItem>
            <StepItem n={2} title="Explain each step — out loud or typed">
              Edvana writes what you say on the board and asks about the lines you actually wrote. In
              a library? Switch to quiet mode and type instead — same questions, no mic.
            </StepItem>
            <StepItem n={3} title="The session is the submission">
              Your reasoning is what's graded — <b>{reasoningWeight}% explanation, {answerWeight}%
              answer.</b> Being wrong and catching it counts for you, not against you.
            </StepItem>
          </div>
        </Card>
      </div>
    </div>
  );
}
