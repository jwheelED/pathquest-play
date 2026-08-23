/** Seeded demo identity — the whiteboard demo has no signup. */
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { wb } from "./wbClient";
import type { DemoUser } from "./wbTypes";

const STORAGE_KEY = "wb_demo_user_id";

interface DemoIdentityValue {
  users: DemoUser[];
  loading: boolean;
  current: DemoUser | null;
  setCurrentId: (id: string | null) => void;
}

const Ctx = createContext<DemoIdentityValue | null>(null);

export function useDemoUsers() {
  return useQuery({
    queryKey: ["wb", "demo-users"],
    queryFn: async (): Promise<DemoUser[]> => {
      const { data, error } = await wb
        .from("whiteboard_demo_users")
        .select("*")
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DemoUser[];
    },
  });
}

export function DemoIdentityProvider({ children }: { children: ReactNode }) {
  const { data: users = [], isLoading } = useDemoUsers();
  const [currentId, setCurrentIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setCurrentId = (id: string | null) => {
    setCurrentIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — in-memory only */
    }
  };

  // Drop a stale id if it no longer exists once users load.
  useEffect(() => {
    if (!isLoading && currentId && !users.some((u) => u.id === currentId)) {
      setCurrentId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, users, currentId]);

  const current = useMemo(
    () => users.find((u) => u.id === currentId) ?? null,
    [users, currentId],
  );

  const value: DemoIdentityValue = { users, loading: isLoading, current, setCurrentId };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoIdentity(): DemoIdentityValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemoIdentity must be used within DemoIdentityProvider");
  return v;
}
