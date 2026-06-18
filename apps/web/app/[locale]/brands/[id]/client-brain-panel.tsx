"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ClientBrainFacts } from "@/lib/client-brain/schema";

const KNOWN_ERRORS = [
  "noWebsite",
  "invalidUrl",
  "siteUnreachable",
  "emptySite",
  "extractFailed",
  "persistFailed",
  "notSignedIn",
  "brandNotFound",
  "network",
];

// Study runs inline in the route handler (1 page fetch + 1 LLM call); the fetch
// resolves when it's done. EXPECTED_S drives the estimated bar.
const EXPECTED_S = 40;

type Phase = "idle" | "running" | "done";

export function ClientBrainPanel({
  brandId,
  website,
  facts,
}: {
  brandId: string;
  website: string | null;
  facts: ClientBrainFacts;
}) {
  const t = useTranslations("brandDetail.clientBrain");
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

  async function study() {
    setError(null);
    setElapsed(0);
    setPhase("running");
    let res: Response;
    try {
      res = await fetch(`/api/brands/${brandId}/study-site`, { method: "POST" });
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

  const running = phase === "running";
  const hasFacts =
    facts.services.length > 0 ||
    facts.locations.length > 0 ||
    facts.pricing.length > 0 ||
    facts.proofItems.length > 0;
  const barPct = phase === "done" ? 100 : Math.min(95, Math.round((elapsed / EXPECTED_S) * 100));

  return (
    <div
      style={{
        background: "var(--raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
          {website ? t("intro", { website }) : t("noWebsiteHint")}
        </p>
        <button
          type="button"
          disabled={running || !website}
          onClick={study}
          style={secondaryBtn(running || !website)}
        >
          {running ? t("running") : hasFacts ? t("restudy") : t("study")}
        </button>
      </div>

      {running && (
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 6, borderRadius: 9999, background: "var(--border-subtle)", overflow: "hidden" }}>
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
            {t("runningStatus")} · {formatElapsed(elapsed)}
          </p>
        </div>
      )}

      {error && <Note tone="error">{error}</Note>}
      {phase === "done" && !error && <Note tone="ok">{t("done")}</Note>}

      {hasFacts && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          {facts.services.length > 0 && (
            <Section label={t("servicesLabel")}>
              <ul style={listStyle()}>
                {facts.services.map((s, i) => (
                  <li key={i} style={itemStyle()}>
                    <strong>{s.name}</strong>
                    {s.description ? ` — ${s.description}` : ""}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {facts.locations.length > 0 && (
            <Section label={t("locationsLabel")}>
              <p style={{ fontSize: 13, color: "var(--ink)", margin: 0 }}>
                {facts.locations.join(", ")}
              </p>
            </Section>
          )}
          {facts.pricing.length > 0 && (
            <Section label={t("pricingLabel")}>
              <ul style={listStyle()}>
                {facts.pricing.map((p, i) => (
                  <li key={i} style={itemStyle()}>
                    <strong>{p.label}</strong>
                    {p.detail ? ` — ${p.detail}` : ""}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {facts.proofItems.length > 0 && (
            <Section label={t("proofLabel")}>
              <ul style={listStyle()}>
                {facts.proofItems.map((p, i) => (
                  <li key={i} style={itemStyle()}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ink-faint)",
                        marginRight: 8,
                      }}
                    >
                      {p.kind}
                    </span>
                    {p.body}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--ink-faint)",
          margin: "0 0 8px",
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function listStyle(): React.CSSProperties {
  return { listStyle: "none", margin: 0, padding: 0 };
}

function itemStyle(): React.CSSProperties {
  return { fontSize: 13, color: "var(--ink)", padding: "4px 0" };
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
