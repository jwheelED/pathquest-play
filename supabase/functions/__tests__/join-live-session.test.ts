import { describe, it, expect } from "vitest";
import { handleJoin, type JoinLimits } from "../join-live-session/handler.ts";
import { makeMockSupabase } from "./mockSupabase.ts";
import type { RateState } from "../_shared/joinRateLimit.ts";

const LIMITS: JoinLimits = {
  maxJoinsPerIp: 30,
  joinWindowMs: 60_000,
  maxParticipants: 500,
  maxNicknameLength: 50,
};

const NOW = 1_000_000;
const future = new Date(NOW + 3_600_000).toISOString();
const past = new Date(NOW - 1).toISOString();

function deps(config: Record<string, Parameters<typeof makeMockSupabase>[0][string]> = {}, store?: Map<string, RateState>) {
  const { client, calls } = makeMockSupabase(config);
  return { admin: client, rateStore: store ?? new Map<string, RateState>(), limits: LIMITS, calls };
}

describe("handleJoin (characterization)", () => {
  it("200 on a valid join — returns the server-generated participant", async () => {
    const d = deps({
      live_sessions: [{ data: { id: "s1", is_active: true, ends_at: future } }],
      live_participants: [
        { count: 3, error: null }, // capacity check
        { data: { id: "p1", nickname: "JW" } }, // insert
      ],
    });
    const res = await handleJoin({ body: { sessionCode: "123456", nickname: "JW" }, clientIp: "ip", now: NOW }, d);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ participant: { id: "p1", nickname: "JW" } });
    // participant row was inserted with the session id (server-issued identity)
    const insert = d.calls.find((c) => c.table === "live_participants" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ session_id: "s1", nickname: "JW" });
  });

  it("clamps an over-long nickname to the limit", async () => {
    const d = deps({
      live_sessions: [{ data: { id: "s1", is_active: true, ends_at: future } }],
      live_participants: [{ count: 0, error: null }, { data: { id: "p1", nickname: "x" } }],
    });
    const long = "n".repeat(120);
    await handleJoin({ body: { sessionCode: "123456", nickname: long }, clientIp: "ip", now: NOW }, d);
    const insert = d.calls.find((c) => c.table === "live_participants" && c.op === "insert");
    expect((insert?.payload as { nickname: string }).nickname).toHaveLength(LIMITS.maxNicknameLength);
  });

  it("429 when the per-IP rate limit is exceeded", async () => {
    const store = new Map<string, RateState>();
    // Pre-fill the window to the limit for this IP.
    store.set("ip", { count: LIMITS.maxJoinsPerIp, resetTime: NOW + LIMITS.joinWindowMs });
    const d = deps({}, store);
    const res = await handleJoin({ body: { sessionCode: "123456", nickname: "JW" }, clientIp: "ip", now: NOW }, d);
    expect(res.status).toBe(429);
  });

  it("400 when required fields are missing", async () => {
    const d = deps();
    expect((await handleJoin({ body: { nickname: "JW" }, clientIp: "ip", now: NOW }, d)).status).toBe(400);
    const d2 = deps();
    expect((await handleJoin({ body: { sessionCode: "123456", nickname: "   " }, clientIp: "ip2", now: NOW }, d2)).status).toBe(400);
  });

  it("404 when the session code is unknown", async () => {
    const d = deps({ live_sessions: [{ data: null }] });
    const res = await handleJoin({ body: { sessionCode: "000000", nickname: "JW" }, clientIp: "ip", now: NOW }, d);
    expect(res.status).toBe(404);
  });

  it("400 when the session is inactive or expired", async () => {
    const inactive = deps({ live_sessions: [{ data: { id: "s1", is_active: false, ends_at: future } }] });
    expect((await handleJoin({ body: { sessionCode: "123456", nickname: "JW" }, clientIp: "ip", now: NOW }, inactive)).status).toBe(400);

    const expired = deps({ live_sessions: [{ data: { id: "s1", is_active: true, ends_at: past } }] });
    expect((await handleJoin({ body: { sessionCode: "123456", nickname: "JW" }, clientIp: "ip2", now: NOW }, expired)).status).toBe(400);
  });

  it("403 when the session is at participant capacity", async () => {
    const d = deps({
      live_sessions: [{ data: { id: "s1", is_active: true, ends_at: future } }],
      live_participants: [{ count: LIMITS.maxParticipants, error: null }],
    });
    const res = await handleJoin({ body: { sessionCode: "123456", nickname: "JW" }, clientIp: "ip", now: NOW }, d);
    expect(res.status).toBe(403);
  });

  it("500 when the participant insert fails", async () => {
    const d = deps({
      live_sessions: [{ data: { id: "s1", is_active: true, ends_at: future } }],
      live_participants: [{ count: 0, error: null }, { data: null, error: { message: "boom" } }],
    });
    const res = await handleJoin({ body: { sessionCode: "123456", nickname: "JW" }, clientIp: "ip", now: NOW }, d);
    expect(res.status).toBe(500);
  });
});
