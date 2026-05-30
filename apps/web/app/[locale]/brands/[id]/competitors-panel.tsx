"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  addCompetitor,
  recomputeMarketBrain,
  setCompetitorStatus,
  type CompetitorActionResult,
} from "./actions";

type Competitor = { id: string; url: string; domain: string; status: string };

const KNOWN_ERRORS = [
  "invalidUrl",
  "notSignedIn",
  "duplicate",
  "brandNotFound",
  "noBetaAccess",
];

export function CompetitorsPanel({
  brandId,
  competitors,
}: {
  brandId: string;
  competitors: Competitor[];
}) {
  const t = useTranslations("brandDetail.marketBrain");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolveError(key: string): string {
    return KNOWN_ERRORS.includes(key) ? t(`error.${key}`) : key;
  }

  function run(
    fn: () => Promise<CompetitorActionResult>,
    opts?: { onOk?: () => void; refresh?: boolean },
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(resolveError(res.error));
        return;
      }
      opts?.onOk?.();
      if (opts?.refresh !== false) router.refresh();
    });
  }

  const approvedCount = competitors.filter((c) => c.status === "approved").length;

  return (
    <div
      style={{
        background: "var(--raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: 22,
      }}
    >
      {/* Add form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          run(() => addCompetitor(brandId, url), { onOk: () => setUrl("") });
        }}
        style={{ display: "flex", gap: 8, marginBottom: 16 }}
      >
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("addPlaceholder")}
          disabled={isPending}
          style={{
            flex: 1,
            height: 36,
            padding: "0 12px",
            background: "var(--bg)",
            color: "var(--ink)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <button type="submit" disabled={isPending || !url.trim()} style={primaryBtn(isPending)}>
          {t("addButton")}
        </button>
      </form>

      {/* List */}
      {competitors.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 16px" }}>
          {t("empty")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0 }}>
          {competitors.map((c) => {
            const disabled = c.status === "disabled";
            return (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: "var(--ink)",
                    textDecoration: "none",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {c.domain}
                  {disabled && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "var(--ink-faint)",
                      }}
                    >
                      {t("disabledTag")}
                    </span>
                  )}
                </a>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    run(() =>
                      setCompetitorStatus(c.id, brandId, disabled ? "approved" : "disabled"),
                    )
                  }
                  style={textBtn()}
                >
                  {disabled ? t("enable") : t("disable")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Recompute */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={isPending || approvedCount === 0}
          onClick={() =>
            run(() => recomputeMarketBrain(brandId), {
              refresh: false,
              onOk: () => setNotice(t("recomputeQueued")),
            })
          }
          style={secondaryBtn(isPending || approvedCount === 0)}
        >
          {t("recompute")}
        </button>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{t("recomputeHint")}</span>
      </div>

      {error && <Note tone="error">{error}</Note>}
      {notice && <Note tone="ok">{notice}</Note>}
    </div>
  );
}

function Note({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  const isErr = tone === "error";
  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 10px",
        borderRadius: 6,
        background: isErr ? "var(--risky-bg)" : "var(--pass-bg)",
        color: isErr ? "var(--risky)" : "var(--pass)",
        border: `1px solid ${isErr ? "rgba(194,104,90,0.20)" : "rgba(122,160,121,0.30)"}`,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

function primaryBtn(busy: boolean): React.CSSProperties {
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

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: 34,
    padding: "0 16px",
    background: "transparent",
    color: disabled ? "var(--ink-faint)" : "var(--ink)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function textBtn(): React.CSSProperties {
  return {
    background: "transparent",
    border: "none",
    color: "var(--ink-muted)",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 6px",
    whiteSpace: "nowrap",
  };
}
