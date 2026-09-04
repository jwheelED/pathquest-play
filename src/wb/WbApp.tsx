/** Standalone whiteboard demo module — its own routes + seeded identity. */
import { Routes, Route, Navigate } from "react-router-dom";
import "@/components/edvana/edvana.css";
import { DemoIdentityProvider, useDemoIdentity } from "./lib/demoIdentity";
import WbLogin from "./pages/WbLogin";
import WbStudentHome from "./pages/WbStudentHome";
import WbLiveSession from "./pages/WbLiveSession";
import WbInstructorHome from "./pages/WbInstructorHome";
import WbAuthorAssignment from "./pages/WbAuthorAssignment";
import { WbChrome } from "./components/WbChrome";

function Guarded({ role, children }: { role: "instructor" | "student"; children: JSX.Element }) {
  const { current, loading } = useDemoIdentity();
  if (loading) return <WbChrome><div style={{ padding: 40 }}>Loading…</div></WbChrome>;
  if (!current) return <Navigate to="/wb/login" replace />;
  if (current.role !== role) {
    return <Navigate to={current.role === "instructor" ? "/wb/instructor" : "/wb/student"} replace />;
  }
  return children;
}

function WbRoutes() {
  const { current } = useDemoIdentity();
  return (
    <Routes>
      <Route
        index
        element={
          <Navigate
            to={current ? (current.role === "instructor" ? "/wb/instructor" : "/wb/student") : "/wb/login"}
            replace
          />
        }
      />
      <Route path="login" element={<WbLogin />} />
      <Route path="student" element={<Guarded role="student"><WbStudentHome /></Guarded>} />
      <Route path="student/problem/:problemId" element={<Guarded role="student"><WbLiveSession /></Guarded>} />
      <Route path="instructor" element={<Guarded role="instructor"><WbInstructorHome /></Guarded>} />
      <Route path="instructor/new" element={<Guarded role="instructor"><WbAuthorAssignment /></Guarded>} />
      <Route path="*" element={<Navigate to="/wb" replace />} />
    </Routes>
  );
}

export default function WbApp() {
  return (
    <DemoIdentityProvider>
      <div className="edv-root">
        <WbRoutes />
      </div>
    </DemoIdentityProvider>
  );
}
