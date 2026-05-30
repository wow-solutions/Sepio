"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  addCompetitor,
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
  "network",
];

// Recompute runs inline in the route handler; the fetch resolves when it's done.
// EXPECTED_S drives the estimated bar (scrape ≤5 pages × N competitors + 1 LLM).
const EXPECTED_S = 90;

type RecomputePhase = "idle" | "running" | "done";

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
  const [isPending, startTransition] = useTransition();

  const [phase, setPhase] = useState<RecomputePhase>("idle");
  const [elapsed, setElapsed] = useState(0);

  // Tick the elapsed timer while a recompute is in flight (drives bar + label).
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function resolveError(key: string): string {
    return KNOWN_ERRORS.includes(key) ? t(`error.${key}`) : key;
  }

  function run(
    fn: () => Promise<CompetitorActionResult>,
    opts?: { onOk?: () => void },
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(resolveError(res.error));
        return;
      }
      opts?.onOk?.();
      router.refresh();
    });
  }

  async function startRecompute() {
    setError(null);
    setElapsed(0);
    setPhase("running");

    let res: Response;
    try {
      res = await fetch(`/api/brands/${brandId}/recompute-market-brain`, {
        method: "POST",
      });
    } catch {
      setPhase("idle");
      setError(resolveError("network"));
      return;
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setPhase("idle");
      setError(resolveError(data?.error ?? `HTTP ${res.status}`));
      return;
    }

    setPhase("done");
    router.refresh();
  }

  const approvedCount = competitors.filter((c) => c.status === "approved").length;
  const running = phase === "running";
  const busy = isPending || running;
  const barPct =
    phase === "done" ? 100 : Math.min(95, Math.round((elapsed / EXPECTED_S) * 100));

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
          disabled={busy}
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
        <button type="submit" disabled={busy || !url.trim()} style={primaryBtn(busy)}>
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
                  disabled={busy}
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
          disabled={busy || approvedCount === 0}
          onClick={startRecompute}
          style={secondaryBtn(busy || approvedCount === 0)}
        >
          {running ? t("recomputeRunning") : t("recompute")}
        </button>
        {!running && (
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{t("recomputeHint")}</span>
        )}
      </div>

      {/* Progress while running */}
      {running && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              height: 6,
              borderRadius: 9999,
              background: "var(--border-subtle)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${barPct}%`,
                background: "var(--sepio-sepia)",
                borderRadius: 9999,
                transition: "width 1s linear",
              }}
            />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-muted)" }}>
            {t("recomputeStatus")} · {formatElapsed(elapsed)}
          </p>
        </div>
      )}

      {phase === "done" && <Note tone="ok">{t("recomputeDone")}</Note>}
      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
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
