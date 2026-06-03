"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  toggleBrandRule,
  deleteBrandRule,
  type RuleActionResult,
} from "./settings/rules-actions";

// Editorial Memory rule management (T8c). Lists the brand's learned rules with a
// toggle + delete each. Inline edit is soft-deferred (design S2). Mirrors the
// CompetitorsPanel interaction shape.

export type BrandRuleRow = {
  id: string;
  rule_type: string;
  scope: string;
  rule_text: string;
  human_label: string;
  active: boolean;
  source_post_id: string | null;
};

export function RulesPanel({
  rules,
}: {
  brandId: string;
  rules: BrandRuleRow[];
}) {
  const t = useTranslations("brandDetail.editorialMemory");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<RuleActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (rules.length === 0) {
    return (
      <div style={card}>
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
          {t("empty")}
        </p>
      </div>
    );
  }

  // Active first, then by creation order (rules array already created-asc).
  const ordered = [...rules].sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <div style={card}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {ordered.map((r) => {
          const pill =
            r.rule_type === "voice_note"
              ? t(`scopeOpt.${r.scope}`)
              : t(`ruleType.${r.rule_type}`);
          return (
            <li
              key={r.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                padding: "12px 0",
                borderBottom: "1px solid var(--border-subtle)",
                opacity: r.active ? 1 : 0.5,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                    {r.human_label}
                  </span>
                  <span style={pillStyle}>{pill}</span>
                  {!r.active && <span style={offTag}>{t("offTag")}</span>}
                </div>
                <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: "3px 0 0", lineHeight: 1.45 }}>
                  {r.rule_text}
                </p>
                {r.source_post_id === null && (
                  <p style={{ fontSize: 11, color: "var(--ink-faint)", margin: "3px 0 0" }}>
                    {t("sourceDeleted")}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => toggleBrandRule(r.id, !r.active))}
                  style={textBtn}
                >
                  {r.active ? t("disable") : t("enable")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("deleteConfirm"))) {
                      run(() => deleteBrandRule(r.id));
                    }
                  }}
                  style={{ ...textBtn, color: "var(--risky)" }}
                >
                  {t("delete")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p style={{ fontSize: 12, color: "var(--risky)", margin: "12px 0 0" }}>{error}</p>
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
const pillStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--borderline-ink)",
  border: "1px solid rgba(201,166,107,.35)",
  borderRadius: 999,
  padding: "1px 9px",
  whiteSpace: "nowrap",
};
const offTag: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--ink-faint)",
};
const textBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--ink-muted)",
  fontSize: 12,
  cursor: "pointer",
  padding: "4px 6px",
  whiteSpace: "nowrap",
};
