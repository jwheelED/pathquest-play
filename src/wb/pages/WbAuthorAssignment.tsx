/** Instructor authoring: create assignment, AI-draft + approve problems, publish. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, Loader2, Plus } from "lucide-react";
import { T, FONT_MONO } from "@/components/edvana/tokens";
import { Button, Card, Eyebrow } from "@/components/edvana/primitives";
import { WbChrome } from "../components/WbChrome";
import { useDemoIdentity } from "../lib/demoIdentity";
import { wb } from "../lib/wbClient";
import {
  useInstructorCourse,
  createAssignment,
  callAuthorDraft,
  addProblem,
  publishAssignment,
  AuthorDraft,
} from "../lib/wbData";
import type { WbAssignment, WbProblem, WorkMode } from "../lib/wbTypes";

const ALL_MODES: WorkMode[] = ["talk", "type", "photo"];

export default function WbAuthorAssignment() {
  const { current } = useDemoIdentity();
  const { data: course } = useInstructorCourse(current?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState(70);
  const [modes, setModes] = useState<WorkMode[]>(["type", "talk"]);
  const [assignment, setAssignment] = useState<WbAssignment | null>(null);
  const [problems, setProblems] = useState<WbProblem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: enrollCount = 0 } = useQuery({
    queryKey: ["wb", "enroll-count", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const { count, error } = await wb
        .from("whiteboard_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("course_id", course!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const onCreate = async () => {
    if (!current || !course || !title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const a = await createAssignment({
        instructorId: current.id,
        courseId: course.id,
        title: title.trim(),
        reasoningWeight: weight,
        workModes: modes,
      });
      setAssignment(a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create assignment");
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    if (!assignment) return;
    setBusy(true);
    try {
      await publishAssignment(assignment.id, enrollCount);
      qc.invalidateQueries({ queryKey: ["wb"] });
      navigate("/wb/instructor");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <WbChrome>
      <Eyebrow style={{ color: T.eyebrowGreen }}>New assignment · {course?.code}</Eyebrow>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", margin: "6px 0 20px" }}>
        Author a whiteboard assignment
      </h1>

      {err && (
        <Card style={{ padding: "12px 16px", marginBottom: 16, background: T.redBg, border: `1px solid ${T.redBorder}`, color: T.redText, fontSize: 13 }}>
          {err}
        </Card>
      )}

      {/* Step 1: assignment shell */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 12 }}>1 · Assignment</Eyebrow>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!!assignment}
          placeholder="e.g. Homework 8 — Optimization"
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              Explanation weight — {weight}% / {100 - weight}%
            </label>
            <input type="range" min={50} max={90} step={5} value={weight} disabled={!!assignment}
              onChange={(e) => setWeight(Number(e.target.value))} style={{ accentColor: T.primary, width: 220 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Work modes</label>
            <div style={{ display: "flex", gap: 8 }}>
              {ALL_MODES.map((m) => {
                const on = modes.includes(m);
                return (
                  <button key={m} type="button" disabled={!!assignment}
                    onClick={() => setModes((cur) => (on ? cur.filter((x) => x !== m) : [...cur, m]))}
                    style={{ textTransform: "capitalize", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 9999, cursor: assignment ? "default" : "pointer", border: `1px solid ${on ? T.emerald100 : T.border}`, background: on ? T.emerald50 : T.white, color: on ? T.emerald700 : T.textMuted }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {!assignment && (
          <div style={{ marginTop: 18 }}>
            <Button onClick={onCreate} disabled={busy || !title.trim()}>
              {busy ? <Loader2 size={14} className="edv-spin" /> : null} Create draft
            </Button>
          </div>
        )}
        {assignment && (
          <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: T.emerald700 }}>
            <Check size={14} /> Draft created — add problems below
          </div>
        )}
      </Card>

      {/* Step 2: problems */}
      {assignment && (
        <>
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <Eyebrow style={{ marginBottom: 12 }}>2 · Problems ({problems.length})</Eyebrow>
            {problems.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${T.slate100}` }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textSubtle, width: 16 }}>{p.position}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{p.range_summary}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.emerald700 }}>APPROVED</span>
              </div>
            ))}
            <ProblemAuthor assignmentId={assignment.id} nextPos={problems.length + 1} onAdded={(p) => setProblems((cur) => [...cur, p])} />
          </Card>

          <Button size="lg" style={{ width: "100%" }} disabled={busy || problems.length === 0} onClick={onPublish}>
            {busy ? <Loader2 size={14} className="edv-spin" /> : null} Publish to {enrollCount} students
          </Button>
        </>
      )}
    </WbChrome>
  );
}

function ProblemAuthor({
  assignmentId,
  nextPos,
  onAdded,
}: {
  assignmentId: string;
  nextPos: number;
  onAdded: (p: WbProblem) => void;
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<AuthorDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onDraft = async () => {
    if (text.trim().length < 8) return;
    setDrafting(true);
    setErr(null);
    try {
      setDraft(await callAuthorDraft(text.trim()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const onApprove = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const p = await addProblem({ assignmentId, position: nextPos, draft, approved: true });
      onAdded(p);
      setText("");
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Add a problem</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Type the problem in plain words — e.g. 'A 13 ft ladder leans against a wall and slides down…'"
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />
      {err && <div style={{ color: T.redText, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 10 }}>
        <Button variant="outline" size="sm" onClick={onDraft} disabled={drafting || text.trim().length < 8}>
          {drafting ? <Loader2 size={13} className="edv-spin" /> : <Sparkles size={13} />} Draft answer key with AI
        </Button>
      </div>

      {draft && (
        <div style={{ marginTop: 14, background: T.surfaceEmeraldSoft, border: `1px solid ${T.emerald100}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{draft.title}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>{draft.concept} · {draft.range_summary}</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, background: T.white, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            {draft.prompt_template}
          </div>
          <Eyebrow style={{ marginBottom: 6 }}>Expected steps</Eyebrow>
          <ol style={{ margin: "0 0 10px", paddingLeft: 18 }}>
            {draft.expected_steps.map((s, i) => (
              <li key={i} style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink22, marginBottom: 3 }}>
                {s.expr} <span style={{ fontFamily: "inherit", color: T.textSubtle }}>— {s.note}</span>
              </li>
            ))}
          </ol>
          <div style={{ fontSize: 12.5, color: T.ink25, marginBottom: 12 }}>
            <b>Answer:</b> <span style={{ fontFamily: FONT_MONO }}>{draft.expected_answer}</span>
          </div>
          <div style={{ fontSize: 12, color: T.amberText, marginBottom: 12 }}>Watch for: {draft.solution_notes}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button size="sm" onClick={onApprove} disabled={saving}>
              {saving ? <Loader2 size={13} className="edv-spin" /> : <Plus size={13} />} Approve &amp; add
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Discard</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13.5,
  fontFamily: "inherit",
  color: T.ink,
  outline: "none",
  background: T.white,
};
