import { describe, it, expect, vi } from "vitest";
import {
  buildPausePointsFromSegments,
  handleDetectRequest,
  type SupabaseLike,
} from "../detect-speaker-questions/detection.ts";

/**
 * Server-side detection. We bypass `serve` and the real Supabase client by
 * importing the pure handler and pure pause-point builder. No DB writes.
 */

function makeMockSupabase(opts: {
  insertError?: { message: string } | null;
} = {}): { client: SupabaseLike; insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn(async () => ({ error: opts.insertError ?? null }));
  const client: SupabaseLike = {
    from: vi.fn(() => ({ insert })),
  };
  return { client, insert };
}

describe("buildPausePointsFromSegments — pure detection", () => {
  it("returns a pause point for a real question", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "What happens to the electron in this reaction?", start_ms: 5000 },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].lecture_video_id).toBe("lec-1");
    expect(out[0].pause_timestamp).toBe(5);
    expect(out[0].question_content.question).toContain("What happens");
    expect(out[0].question_type).toBe("short_answer");
  });

  it("filters out rhetorical questions", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "Does that make sense?", start_ms: 1000 },
    ]);
    expect(out).toEqual([]);
  });

  it("filters out questions below MIN_WORD_COUNT (5)", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "What now?", start_ms: 1000 },
    ]);
    expect(out).toEqual([]);
  });

  it("DEDUPLICATES two questions within 10 seconds", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "What happens to the electron here?", start_ms: 5000 },
      { text: "Why does the electron move now?", start_ms: 9000 },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].pause_timestamp).toBe(5);
  });

  it("KEEPS two questions spaced >10 seconds apart", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "What happens to the electron here?", start_ms: 5000 },
      { text: "Why does the electron move now?", start_ms: 20_000 },
    ]);
    expect(out.length).toBe(2);
    expect(out[0].pause_timestamp).toBe(5);
    expect(out[1].pause_timestamp).toBe(20);
    expect(out[1].order_index).toBe(1);
  });

  it("accepts Deepgram-style `start` (seconds) when `start_ms` is missing", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { transcript: "What happens to the electron here?", start: 7.5 },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].pause_timestamp).toBe(7);
  });

  it("returns [] for an empty segment array", () => {
    expect(buildPausePointsFromSegments("lec-1", [])).toEqual([]);
  });

  it("skips segments whose text is not a string (malformed input guard)", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      // @ts-expect-error — intentionally malformed
      { text: 42, start_ms: 1000 },
      // @ts-expect-error — intentionally malformed
      { text: null, start_ms: 2000 },
      { text: "What happens to the electron here?", start_ms: 5000 },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].pause_timestamp).toBe(5);
  });

  it("requires an interrogative trigger (server no longer accepts intonation-only ?)", () => {
    // Previously the server had no TRIGGER_PATTERNS check and would accept
    // any sentence ending in ?. Now it mirrors the client.
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "The electron is gone five times over?", start_ms: 5000 },
    ]);
    expect(out).toEqual([]);
  });

  it("rejects 'what do you think?' (blocklist must beat leading interrogative)", () => {
    const out = buildPausePointsFromSegments("lec-1", [
      { text: "What do you think?", start_ms: 5000 },
    ]);
    expect(out).toEqual([]);
  });
});

describe("handleDetectRequest — handler with mocked Supabase", () => {
  it("returns 400 when lecture_video_id is missing", async () => {
    const { client } = makeMockSupabase();
    const res = await handleDetectRequest(
      { transcript_segments: [] },
      client,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing/);
  });

  it("returns 400 when transcript_segments is not an array", async () => {
    const { client } = makeMockSupabase();
    const res = await handleDetectRequest(
      { lecture_video_id: "lec-1", transcript_segments: "nope" as unknown },
      client,
    );
    expect(res.status).toBe(400);
  });

  it("returns success:true detected:0 when no questions are found (no DB write)", async () => {
    const { client, insert } = makeMockSupabase();
    const res = await handleDetectRequest(
      {
        lecture_video_id: "lec-1",
        transcript_segments: [
          { text: "This is a declarative statement.", start_ms: 1000 },
        ],
      },
      client,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, detected: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts detected pause points via the mocked client", async () => {
    const { client, insert } = makeMockSupabase();
    const res = await handleDetectRequest(
      {
        lecture_video_id: "lec-1",
        transcript_segments: [
          { text: "What happens to the electron here?", start_ms: 5000 },
          { text: "Why does the electron move now?", start_ms: 20_000 },
        ],
      },
      client,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, detected: 2 });
    expect(client.from).toHaveBeenCalledWith("lecture_pause_points");
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0][0] as Array<{ pause_timestamp: number }>;
    expect(inserted.length).toBe(2);
    expect(inserted[0].pause_timestamp).toBe(5);
    expect(inserted[1].pause_timestamp).toBe(20);
  });

  it("returns 500 when the insert fails", async () => {
    const { client } = makeMockSupabase({
      insertError: { message: "boom" },
    });
    const res = await handleDetectRequest(
      {
        lecture_video_id: "lec-1",
        transcript_segments: [
          { text: "What happens to the electron here?", start_ms: 5000 },
        ],
      },
      client,
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("boom");
  });

  it("never touches a real Supabase client (mock is the only collaborator)", async () => {
    const { client, insert } = makeMockSupabase();
    await handleDetectRequest(
      {
        lecture_video_id: "lec-1",
        transcript_segments: [
          { text: "What happens to the electron here?", start_ms: 5000 },
        ],
      },
      client,
    );
    // sanity — proves we wired through the mock
    expect(vi.isMockFunction(insert)).toBe(true);
    expect(vi.isMockFunction(client.from)).toBe(true);
  });
});
