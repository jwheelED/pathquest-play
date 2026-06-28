import { describe, it, expect } from "vitest";
import { handleCreate } from "../create-live-session/handler.ts";
import { makeMockSupabase } from "./mockSupabase.ts";

const okUser = async () => ({ id: "instr-1" });
const noUser = async () => null;

describe("handleCreate (characterization)", () => {
  it("401 when no Authorization header is present", async () => {
    const { client } = makeMockSupabase();
    const res = await handleCreate({ body: { title: "X", courseId: "c1" }, authHeader: null }, { admin: client, getUser: okUser });
    expect(res.status).toBe(401);
  });

  it("401 when the token does not resolve to a user", async () => {
    const { client } = makeMockSupabase();
    const res = await handleCreate({ body: { title: "X", courseId: "c1" }, authHeader: "Bearer bad" }, { admin: client, getUser: noUser });
    expect(res.status).toBe(401);
  });

  it("200 and applies defaults when title/courseId are omitted (recording flow)", async () => {
    const { client, calls } = makeMockSupabase({
      live_sessions: [
        { data: null }, // collision check: no existing
        { data: { id: "sess-1", session_code: "654321" } }, // insert
      ],
    });
    const res = await handleCreate({ body: {}, authHeader: "Bearer ok" }, { admin: client, getUser: okUser });
    expect(res.status).toBe(200);
    const insert = calls.find((c) => c.table === "live_sessions" && c.op === "insert");
    expect(insert?.payload).toMatchObject({
      title: "Recording session",
      course_id: null,
      instructor_id: "instr-1",
      is_active: true,
    });
    // a 6-digit session_code was generated
    expect(String((insert?.payload as { session_code: string }).session_code)).toMatch(/^\d{6}$/);
  });

  it("passes through an explicit title/courseId (Start Live Class flow)", async () => {
    const { client, calls } = makeMockSupabase({
      live_sessions: [{ data: null }, { data: { id: "sess-2", session_code: "111111" } }],
    });
    await handleCreate({ body: { title: "Bio 101", courseId: "course-9" }, authHeader: "Bearer ok" }, { admin: client, getUser: okUser });
    const insert = calls.find((c) => c.table === "live_sessions" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ title: "Bio 101", course_id: "course-9" });
  });

  it("retries on session_code collision before inserting", async () => {
    const { client, calls } = makeMockSupabase({
      live_sessions: [
        { data: { id: "taken" } }, // first generated code collides
        { data: null }, // second is free → break
        { data: { id: "sess-3", session_code: "222222" } }, // insert
      ],
    });
    const res = await handleCreate({ body: { title: "X", courseId: "c" }, authHeader: "Bearer ok" }, { admin: client, getUser: okUser });
    expect(res.status).toBe(200);
    // two collision-check selects happened before the insert
    const fromCalls = calls.filter((c) => c.table === "live_sessions" && c.op === "from");
    expect(fromCalls.length).toBe(3); // 2 checks + 1 insert
  });

  it("500 when the insert fails", async () => {
    const { client } = makeMockSupabase({
      live_sessions: [{ data: null }, { data: null, error: { message: "boom" } }],
    });
    const res = await handleCreate({ body: { title: "X", courseId: "c" }, authHeader: "Bearer ok" }, { admin: client, getUser: okUser });
    expect(res.status).toBe(500);
  });
});
