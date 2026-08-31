/** Seeded demo login — pick who you are (no signup). */
import { useNavigate } from "react-router-dom";
import { T } from "@/components/edvana/tokens";
import { Card, Eyebrow } from "@/components/edvana/primitives";
import { WbChrome } from "../components/WbChrome";
import { useDemoIdentity } from "../lib/demoIdentity";

export default function WbLogin() {
  const { users, loading, setCurrentId } = useDemoIdentity();
  const navigate = useNavigate();

  const pick = (id: string, role: string) => {
    setCurrentId(id);
    navigate(role === "instructor" ? "/wb/instructor" : "/wb/student");
  };

  const instructors = users.filter((u) => u.role === "instructor");
  const students = users.filter((u) => u.role === "student");

  return (
    <WbChrome>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Eyebrow style={{ color: T.eyebrowGreen }}>Demo sign-in</Eyebrow>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", margin: "6px 0 6px" }}>
          Who are you today?
        </h1>
        <p style={{ fontSize: 14, color: T.textMuted, margin: "0 0 24px" }}>
          This is a sandbox with seeded accounts — pick an identity to explore the instructor or
          student side.
        </p>

        {loading && <div style={{ color: T.textMuted }}>Loading accounts…</div>}

        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Group title="Instructor" users={instructors} onPick={pick} />
            <Group title="Students" users={students} onPick={pick} />
          </div>
        )}
      </div>
    </WbChrome>
  );
}

function Group({
  title,
  users,
  onPick,
}: {
  title: string;
  users: { id: string; full_name: string; email: string | null; initials: string | null; role: string }[];
  onPick: (id: string, role: string) => void;
}) {
  return (
    <div>
      <Eyebrow style={{ marginBottom: 10 }}>{title}</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map((u) => (
          <Card key={u.id} style={{ padding: 0 }}>
            <button
              type="button"
              onClick={() => onPick(u.id, u.role)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: T.emerald50,
                  color: T.emerald700,
                  fontWeight: 700,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {u.initials ?? u.full_name.slice(0, 2)}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{u.full_name}</span>
                <span style={{ display: "block", fontSize: 12.5, color: T.textMuted }}>{u.email}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.emerald700 }}>Continue →</span>
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
