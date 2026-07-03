// Bounded transient retry for the Claude call (T3). Deliberately narrow — the
// SDK's own retries are OFF (see claude.ts) because they retry timeouts too
// and stack badly against Vercel's maxDuration. This is a hand-rolled retry
// that only covers the case the SDK retry would have been safe for: a single
// retry of a genuinely transient server-side error.
//
// Rules:
//   - At most ONE retry (2 attempts total).
//   - Only retries an error with a numeric HTTP status of 429, 500, 502, 503,
//     or 529 (duck-typed off `err?.status` — matches both ClaudeError and
//     Anthropic's APIError subclasses). Errors with no numeric status
//     (timeout, network drop, abort) are never retried — thrown immediately.
//   - Budget guard: if the first attempt took longer than MAX_ATTEMPT_MS, do
//     not retry — the caller (variants route) lives inside a 60s
//     maxDuration and a second slow attempt would blow it.
//   - Delay before the retry: honors a `Retry-After` response header when it
//     parses to <=3 seconds (checked both as a plain header map and as a
//     real `Headers` object); otherwise a 500-1500ms jitter.
//   - Respects an AbortSignal: if it's aborted (checked after the failed
//     attempt, which also covers "aborted before the attempt started" since
//     abort state persists), the error is thrown without retrying.
//   - `now`/`sleep`/`jitter` are injectable so tests run without real timers.

export type RetryOpts = {
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number;
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
const MAX_ATTEMPT_MS = 10_000;
const RETRY_AFTER_CAP_SEC = 3;
const JITTER_BASE_MS = 500;
const JITTER_SPREAD_MS = 1000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

// Reads Retry-After off either a plain header-map-shaped error (`err.headers`
// as a Record) or a real `Headers` instance (Anthropic's APIError.headers).
function getRetryAfterSeconds(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown } | null | undefined)?.headers;
  if (!headers) return undefined;
  let raw: string | null | undefined;
  if (typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else {
    raw = (headers as Record<string, string>)["retry-after"];
  }
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const jitter = opts.jitter ?? Math.random;

  const start = now();
  try {
    return await fn();
  } catch (err) {
    const elapsedMs = now() - start;
    const status = getStatus(err);
    const retryable =
      status !== undefined &&
      RETRYABLE_STATUSES.has(status) &&
      elapsedMs <= MAX_ATTEMPT_MS &&
      !opts.signal?.aborted;
    if (!retryable) throw err;

    const retryAfterSec = getRetryAfterSeconds(err);
    const delayMs =
      retryAfterSec !== undefined && retryAfterSec <= RETRY_AFTER_CAP_SEC
        ? retryAfterSec * 1000
        : JITTER_BASE_MS + jitter() * JITTER_SPREAD_MS;
    await sleep(delayMs);

    return await fn();
  }
}
