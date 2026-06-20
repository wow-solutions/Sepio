"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { connectBlogDomain, disconnectBlogDomain } from "./actions";

// "Publish on your own domain" card. Maps a client-owned domain
// (blog.client.com) to this brand's Sepio-hosted blog via one DNS CNAME — the
// zero-code publishing path for sites with no write API. Mirrors WordPressConnect.

const ERROR_MESSAGES: Record<string, string> = {
  notSignedIn: "You're signed out. Refresh the page and try again.",
  brandNotFound: "Brand not found.",
  invalidDomain:
    "Enter a valid subdomain you own, e.g. blog.yourdomain.com (not sepio.app).",
  domainTaken: "That domain is already connected to another brand.",
};

function resolveError(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
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
}: {
  brandId: string;
  domain: string | null;
  status: string | null;
  cnameTarget: string | null;
}): React.JSX.Element {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
  const recordHost = domain ? domain.split(".")[0] : "blog";

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

      {domain && (
        <div style={dnsBox}>
          <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "0 0 6px" }}>
            Add this DNS record at your domain provider, then it goes live automatically:
          </p>
          <code style={dnsRecord}>
            CNAME&nbsp;&nbsp;{recordHost}&nbsp;&nbsp;→&nbsp;&nbsp;{cname}
          </code>
        </div>
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

const dnsRecord: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--ink)",
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
