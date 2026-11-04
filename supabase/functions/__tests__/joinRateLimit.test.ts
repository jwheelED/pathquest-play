import { describe, it, expect } from "vitest";
import { checkJoinRateLimit, type RateState } from "../_shared/joinRateLimit.ts";

/**
 * BE-AP-6: anonymous join must throttle rapid-fire abuse from one source.
 * These pin the pure per-IP window logic the edge function relies on.
 */
const opts = { maxPerWindow: 5, windowMs: 60_000 };

describe("checkJoinRateLimit", () => {
  it("allows attempts up to the limit, then blocks", () => {
    const store = new Map<string, RateState>();
    const ip = "1.2.3.4";
    const now = 1_000;
    for (let i = 0; i < 5; i++) {
      expect(checkJoinRateLimit(store, ip, now, opts).allowed).toBe(true);
    }
    // 6th within the window is blocked.
    expect(checkJoinRateLimit(store, ip, now, opts).allowed).toBe(false);
    expect(checkJoinRateLimit(store, ip, now, opts).allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    const store = new Map<string, RateState>();
    const ip = "1.2.3.4";
    for (let i = 0; i < 5; i++) checkJoinRateLimit(store, ip, 1_000, opts);
    expect(checkJoinRateLimit(store, ip, 1_000, opts).allowed).toBe(false);

    // Past resetTime → counter resets, allowed again.
    const later = 1_000 + opts.windowMs + 1;
    expect(checkJoinRateLimit(store, ip, later, opts).allowed).toBe(true);
  });

  it("tracks IPs independently (one abuser doesn't block others)", () => {
    const store = new Map<string, RateState>();
    const now = 1_000;
    for (let i = 0; i < 5; i++) checkJoinRateLimit(store, "10.0.0.1", now, opts);
    expect(checkJoinRateLimit(store, "10.0.0.1", now, opts).allowed).toBe(false);
    // A different IP is unaffected.
    expect(checkJoinRateLimit(store, "10.0.0.2", now, opts).allowed).toBe(true);
  });

  it("treats a generous shared-NAT limit as expected (classroom)", () => {
    const store = new Map<string, RateState>();
    const classroomOpts = { maxPerWindow: 30, windowMs: 60_000 };
    const ip = "campus-nat";
    // 30 students behind one NAT all get in within the window.
    for (let i = 0; i < 30; i++) {
      expect(checkJoinRateLimit(store, ip, 5_000, classroomOpts).allowed).toBe(true);
    }
    // The 31st rapid attempt is throttled.
    expect(checkJoinRateLimit(store, ip, 5_000, classroomOpts).allowed).toBe(false);
  });
});
