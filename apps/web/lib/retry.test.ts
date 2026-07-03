import { describe, expect, test } from "bun:test";
import { withTransientRetry } from "./retry";

// Deterministic test doubles — no real timers, no real clock.
function fakeClock(...values: number[]) {
  let i = 0;
  return () => (i < values.length ? values[i++] : values[values.length - 1]);
}

function fakeSleep() {
  const calls: number[] = [];
  const sleep = async (ms: number) => {
    calls.push(ms);
  };
  return { sleep, calls };
}

describe("withTransientRetry", () => {
  test("529 then success — retries once and returns the second result", async () => {
    let calls = 0;
    const { sleep, calls: sleepCalls } = fakeSleep();
    const result = await withTransientRetry(
      async () => {
        calls++;
        if (calls === 1) {
          const err: any = new Error("overloaded");
          err.status = 529;
          throw err;
        }
        return "ok";
      },
      { now: fakeClock(0, 100), sleep, jitter: () => 0 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(sleepCalls.length).toBe(1);
  });

  test("401 — no retry, throws immediately", async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        async () => {
          calls++;
          const err: any = new Error("unauthorized");
          err.status = 401;
          throw err;
        },
        { now: fakeClock(0, 10) },
      ),
    ).rejects.toThrow(/unauthorized/);
    expect(calls).toBe(1);
  });

  test("error without a numeric status (timeout) — no retry", async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        async () => {
          calls++;
          throw new Error("timed out");
        },
        { now: fakeClock(0, 10) },
      ),
    ).rejects.toThrow(/timed out/);
    expect(calls).toBe(1);
  });

  test("both attempts 529 — throws the last error, exactly 2 calls", async () => {
    let calls = 0;
    const { sleep } = fakeSleep();
    await expect(
      withTransientRetry(
        async () => {
          calls++;
          const err: any = new Error(`overloaded #${calls}`);
          err.status = 529;
          throw err;
        },
        { now: fakeClock(0, 100, 200, 300), sleep, jitter: () => 0 },
      ),
    ).rejects.toThrow(/overloaded #2/);
    expect(calls).toBe(2);
  });

  test("first attempt took >10s — no retry even though status is retryable", async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        async () => {
          calls++;
          const err: any = new Error("overloaded");
          err.status = 529;
          throw err;
        },
        // start=0, elapsed check reads 10_001 -> over the 10_000ms budget guard
        { now: fakeClock(0, 10_001) },
      ),
    ).rejects.toThrow(/overloaded/);
    expect(calls).toBe(1);
  });

  test("Retry-After: 2 (plain header map) — sleep is called with 2000ms", async () => {
    let calls = 0;
    const { sleep, calls: sleepCalls } = fakeSleep();
    await withTransientRetry(
      async () => {
        calls++;
        if (calls === 1) {
          const err: any = new Error("rate limited");
          err.status = 429;
          err.headers = { "retry-after": "2" };
          throw err;
        }
        return "ok";
      },
      { now: fakeClock(0, 100), sleep },
    );
    expect(sleepCalls).toEqual([2000]);
  });

  test("Retry-After via a real Headers object is honored the same way", async () => {
    let calls = 0;
    const { sleep, calls: sleepCalls } = fakeSleep();
    await withTransientRetry(
      async () => {
        calls++;
        if (calls === 1) {
          const err: any = new Error("rate limited");
          err.status = 429;
          err.headers = new Headers({ "retry-after": "1" });
          throw err;
        }
        return "ok";
      },
      { now: fakeClock(0, 100), sleep },
    );
    expect(sleepCalls).toEqual([1000]);
  });

  test("aborted signal — no retry", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    await expect(
      withTransientRetry(
        async () => {
          calls++;
          const err: any = new Error("overloaded");
          err.status = 529;
          throw err;
        },
        { now: fakeClock(0, 10), signal: controller.signal },
      ),
    ).rejects.toThrow(/overloaded/);
    expect(calls).toBe(1);
  });
});
