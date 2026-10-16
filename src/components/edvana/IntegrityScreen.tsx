/** Screen 6 — the academic-integrity argument. */
import { HelpCircle, Users, ShieldCheck, Eye } from "lucide-react";
import { T, FONT_MONO } from "./tokens";
import { Card, Eyebrow } from "./primitives";

interface Props {
  suggested: string;
  copied: string;
  reasoningWeight: number;
  answerWeight: number;
}

function IconWell({ icon: Icon, tint }: { icon: typeof Eye; tint: string }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        background: tint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14,
      }}
    >
      <Icon size={17} color={tint === T.sky50 ? T.sky600 : T.emerald700} />
    </div>
  );
}

function Evidence({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        background: T.slate50,
        borderRadius: 8,
        padding: "11px 12px",
        fontFamily: FONT_MONO,
        fontSize: 12,
        lineHeight: 1.6,
        color: T.ink25,
      }}
    >
      {children}
    </div>
  );
}

export default function IntegrityScreen({
  suggested,
  copied,
  reasoningWeight,
  answerWeight,
}: Props) {
  return (
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ maxWidth: 660, marginBottom: 28 }}>
        <Eyebrow style={{ color: T.eyebrowGreen, letterSpacing: "0.16em", marginBottom: 12 }}>
          Academic integrity
        </Eyebrow>
        <h1 style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.028em", lineHeight: 1.08, margin: "0 0 14px" }}>
          A second device doesn't help.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: T.textMuted, margin: 0 }}>
          The homework isn't the answer. It's the two minutes of you explaining how you got there —
          which is not a thing another tool can hand you in real time.
        </p>
      </div>

      {/* Three defense cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        <Card radius={14} style={{ padding: 24 }}>
          <IconWell icon={HelpCircle} tint={T.emerald50} />
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>
            The questions come from your work
          </h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: T.textMuted, margin: 0 }}>
            Edvana probes the line you actually wrote — the one with your mistake in it. There's no
            way to look that up.
          </p>
          <Evidence>
            “Your paper shows 4πr² sitting on its own — what has to ride along with it?”
          </Evidence>
        </Card>

        <Card radius={14} style={{ padding: 24 }}>
          <IconWell icon={Users} tint={T.sky50} />
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>
            Nobody has the same numbers
          </h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: T.textMuted, margin: 0 }}>
            Each student's problem is generated from the instructor's ranges. A shared answer is a
            wrong answer.
          </p>
          <Evidence>
            Jordan · 40 cm³/s, r = 8<br />
            Priya · 55 cm³/s, r = 6<br />
            Marcus · 31 cm³/s, r = 11
          </Evidence>
        </Card>

        <Card radius={14} style={{ padding: 24 }}>
          <IconWell icon={ShieldCheck} tint={T.emerald50} />
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>
            The reasoning is the grade
          </h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: T.textMuted, margin: 0 }}>
            {reasoningWeight}% of the score is explanation. A correct answer with nothing behind it
            fails on its own merits.
          </p>
          <Evidence>
            explanation · {reasoningWeight}%<br />
            answer · {answerWeight}%
          </Evidence>
        </Card>
      </div>

      {/* Comparison card */}
      <Card radius={14} style={{ padding: 24, marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 8 }}>Same right answer, two sessions</Eyebrow>
        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em", margin: "0 0 18px" }}>
          This is what a copied answer looks like from the instructor's side.
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Copied — red */}
          <div
            style={{
              borderRadius: 14,
              padding: 20,
              background: T.redBg,
              border: `1px solid ${T.redBorder}`,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.redText, marginBottom: 6 }}>
              Answer arrived from somewhere else
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.redText2, marginBottom: 12 }}>
              {copied}/10
            </div>
            <Bullets
              color={T.redInk}
              items={[
                "41 seconds of silence, then a fluent recital",
                "5 of 6 probes deflected — “that's just the formula”",
                "Could not say why the chain rule applies",
                "No scratch work, no self-corrections",
                `Answer correct — worth ${answerWeight}% of the score`,
              ]}
            />
          </div>
          {/* Honest — emerald */}
          <div
            style={{
              borderRadius: 14,
              padding: 20,
              background: T.surfaceEmeraldSoft,
              border: `1px solid ${T.emerald100}`,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.emerald700, marginBottom: 6 }}>
              Answer arrived from thinking
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.emerald700, marginBottom: 12 }}>
              {suggested}/10
            </div>
            <Bullets
              color={T.successBody2}
              items={[
                "Talked continuously for 1:58",
                "Answered all 6 probes in their own words",
                "Explained why the chain rule applies, unprompted",
                "Made one error at 00:51 and caught it",
                "Same correct answer",
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Closing card */}
      <Card radius={14} style={{ padding: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Eye size={20} color={T.ink25} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>
              No proctoring. No screen monitoring. No lockdown browser.
            </h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: T.textMuted, margin: 0 }}>
              Edvana never looks at the student's machine, their camera, or their other tabs. It only
              asks them to show their thinking — spoken, or typed in a silent library carrel — and a
              student who can do that has already done the homework, whatever else was open.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Bullets({ items, color }: { items: string[]; color: string }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 12.5, lineHeight: 1.45, color, display: "flex", gap: 8 }}>
          <span aria-hidden>·</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
