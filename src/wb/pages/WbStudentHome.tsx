/** Student home — published assignments for the enrolled course + problem list. */
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { T } from "@/components/edvana/tokens";
import { Button, Card, Eyebrow } from "@/components/edvana/primitives";
import { WbChrome } from "../components/WbChrome";
import { useDemoIdentity } from "../lib/demoIdentity";
import { useStudentCourse, useAssignments, useProblems } from "../lib/wbData";
import type { WbAssignment } from "../lib/wbTypes";

export default function WbStudentHome() {
  const { current } = useDemoIdentity();
  const { data: course } = useStudentCourse(current?.id);
  const { data: assignments = [], isLoading } = useAssignments(course?.id, true);

  return (
    <WbChrome>
      <Eyebrow style={{ color: T.eyebrowGreen }}>{course?.code ?? "Your course"}</Eyebrow>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", margin: "6px 0 20px" }}>
        Your assignments
      </h1>
      {isLoading && <div style={{ color: T.textMuted }}>Loading…</div>}
      {!isLoading && assignments.length === 0 && (
        <Card style={{ padding: 24, color: T.textMuted }}>
          Nothing published yet. Switch to the instructor to create and publish one.
        </Card>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {assignments.map((a) => (
          <AssignmentCard key={a.id} assignment={a} />
        ))}
      </div>
    </WbChrome>
  );
}

function AssignmentCard({ assignment }: { assignment: WbAssignment }) {
  const { data: problems = [] } = useProblems(assignment.id);
  const navigate = useNavigate();
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{assignment.title}</div>
        {assignment.subtitle && (
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{assignment.subtitle}</div>
        )}
      </div>
      {problems.map((p, i) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 20px",
            borderTop: i === 0 ? "none" : `1px solid ${T.slate100}`,
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: `1.5px solid ${T.slate300}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: T.textSubtle,
              fontSize: 12,
            }}
          >
            {p.position}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.title}</div>
            <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>{p.concept}</div>
          </div>
          {p.answer_key_status === "approved" ? (
            <Button size="sm" onClick={() => navigate(`/wb/student/problem/${p.id}`)}>
              Start session
            </Button>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: T.textSubtle }}>
              <Check size={12} /> Not ready
            </span>
          )}
        </div>
      ))}
    </Card>
  );
}
