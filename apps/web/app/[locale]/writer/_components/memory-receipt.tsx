"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AppliedRule } from "@/lib/applied-rules";
import { RULE_TYPES, RULE_SCOPES } from "@/lib/brand-rules/schema";

// W2 memory receipt — the visible payoff of the learning loop: "Sepio applied
// N rules" after a generation, expandable to the rule list. Renders from the
// persisted snapshot ONLY (never resolves rule ids — a rule may have been
// edited/deleted since).
//
// Semantics mirror posts.applied_rules (null ≠ []):
//   null/undefined → not tracked (pre-W2 post, rules read error) → render NOTHING;
//   []             → tracked, zero rules → the "teach Sepio" CTA;
//   [n]            → the receipt + expandable list.
//
// CTA affordance: `onTeach` (writer/kitchen — focus the Editorial panel below)
// or `teachHref` (post-view — link into the writer). Neither → plain text.

// Focus + reveal the Editorial Memory instruction input (the panel is mounted
// on the same surface as the receipt in both the writer and the kitchen).
export const EDITORIAL_INSTRUCTION_ID = "em-instruction";
export function focusEditorialPanel() {
  const el = document.getElementById(EDITORIAL_INSTRUCTION_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

export function MemoryReceipt({
  applied,
  onTeach,
  teachHref,
}: {
  applied: AppliedRule[] | null | undefined;
  onTeach?: () => void;
  teachHref?: string;
}) {
  const t = useTranslations("writer.receipt");
  const [open, setOpen] = useState(false);

  if (applied == null) return null;

  if (applied.length === 0) {
    return (
      <div style={{ ...shell, justifyContent: "space-between" }}>
        <span style={{ color: "var(--ink-muted)" }}>{t("empty")}</span>
        {onTeach ? (
          <button type="button" onClick={onTeach} style={ctaBtn}>
            {t("teachCta")}
          </button>
        ) : teachHref ? (
          <Link href={teachHref} style={{ ...ctaBtn, textDecoration: "none" }}>
            {t("teachCta")}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ ...shell, flexDirection: "column", alignItems: "stretch" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={headerBtn}
      >
        <span style={dot} aria-hidden />
        <span style={{ flex: 1, textAlign: "left", color: "var(--ink)" }}>
          {t("applied", { count: applied.length })}
        </span>
        <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>
          {open ? t("hide") : t("show")} {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul style={list}>
          {applied.map((r, i) => (
            <li key={r.id || `${i}`} style={row}>
              <span style={pill}>{pillLabel(r, t)}</span>
              <span style={ruleLabel}>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// voice_note rules read best by their scope (Opening/Body/Whole post) — same
// vocabulary as the Editorial panel's rule card; other types by type label.
// Snapshot values outside the known enums (a future rename) fall back to the
// raw string rather than crashing on a missing i18n key.
function pillLabel(
  r: AppliedRule,
  t: ReturnType<typeof useTranslations>,
): string {
  if (
    r.rule_type === "voice_note" &&
    (RULE_SCOPES as readonly string[]).includes(r.scope)
  ) {
    return t(`scope.${r.scope}`);
  }
  if ((RULE_TYPES as readonly string[]).includes(r.rule_type)) {
    return t(`type.${r.rule_type}`);
  }
  return r.rule_type;
}

// ── styles ───────────────────────────────────────────────────────────────────
const shell: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 16,
  padding: "10px 14px",
  background: "var(--surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  fontSize: 12.5,
  lineHeight: 1.45,
};
const headerBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: 0,
  border: 0,
  background: "transparent",
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
};
const dot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--sepia-bright)",
  flexShrink: 0,
};
const list: CSSProperties = {
  listStyle: "none",
  margin: "10px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 7,
};
const row: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
};
const pill: CSSProperties = {
  fontSize: 10.5,
  color: "var(--borderline-ink)",
  border: "1px solid rgba(201,166,107,.35)",
  borderRadius: 999,
  padding: "1px 8px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
const ruleLabel: CSSProperties = {
  fontSize: 12.5,
  color: "var(--ink-muted)",
  overflowWrap: "anywhere",
};
const ctaBtn: CSSProperties = {
  border: "1px solid var(--border-strong)",
  background: "transparent",
  color: "var(--sepia-bright)",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
};
