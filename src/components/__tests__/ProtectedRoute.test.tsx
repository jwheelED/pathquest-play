import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

/**
 * CRITICAL PATH #1 — ProtectedRoute invariants
 *
 * 1. Unauthenticated session -> redirect to redirectTo.
 * 2. Authenticated with role -> renders children.
 * 3. Authenticated without role -> redirect.
 * 4. Listener + getSession fallback must NOT both call checkAuthorization
 *    (hasResolvedRef guard). We enforce by counting RPC calls.
 */

type AuthListener = (event: string, session: any) => void;
const listeners: AuthListener[] = [];

const sessionMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthListener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: () => sessionMock(),
    },
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/login">
              <div>SECRET</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  listeners.length = 0;
  sessionMock.mockReset();
  rpcMock.mockReset();
});

describe("ProtectedRoute", () => {
  it("redirects unauthenticated users to redirectTo", async () => {
    sessionMock.mockResolvedValue({ data: { session: null } });
    renderRoute();
    await waitFor(() => expect(screen.getByText("LOGIN")).toBeInTheDocument());
  });

  it("renders children when user has required role", async () => {
    sessionMock.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    rpcMock.mockResolvedValue({ data: true, error: null });
    renderRoute();
    await waitFor(() => expect(screen.getByText("SECRET")).toBeInTheDocument());
  });

  it("redirects when user lacks required role", async () => {
    sessionMock.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    rpcMock.mockResolvedValue({ data: false, error: null });
    renderRoute();
    await waitFor(() => expect(screen.getByText("LOGIN")).toBeInTheDocument());
  });

  it("does NOT double-check authorization when listener + getSession both resolve", async () => {
    sessionMock.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    rpcMock.mockResolvedValue({ data: true, error: null });
    renderRoute();
    // Simulate listener firing INITIAL_SESSION as well
    listeners.forEach((cb) => cb("INITIAL_SESSION", { user: { id: "u1" } }));
    await waitFor(() => expect(screen.getByText("SECRET")).toBeInTheDocument());
    // hasResolvedRef must keep this to a single RPC role check
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
