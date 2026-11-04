/** Sticky header + demo screen-nav shared by all Edvana screens. */
import { T } from "./tokens";
import { Screen } from "./data";
import edvanaMark from "@/assets/edvana/edvana-mark.png";

function HeaderBar() {
  return (
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
      <img
        src={edvanaMark}
        alt="Edvana"
        width={27}
        height={27}
        style={{ borderRadius: "50%", display: "block" }}
      />
      <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
        edvana
      </span>
      <span style={{ width: 1, height: 22, background: T.border }} />
      <span style={{ fontSize: 13, color: T.textMuted }}>
        MATH 151 · Calculus I · Section 04
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: T.textSubtle }}>
        University pilot mockup
      </span>
    </header>
  );
}

function NavButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="edv-transition"
      style={{
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        padding: "6px 13px",
        borderRadius: 9999,
        cursor: "pointer",
        background: active ? T.emerald50 : "transparent",
        border: `1px solid ${active ? T.emerald100 : "transparent"}`,
        color: active ? T.emerald700 : T.textMuted,
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: T.textSubtle,
      }}
    >
      {children}
    </span>
  );
}

const Divider = () => (
  <span style={{ width: 1, height: 20, background: T.border }} />
);

export function ScreenNav({
  screen,
  setScreen,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
}) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "10px 32px",
        background: "hsl(0 0% 100% / 0.6)",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <GroupLabel>Student</GroupLabel>
      <NavButton label="Assignment" active={screen === "assign"} onClick={() => setScreen("assign")} />
      <NavButton label="Whiteboard session" active={screen === "session"} onClick={() => setScreen("session")} />
      <NavButton label="Recorded" active={screen === "recorded"} onClick={() => setScreen("recorded")} />
      <Divider />
      <GroupLabel>Instructor</GroupLabel>
      <NavButton label="Session review" active={screen === "review"} onClick={() => setScreen("review")} />
      <NavButton label="Assignment setup" active={screen === "setup"} onClick={() => setScreen("setup")} />
      <Divider />
      <NavButton label="Integrity" active={screen === "integrity"} onClick={() => setScreen("integrity")} />
    </nav>
  );
}

export function Chrome({
  screen,
  setScreen,
  children,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <HeaderBar />
      <ScreenNav screen={screen} setScreen={setScreen} />
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "28px 32px 88px",
        }}
      >
        {children}
      </div>
    </>
  );
}
