"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { connectBlogDomain, disconnectBlogDomain, verifyBlogDomain } from "./actions";

// "Publish on your own domain" card. Maps a client-owned domain
// (blog.client.com) to this brand's Sepio-hosted blog via one DNS CNAME — the
// zero-code publishing path for sites with no write API. Mirrors WordPressConnect.

const ERROR_MESSAGES: Record<string, string> = {
  notSignedIn: "You're signed out. Refresh the page and try again.",
  brandNotFound: "Brand not found.",
  invalidDomain:
    "Enter a valid subdomain you own, e.g. blog.yourdomain.com (not sepio.app).",
  domainTaken: "That domain is already connected to another brand.",
  vercelAddFailed: "Couldn't register the domain. Try again, or disconnect and reconnect.",
  vercelNotConfigured: "Domain provisioning isn't set up yet — contact support.",
  noDomain: "No domain to verify.",
  // verify() not-ready reasons
  dnsNotDetected:
    "DNS record not detected yet. After adding the CNAME it can take a few minutes — then check again.",
  certPending: "Almost there — issuing the HTTPS certificate. Check again in a minute.",
  notAdded: "Domain isn't registered yet. Try disconnect and reconnect.",
};

function resolveError(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

// Subdomain part for a DNS CNAME "Name" field: host minus the registrable apex.
function dnsRecordName(domain: string): string {
  const labels = domain.split(".");
  if (labels.length <= 2) return labels.length === 2 ? "@" : labels[0];
  return labels.slice(0, -2).join(".");
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending DNS",
  verifying: "Verifying",
  active: "Live",
  error: "Error",
};

export function BlogDomainConnect({
  brandId,
  domain,
  status,
  cnameTarget,
  liveUrl,
}: {
  brandId: string;
  domain: string | null;
  status: string | null;
  cnameTarget: string | null;
  liveUrl: string | null;
}): React.JSX.Element {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isActive = status === "active";

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await verifyBlogDomain(brandId);
        if (!res.ok) {
          setError(resolveError(res.error));
          return;
        }
        router.refresh();
      } catch {
        setError("Could not check the domain. Please try again.");
      }
    });
  }

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await connectBlogDomain(brandId, input.trim());
        if (!res.ok) {
          setError(resolveError(res.error));
          return;
        }
        setInput("");
        router.refresh();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function handleDisconnect() {
    if (!window.confirm("Disconnect this blog domain?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await disconnectBlogDomain(brandId);
        router.refresh();
      } catch {
        setError("Could not disconnect. Please try again.");
      }
    });
  }

  const cname = cnameTarget ?? "cname.vercel-dns.com";
  // DNS "Name" = the host minus the registrable apex (last two labels). Works
  // for blog.example.com → "blog" and content.blog.example.com → "content.blog";
  // an apex domain → "@". (.co.uk-style apexes are the note's "full host" case.)
  const recordHost = domain ? dnsRecordName(domain) : "blog";

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>
            Publish on your own domain
          </h3>
          <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
            {domain ? (
              <>
                <strong>{domain}</strong>
                {status && (
                  <span style={{ marginLeft: 10, fontSize: 11, color: "var(--ink-faint)" }}>
                    {STATUS_LABEL[status] ?? status}
                  </span>
                )}
              </>
            ) : (
              "Serve this brand's blog on a subdomain you own — one DNS record, no code."
            )}
          </p>
        </div>

        {domain && (
          <button type="button" disabled={isPending} onClick={handleDisconnect} style={dangerBtn}>
            Disconnect
          </button>
        )}
      </div>

      {!domain && (
        <form onSubmit={handleConnect} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="blog.yourdomain.com"
              disabled={isPending}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="submit" disabled={isPending} style={primaryBtn(isPending)}>
              {isPending ? "Saving…" : "Connect"}
            </button>
          </div>
        </form>
      )}

      {domain && !isActive && (
        <div style={dnsBox}>
          <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "0 0 10px" }}>
            Add this one DNS record at your domain provider, then click Check —
            HTTPS is issued for you automatically:
          </p>
          <div style={dnsGrid}>
            <span style={dnsLabel}>Type</span>
            <code style={dnsValue}>CNAME</code>
            <span style={dnsLabel}>Name</span>
            <code style={dnsValue}>{recordHost}</code>
            <span style={dnsLabel}>Value</span>
            <code style={dnsValue}>{cname}</code>
            <span style={dnsLabel}>TTL</span>
            <code style={dnsValue}>Auto (or 3600)</code>
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Some providers want the full host in <b>Name</b> ({domain}) instead of
            just <b>{recordHost}</b>. Point only this subdomain — your main site is
            untouched.
          </p>
          <div style={{ marginTop: 14 }}>
            <button type="button" disabled={isPending} onClick={handleVerify} style={primaryBtn(isPending)}>
              {isPending ? "Checking…" : "Check status"}
            </button>
          </div>
        </div>
      )}

      {domain && isActive && liveUrl && (
        <p style={{ fontSize: 13, margin: "14px 0 0" }}>
          <a href={liveUrl} target="_blank" rel="noreferrer" style={{ color: "var(--sepio-sepia)", fontWeight: 500 }}>
            View live blog ↗
          </a>
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12, color: "rgb(180, 60, 60)", margin: "12px 0 0", lineHeight: 1.4 }}>
          {error}
        </p>
      )}
    </div>
  );
}

const card: CSSProperties = {
  background: "var(--raised)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 14,
  padding: 22,
  marginBottom: 16,
};

const inputStyle: CSSProperties = {
  height: 36,
  padding: "0 12px",
  background: "var(--bg)",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 13,
};

const dnsBox: CSSProperties = {
  marginTop: 14,
  padding: 12,
  background: "var(--bg)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
};

const dnsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "6px 14px",
  alignItems: "center",
};

const dnsLabel: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-faint)",
};

const dnsValue: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  color: "var(--ink)",
  userSelect: "all",
};

function primaryBtn(busy: boolean): CSSProperties {
  return {
    height: 36,
    padding: "0 16px",
    background: busy ? "var(--ink-faint)" : "var(--sepio-sepia)",
    color: "var(--sepio-cream)",
    border: "1px solid var(--sepio-sepia)",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    cursor: busy ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };
}

const dangerBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 14px",
  background: "transparent",
  color: "rgb(180, 60, 60)",
  border: "1px solid rgba(200,80,80,0.30)",
  borderRadius: 9999,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
