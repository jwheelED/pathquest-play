import { describe, it, expect } from "vitest";
import {
  parseResponses,
  deriveRosterStudent,
  compareByAttention,
  isConfidentWrong,
  type DeriveStudentInput,
  type ParsedResponse,
} from "../studentSignals";

const NOW = new Date("2026-06-10T12:00:00Z");

function baseInput(overrides: Partial<DeriveStudentInput> = {}): DeriveStudentInput {
  return {
    id: "s1",
    name: "Ada Lovelace",
    lastActivityDate: null,
    enrolledAt: "2026-01-01T00:00:00Z",
    checkIns: [],
    lectureProgress: [],
    publishedVideoCount: 0,
    now: NOW,
    ...overrides,
  };
}

function responsesJson(entries: Record<string, Record<string, unknown>>) {
  return entries as unknown as Parameters<typeof parseResponses>[0];
}

describe("parseResponses", () => {
  it("parses MCQ and short-answer entries, ignoring malformed ones", () => {
    const parsed = parseResponses(
      responsesJson({
        q1: { answer: "B", correct: true, confidence: "absolutely_sure", timestamp: "2026-06-01T00:00:00Z" },
        q2: { answer: "essay", grade: 85, feedback: "Good." },
        q3: "not-an-object" as unknown as Record<string, unknown>,
      }),
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ pausePointId: "q1", correct: true, confidence: "absolutely_sure" });
    expect(parsed[1]).toMatchObject({ pausePointId: "q2", correct: null, grade: 85 });
  });

  it("returns empty for null / arrays / scalars", () => {
    expect(parseResponses(null)).toEqual([]);
    expect(parseResponses([] as unknown as Parameters<typeof parseResponses>[0])).toEqual([]);
    expect(parseResponses("x" as unknown as Parameters<typeof parseResponses>[0])).toEqual([]);
  });
});

describe("confident-but-wrong", () => {
  const mk = (over: Partial<ParsedResponse>): ParsedResponse => ({
    pausePointId: "q",
    answer: "",
    correct: null,
    grade: null,
    confidence: null,
    feedback: null,
    timestamp: null,
    ...over,
  });

  it("requires explicit wrong + high confidence", () => {
    expect(isConfidentWrong(mk({ correct: false, confidence: "absolutely_sure" }))).toBe(true);
    expect(isConfidentWrong(mk({ correct: false, confidence: "pretty_sure" }))).toBe(true);
    expect(isConfidentWrong(mk({ correct: false, confidence: "maybe" }))).toBe(false);
    expect(isConfidentWrong(mk({ correct: true, confidence: "absolutely_sure" }))).toBe(false);
    expect(isConfidentWrong(mk({ correct: null, grade: 10, confidence: "absolutely_sure" }))).toBe(false);
  });
});

describe("deriveRosterStudent — comprehension", () => {
  it("mixes boolean correctness and graded short answers (≥70 counts correct)", () => {
    const s = deriveRosterStudent(
      baseInput({
        lectureProgress: [
          {
            lecture_video_id: "v1",
            started_at: "2026-06-09T00:00:00Z",
            completed_at: null,
            responses: responsesJson({
              q1: { answer: "A", correct: true },
              q2: { answer: "B", correct: false },
              q3: { answer: "essay", grade: 80 },
              q4: { answer: "essay", grade: 40 },
            }),
          },
        ],
        publishedVideoCount: 3,
      }),
      false,
    );
    expect(s.comprehension).toEqual({ correctRate: 50, n: 4 });
    expect(s.videos).toEqual({ started: 1, completed: 0, published: 3 });
  });

  it("yields null comprehension with no countable responses", () => {
    const s = deriveRosterStudent(baseInput(), false);
    expect(s.comprehension).toBeNull();
    expect(s.checkIns).toBeNull();
  });
});

describe("deriveRosterStudent — status boundaries", () => {
  it("zero data → new, never needs-attention", () => {
    const s = deriveRosterStudent(baseInput({ publishedVideoCount: 5 }), false);
    expect(s.status).toBe("new");
  });

  it("active recently with healthy numbers → on-track", () => {
    const s = deriveRosterStudent(
      baseInput({
        lastActivityDate: "2026-06-09",
        checkIns: [
          { grade: 90, completed: true, opened_at: "2026-06-09T00:00:00Z" },
          { grade: 85, completed: true, opened_at: "2026-06-08T00:00:00Z" },
        ],
      }),
      false,
    );
    expect(s.status).toBe("on-track");
    expect(s.signals).toHaveLength(0);
    expect(s.suggestedAction).toBeNull();
  });

  it("has data but inactive ≥7d with low score → quiet", () => {
    const s = deriveRosterStudent(
      baseInput({
        checkIns: [{ grade: 88, completed: true, opened_at: "2026-05-20T00:00:00Z" }],
      }),
      false,
    );
    expect(s.status).toBe("quiet");
  });

  it("accumulated signals ≥4 → needs-attention", () => {
    const s = deriveRosterStudent(
      baseInput({
        // inactive 21d (w2) + check-in avg 50% across 2 (w3) = 5
        checkIns: [
          { grade: 45, completed: true, opened_at: "2026-05-20T00:00:00Z" },
          { grade: 55, completed: true, opened_at: "2026-05-19T00:00:00Z" },
        ],
      }),
      false,
    );
    expect(s.status).toBe("needs-attention");
    expect(s.signalScore).toBeGreaterThanOrEqual(4);
    // dominant signal is the w3 low check-in average
    expect(s.suggestedAction).toBe("Review their check-in answers");
  });
});

describe("deriveRosterStudent — last active", () => {
  it("takes the max across activity date, lecture progress, responses and check-ins", () => {
    const s = deriveRosterStudent(
      baseInput({
        lastActivityDate: "2026-06-01",
        lectureProgress: [
          {
            lecture_video_id: "v1",
            started_at: "2026-06-02T00:00:00Z",
            completed_at: null,
            responses: responsesJson({
              q1: { answer: "A", correct: true, timestamp: "2026-06-08T10:00:00Z" },
            }),
          },
        ],
        checkIns: [{ grade: 70, completed: true, opened_at: "2026-06-05T00:00:00Z" }],
      }),
      false,
    );
    expect(s.lastActiveAt).toBe("2026-06-08T10:00:00Z");
    expect(s.status).toBe("on-track");
  });
});

describe("compareByAttention", () => {
  it("orders needs-attention → quiet → new → on-track, then by score desc", () => {
    const mk = (over: Partial<DeriveStudentInput>, name: string) =>
      deriveRosterStudent(baseInput({ ...over, id: name, name }), false);

    const onTrack = mk({ lastActivityDate: "2026-06-09", checkIns: [{ grade: 95, completed: true, opened_at: "2026-06-09T00:00:00Z" }] }, "ontrack");
    const fresh = mk({}, "fresh");
    const flagged = mk({
      checkIns: [
        { grade: 40, completed: true, opened_at: "2026-05-01T00:00:00Z" },
        { grade: 50, completed: true, opened_at: "2026-05-02T00:00:00Z" },
      ],
    }, "flagged");

    const sorted = [onTrack, fresh, flagged].sort(compareByAttention);
    expect(sorted.map(s => s.name)).toEqual(["flagged", "fresh", "ontrack"]);
  });
});
