// Pure, edge-safe host classification (imported by proxy.ts AND server code).
// Keep this free of server-only / node imports so it runs in the proxy runtime.
//
// An "app host" is where the Sepio product itself lives (marketing + dashboard).
// Anything else reaching us is treated as a CLIENT blog domain (blog.client.com)
// and routed to the multi-tenant _sites renderer. See lib/blog-domain.ts.

const APP_HOSTS = new Set(["sepio.app", "www.sepio.app"]);

// Strip a trailing :port and lowercase. Returns "" for null/empty.
export function bareHost(host: string | null | undefined): string {
  if (!host) return "";
  return host.split(":")[0].trim().toLowerCase();
}

export function isAppHost(host: string | null | undefined): boolean {
  const h = bareHost(host);
  if (!h) return true; // unknown host → treat as app (never mis-route to _sites)
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return true;
  if (APP_HOSTS.has(h)) return true;
  if (h.endsWith(".vercel.app")) return true; // preview + prod alias deployments
  return false;
}
