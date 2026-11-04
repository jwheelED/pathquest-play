/** Header shell for the whiteboard demo, with the current demo identity. */
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { T } from "@/components/edvana/tokens";
import edvanaMark from "@/assets/edvana/edvana-mark.png";
import { useDemoIdentity } from "../lib/demoIdentity";

export function WbChrome({ children }: { children: ReactNode }) {
  const { current, setCurrentId } = useDemoIdentity();
  const navigate = useNavigate();
  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 32px",
          background: "hsl(0 0% 100% / 0.86)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <img src={edvanaMark} alt="Edvana" width={27} height={27} style={{ borderRadius: "50%" }} />
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>edvana</span>
        <span style={{ width: 1, height: 22, background: T.border }} />
        <span style={{ fontSize: 13, color: T.textMuted }}>Whiteboard Tutor · demo</span>
        <span style={{ flex: 1 }} />
        {current && (
          <>
            <span style={{ fontSize: 12.5, color: T.textMuted }}>
              {current.full_name} · {current.role}
            </span>
            <button
              type="button"
              onClick={() => {
                setCurrentId(null);
                navigate("/wb/login");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1px solid ${T.border}`,
                background: T.white,
                borderRadius: 9999,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                color: T.ink25,
                cursor: "pointer",
              }}
            >
              <LogOut size={14} /> Switch
            </button>
          </>
        )}
      </header>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 32px 88px" }}>{children}</div>
    </>
  );
}
