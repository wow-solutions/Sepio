import { timingSafeEqual } from "node:crypto";

// Shared Bearer-token check for cron/worker routes. Constant-time comparison so
// the header check can't be probed byte-by-byte via response timing (the length
// pre-check leaks only the length, which is not secret-dependent per byte).
// Malformed or missing input always returns false — never throws.
export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
