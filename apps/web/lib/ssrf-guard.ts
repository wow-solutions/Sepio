// SSRF guard for server-side fetches of USER-CONTROLLED URLs (a brand's website,
// a WordPress site URL). Without this, a signed-in user could point those at
// internal addresses (localhost, 169.254.169.254 cloud metadata, RFC1918, …)
// and make our server fetch them. Sepio holds client secrets — this boundary is
// part of the trust pitch, not optional.
//
// Use: `const u = await assertPublicHttpUrl(rawUrl)` before any server fetch, and
// fetch with `redirect: "manual"` (a 3xx could redirect to an internal host).
//
// KNOWN RESIDUAL (accepted for now): TOCTOU / DNS rebinding. We resolve DNS here,
// then `fetch` resolves again — a hostile resolver could return a public IP to
// this check and a private IP to the fetch. A complete fix needs a pinned-IP
// dispatcher (resolve once, connect to that exact address, preserve Host/SNI).
// Deferred as over-engineering for the current threat model; the guard + manual
// redirects close the common cases. TODO: pinned-IP fetch when this matters.

import { lookup } from "node:dns/promises";
import net from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost"];

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255…
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const v = ip.toLowerCase().split("%")[0]; // strip zone id
  if (v === "::1" || v === "::") return true; // loopback / unspecified
  // IPv4-mapped, dotted form (::ffff:a.b.c.d) — check the embedded v4.
  const mappedDotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return ipv4IsPrivate(mappedDotted[1]);
  // IPv4-mapped, HEX form (::ffff:7f00:1) — Node canonicalizes mapped literals
  // to this; without expanding it, ::ffff:127.0.0.1 would bypass the guard.
  const mappedHex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return ipv4IsPrivate(v4);
  }
  const first = v.split(":")[0];
  if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb"))
    return true; // fe80::/10 link-local
  if (first.startsWith("fc") || first.startsWith("fd")) return true; // fc00::/7 ULA
  if (first.startsWith("ff")) return true; // ff00::/8 multicast
  return false;
}

function ipIsPrivate(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4IsPrivate(ip);
  if (kind === 6) return ipv6IsPrivate(ip);
  return true; // not a parseable IP → treat as unsafe
}

// Validates a user-supplied URL is a public http(s) endpoint. Throws SsrfError
// otherwise. Resolves DNS and rejects if the host points at a private address
// (DNS-rebinding defense). Returns the parsed URL on success.
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new SsrfError("invalid url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new SsrfError(`unsupported protocol: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfError(`blocked host: ${host}`);
  }
  // IP literal → check directly, no DNS.
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new SsrfError(`private ip: ${host}`);
    return u;
  }
  // Hostname → resolve and reject if ANY answer is private.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`dns resolution failed: ${host}`);
  }
  if (addrs.length === 0) throw new SsrfError(`no dns answer: ${host}`);
  for (const a of addrs) {
    if (ipIsPrivate(a.address)) throw new SsrfError(`host resolves to private ip: ${host} → ${a.address}`);
  }
  return u;
}

// Convenience: boolean form for call sites that just want to skip on failure.
export async function isPublicHttpUrl(raw: string): Promise<boolean> {
  try {
    await assertPublicHttpUrl(raw);
    return true;
  } catch {
    return false;
  }
}
