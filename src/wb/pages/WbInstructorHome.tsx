/** Instructor home — list assignments (draft + published), review submissions count. */
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { T } from "@/components/edvana/tokens";
import { Button, Card, Eyebrow } from "@/components/edvana/primitives";
import { WbChrome } from "../components/WbChrome";
import { useDemoIdentity } from "../lib/demoIdentity";
import { useInstructorCourse, useAssignments } from "../lib/wbData";

export default function WbInstructorHome() {
  const { current } = useDemoIdentity();
  const { data: course } = useInstructorCourse(current?.id);
  const { data: assignments = [], isLoading } = useAssignments(course?.id, false);
  const navigate = useNavigate();

  return (
    <WbChrome>
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <Eyebrow style={{ color: T.eyebrowGreen }}>{course?.code ?? "Your course"}</Eyebrow>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", margin: "6px 0 0" }}>
            Assignments
          </h1>
        </div>
        <span style={{ flex: 1 }} />
        <Button onClick={() => navigate("/wb/instructor/new")}>
          <Plus size={15} /> New assignment
        </Button>
      </div>

      {isLoading && <div style={{ color: T.textMuted }}>Loading…</div>}
      {!isLoading && assignments.length === 0 && (
        <Card style={{ padding: 24, color: T.textMuted }}>No assignments yet. Create one to get started.</Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {assignments.map((a) => (
          <Card key={a.id} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>
                {a.reasoning_weight}% explanation · {a.answer_weight}% answer · modes: {a.work_modes.join(", ")}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                padding: "5px 11px",
                borderRadius: 9999,
                textTransform: "uppercase",
                background: a.status === "published" ? T.emerald50 : T.slate100,
                color: a.status === "published" ? T.emerald700 : T.textMuted,
              }}
            >
              {a.status}
            </span>
          </Card>
        ))}
      </div>
    </WbChrome>
  );
}
