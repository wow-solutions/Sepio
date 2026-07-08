"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const KNOWN_ERRORS = ["notSignedIn", "brandNotFound", "noBetaAccess", "network"];

// The run is inline in the route handler (4 engines × up to 15 questions via
// DataForSEO LLM Responses); the fetch resolves when it's done. EXPECTED_S
// drives the estimated bar — "2-4 min" per eng-review, so aim for the midpoint.
const EXPECTED_S = 180;

type Phase = "idle" | "running" | "done" | "alreadyRunning";

export function AiVisibilityMeasureButton({ brandId }: { brandId: string }) {
  const t = useTranslations("brandDetail.aiVisibility");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function resolveError(key: string): string {
    return KNOWN_ERRORS.includes(key) ? t(`error.${key}`) : key;
  }

  async function startMeasure() {
    setError(null);
    setElapsed(0);
    setPhase("running");

    let res: Response;
    try {
      res = await fetch(`/api/brands/${brandId}/ai-visibility`, { method: "POST" });
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

    const data = (await res.json().catch(() => null)) as {
      runId: string;
      status: string;
      alreadyRunning?: boolean;
    } | null;

    if (data?.alreadyRunning) {
      setPhase("alreadyRunning");
      return;
    }

    setPhase("done");
    router.refresh();
  }

  const running = phase === "running";
  const barPct = phase === "done" ? 100 : Math.min(95, Math.round((elapsed / EXPECTED_S) * 100));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" disabled={running} onClick={startMeasure} style={secondaryBtn(running)}>
          {running ? t("measureRunning") : t("measureButton")}
        </button>
        {!running && <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{t("measureHint")}</span>}
      </div>

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
            {t("measureRunningStatus")} · {formatElapsed(elapsed)}
          </p>
        </div>
      )}

      {phase === "done" && <Note tone="ok">{t("measureDone")}</Note>}
      {phase === "alreadyRunning" && <Note tone="ok">{t("alreadyRunning")}</Note>}
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
    whiteSpace: "nowrap",
  };
}
