"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { connectWordPress, disconnectWordPress } from "./actions";

// "Connect WordPress" card for the brand detail page. Mirrors the LinkedIn card
// container + the CompetitorsPanel client-action interaction shape. English-only
// for now (i18n is a follow-up).

// Map the known error CODES from connectWordPress to friendly English. Anything
// not in this map is a raw DB message — show it verbatim.
const ERROR_MESSAGES: Record<string, string> = {
  notSignedIn: "You're signed out. Refresh the page and try again.",
  brandNotFound: "Brand not found.",
  missingFields: "Fill in the site URL, username, and Application Password.",
  invalidCredential:
    "Could not sign in to WordPress — check the site URL, username, and Application Password.",
};

function resolveError(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

export function WordPressConnect({
  brandId,
  connected,
  accountHandle,
}: {
  brandId: string;
  connected: boolean;
  accountHandle: string | null;
}): React.JSX.Element {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await connectWordPress(brandId, {
          siteUrl: siteUrl.trim(),
          username: username.trim(),
          appPassword,
        });
        if (!res.ok) {
          setError(resolveError(res.error));
          return;
        }
        setSiteUrl("");
        setUsername("");
        setAppPassword("");
        router.refresh();
      } catch {
        setError("Something went wrong connecting WordPress. Please try again.");
      }
    });
  }

  function handleDisconnect() {
    if (!window.confirm("Disconnect this WordPress site?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await disconnectWordPress(brandId);
        router.refresh();
      } catch {
        setError("Could not disconnect. Please try again.");
      }
    });
  }

  return (
    <div style={card}>
      {/* Header: title + status, with disconnect on the right when connected */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--ink)",
              margin: "0 0 4px",
            }}
          >
            WordPress
          </h3>
          <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
            {connected ? (
              <>
                Connected as <strong>@{accountHandle}</strong>
              </>
            ) : (
              "Not connected"
            )}
          </p>
        </div>

        {connected && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleDisconnect}
            style={dangerBtn}
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Connect form (only when not connected) */}
      {!connected && (
        <form onSubmit={handleConnect} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yoursite.com"
              disabled={isPending}
              style={inputStyle}
            />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              disabled={isPending}
              style={inputStyle}
            />
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="Application Password"
              disabled={isPending}
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="submit" disabled={isPending} style={primaryBtn(isPending)}>
              {isPending ? "Connecting…" : "Connect WordPress"}
            </button>
          </div>

          <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "10px 0 0", lineHeight: 1.4 }}>
            Use a WordPress Application Password (Users → Profile → Application
            Passwords), not your login password.
          </p>
        </form>
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
