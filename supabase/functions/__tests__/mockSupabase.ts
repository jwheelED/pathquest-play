import { vi } from "vitest";

// Minimal chainable Supabase mock for edge-function characterization tests.
//
// Configure a FIFO queue of results PER TABLE; each `.from(table)` dequeues the
// next one. Chain methods (select/eq/in/order/limit/insert/update) are no-ops
// that return the builder; `.single()` / `.maybeSingle()` and awaiting the
// builder (for `head:true` counts and filtered selects) resolve the dequeued
// result. insert/update payloads are captured for assertions.

export interface MockResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface MockCall {
  table: string;
  op: "from" | "insert" | "update";
  payload?: unknown;
}

export function makeMockSupabase(config: Record<string, MockResult[]> = {}) {
  const queues: Record<string, MockResult[]> = {};
  for (const [table, results] of Object.entries(config)) queues[table] = [...results];
  const calls: MockCall[] = [];

  function builder(table: string) {
    const result: MockResult = queues[table]?.shift() ?? { data: null, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    const chain = () => b;
    b.select = vi.fn(chain);
    b.eq = vi.fn(chain);
    b.in = vi.fn(chain);
    b.order = vi.fn(chain);
    b.limit = vi.fn(chain);
    b.insert = vi.fn((payload: unknown) => {
      calls.push({ table, op: "insert", payload });
      return b;
    });
    b.update = vi.fn((payload: unknown) => {
      calls.push({ table, op: "update", payload });
      return b;
    });
    b.single = vi.fn(() => Promise.resolve(result));
    b.maybeSingle = vi.fn(() => Promise.resolve(result));
    // Make the builder awaitable (for `.select(.. {count, head}).eq(..)` and
    // `.select().in(..)` style chains that are awaited without a terminal).
    b.then = (onF: (v: MockResult) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
    return b;
  }

  const client = {
    from: vi.fn((table: string) => {
      calls.push({ table, op: "from" });
      return builder(table);
    }),
  };

  return { client, calls };
}
