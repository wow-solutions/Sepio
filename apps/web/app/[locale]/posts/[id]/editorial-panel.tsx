"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { applyBrandRule, updatePostContent } from "./actions";
import { primaryPill } from "@/components/ui/button-styles";
import { RULE_TYPES, RULE_SCOPES, type RuleType, type RuleScope } from "@/lib/brand-rules/schema";
import type { RefineResponseBody } from "@/lib/brand-rules/refine-response";

// Editorial Memory editor panel (T8). Instruction → refine route (2 parallel
// LLM calls) → side-by-side diff + a proposed-rule card with a single
// "Remember" checkbox (default off) + one Apply, per the approved mockup
// (designs/editorial-memory-panel-20260601/board.html). Apply unchecked =
// post-only (updatePostContent); checked = atomic post+rule (applyBrandRule).

const EXPECTED_S = 8;
type Phase = "idle" | "running" | "result";

export function EditorialPanel({
  postId,
  currentContent,
  brandId,
  onApplied,
  disabled = false,
  disabledHint,
}: {
  postId: string;
  currentContent: string;
  brandId: string;
  // When provided (writer edit mode), a successful rewrite-apply calls this with
  // the new body instead of router.refresh() — the writer owns the live editor
  // state, so there is no server page to refresh.
  onApplied?: (newContent: string) => void;
  // Disable the trigger (e.g. the writer has unsaved edits — refine would diff
  // against the stale DB copy and Apply could clobber the local edit).
  disabled?: boolean;
  disabledHint?: string;
}) {
  const t = useTranslations("posts.detail.editorial");
  const router = useRouter();

  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RefineResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable rule fields (design Cl1: label, text, type, scope are editable).
  const [ruleType, setRuleType] = useState<RuleType>("voice_note");
  const [scope, setScope] = useState<RuleScope>("global");
  const [ruleText, setRuleText] = useState("");
  const [humanLabel, setHumanLabel] = useState("");
  const [remember, setRemember] = useState(false);
  const [factDismissed, setFactDismissed] = useState(false);

  const [applying, startApply] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const tmr = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(tmr);
  }, [phase]);

  // Invalidate a rendered result when the underlying content changes (writer
  // edit mode pushes the live editor body in via currentContent). A rewrite
  // computed against the previous body must not be applied over a newer one.
  // The typed instruction is kept; only the stale diff/rule are cleared.
  // Functional updaters return the same value when there's nothing to clear, so
  // React bails out — no cascading render on an unrelated content change.
  useEffect(() => {
    setPhase((p) => (p === "idle" ? p : "idle"));
    setResult((r) => (r === null ? r : null));
    setApplyError((e) => (e === null ? e : null));
  }, [currentContent]);

  function reset() {
    setPhase("idle");
    setInstruction("");
    setResult(null);
    setRemember(false);
    setFactDismissed(false);
    setApplyError(null);
  }

  async function onRewrite() {
    if (!instruction.trim() || phase === "running" || disabled) return;
    setError(null);
    setNotice(null);
    setResult(null);
    setElapsed(0);
    setPhase("running");

    let res: Response;
    try {
      res = await fetch(`/api/posts/${postId}/refine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
    } catch {
      setPhase("idle");
      setError(t("error.network"));
      return;
    }

    if (!res.ok) {
      setPhase("idle");
      if (res.status === 403) setError(t("error.noBetaAccess"));
      else if (res.status === 409) setError(t("error.published"));
      else if (res.status === 502) setError(t("error.extract"));
      else setError(t("error.generic"));
      return;
    }

    const body = (await res.json().catch(() => null)) as RefineResponseBody | null;
    if (!body) {
      setPhase("idle");
      setError(t("error.generic"));
      return;
    }

    if (body.proposed_rule) {
      setRuleType(body.proposed_rule.rule_type);
      setScope(body.proposed_rule.scope);
      setRuleText(body.proposed_rule.rule_text);
      setHumanLabel(body.proposed_rule.human_label);
    }
    setRemember(false);
    setResult(body);
    setPhase("result");
  }

  function onTypeChange(next: RuleType) {
    setRuleType(next);
    // Cl2: only voice_note may carry opening/body; force global otherwise.
    if (next !== "voice_note") setScope("global");
  }

  const hasRule = !!result?.proposed_rule;
  const isFact = result?.edit_kind === "brand_fact" && !!result?.proposed_fact;

  function onApply() {
    // Block applying a stale rewrite while the editor is dirty (writer edit
    // mode): the result was computed against the saved body, not the live edit.
    if (!result || disabled) return;
    setApplyError(null);
    setNotice(null);

    const ruleObj = hasRule
      ? {
          rule_type: ruleType,
          scope,
          rule_text: ruleText.trim(),
          human_label: humanLabel.trim(),
          rationale: result.proposed_rule?.rationale ?? null,
        }
      : null;

    // In writer edit mode (onApplied present) the writer owns the live editor,
    // so a content change is pushed via onApplied instead of router.refresh().
    const newBody = result.rewritten_post;
    startApply(async () => {
      // No rewrite to apply, but there's a rule → save-rule-only path. No content
      // change, so nothing to push to the writer.
      if (!newBody) {
        if (!ruleObj) return;
        const r = await applyBrandRule({ postId, rule: ruleObj });
        if (!r.ok) return setApplyError(r.error);
        setNotice(t("ruleSaved"));
        reset();
        if (!onApplied) router.refresh();
        return;
      }

      // Rewrite present. Checked + rule → atomic post+rule; else post-only.
      if (remember && ruleObj) {
        const r = await applyBrandRule({
          postId,
          rule: ruleObj,
          rewrittenText: newBody,
        });
        if (!r.ok) return setApplyError(r.error);
        if (!r.postUpdated) {
          // Honest partial: rule saved, post not updated (content unchanged).
          setApplyError(t("ruleSavedPostNot"));
          if (!onApplied) router.refresh();
          return;
        }
      } else {
        const r = await updatePostContent(postId, newBody);
        if (!r.ok) return setApplyError(r.error);
      }
      setNotice(t("applied"));
      if (onApplied) onApplied(newBody);
      else router.refresh();
      reset();
    });
  }

  // ── Trigger row (always visible) ──
  const busy = phase === "running" || applying;
  const barPct =
    phase === "result"
      ? 100
      : Math.min(95, Math.round((elapsed / EXPECTED_S) * 100));

  return (
    <section style={wrap}>
      <style>{PANEL_CSS}</style>
      <h3 style={heading}>{t("heading")}</h3>

      <div className="em-instr">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            // Ignore Enter while an IME composition is active (Russian/CJK users
            // confirming a candidate) — only submit on a real Enter (R-08).
            if (e.key === "Enter" && !e.nativeEvent.isComposing) onRewrite();
          }}
          placeholder={t("placeholder")}
          disabled={busy || disabled}
          style={instrInput}
        />
        <button
          type="button"
          onClick={onRewrite}
          disabled={busy || disabled || !instruction.trim()}
          className="em-apply"
          style={primaryBtn(busy || disabled || !instruction.trim())}
        >
          {phase === "running" ? t("rewriting") : t("rewrite")}
        </button>
      </div>

      {disabled && disabledHint && <Note tone="muted">{disabledHint}</Note>}

      {error && <Note tone="error">{error}</Note>}
      {notice && <Note tone="ok">{notice}</Note>}

      {/* Loading */}
      {phase === "running" && (
        <div style={{ marginTop: 16 }}>
          <div style={loadRow}>
            <span className="em-spin" style={spinner} />
            <span style={{ fontSize: 13.5, color: "var(--ink)" }}>
              {t("loadingLabel")}
            </span>
          </div>
          <div style={barOuter}>
            <div style={{ ...barInner, width: `${barPct}%` }} />
          </div>
          <div style={loadSub}>
            <span>{t("loadingHint")}</span>
            <span>{formatElapsed(elapsed)}</span>
          </div>
          <div style={{ marginTop: 16 }}>
            {[96, 88, 92, 54].map((w, i) => (
              <div key={i} style={{ ...skelLine, width: `${w}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {phase === "result" && result && (
        <div style={{ marginTop: 16 }}>
          {result.rewritten_post ? (
            <>
              <div className="em-cols">
                <div style={diffCol}>
                  <p style={colH}>{t("current")}</p>
                  <div style={{ ...postText, color: "var(--ink-muted)" }}>
                    {currentContent}
                  </div>
                </div>
                <div style={{ ...diffCol, borderColor: "rgba(122,160,121,.25)" }}>
                  <p style={{ ...colH, color: "var(--pass)" }}>{t("rewritten")}</p>
                  <div style={postText}>{result.rewritten_post}</div>
                </div>
              </div>
            </>
          ) : (
            <Note tone="muted">{t("noRewrite")}</Note>
          )}

          {/* Rule card (voice_rule) */}
          {hasRule && (
            <RuleCard
              t={t}
              active={remember && !!result.rewritten_post}
              humanLabel={humanLabel}
              setHumanLabel={setHumanLabel}
              ruleText={ruleText}
              setRuleText={setRuleText}
              ruleType={ruleType}
              onTypeChange={onTypeChange}
              scope={scope}
              setScope={setScope}
              risk={result.safety_check?.overgeneralization_risk ?? "low"}
            />
          )}

          {/* Fact nudge (brand_fact) — never auto-written */}
          {isFact && !factDismissed && result.proposed_fact && (
            <div style={factCard}>
              <p style={eyebrow}>{t("factTitle")}</p>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink)" }}>
                {result.proposed_fact.fact_text}
              </p>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Link
                  href={`/brands/${brandId}/settings`}
                  style={{ fontSize: 13, color: "var(--sepia-bright)", textDecoration: "none", fontWeight: 500 }}
                >
                  {t("factCta")}
                </Link>
                <button type="button" onClick={() => setFactDismissed(true)} style={textBtn}>
                  {t("factDismiss")}
                </button>
              </div>
            </div>
          )}

          {/* Extract failed (rewrite present, no rule) */}
          {result.extract_failed && result.rewritten_post && (
            <Note tone="muted">{t("extractFailed")}</Note>
          )}
          {/* One-off (rewrite present, no rule, extraction succeeded) */}
          {!hasRule && !isFact && !result.extract_failed && result.rewritten_post && (
            <Note tone="muted">{t("oneOff")}</Note>
          )}
          {/* Nothing actionable */}
          {!result.rewritten_post && !hasRule && !isFact && (
            <Note tone="muted">{t("nothing")}</Note>
          )}

          {applyError && <Note tone="error">{applyError}</Note>}

          {/* Remember checkbox — only when a rule AND a rewrite both exist */}
          {hasRule && result.rewritten_post && (
            <label style={chkRow}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 17, height: 17, accentColor: "var(--sepia-bright)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                  {t("remember")}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 1 }}>
                  {t("rememberSub")}
                </span>
              </span>
            </label>
          )}

          {/* Commit row */}
          {(result.rewritten_post || hasRule) && (
            <div style={commitRow}>
              <button
                type="button"
                onClick={onApply}
                disabled={applying || disabled}
                className="em-apply"
                style={primaryBtn(applying || disabled)}
              >
                {applying
                  ? t("applying")
                  : result.rewritten_post
                    ? t("apply")
                    : t("saveRule")}
              </button>
              {result.rewritten_post && (
                <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ink-muted)" }}>
                  {remember && hasRule ? (
                    <>
                      {t("confirmOnPre")}
                      <strong style={{ color: "var(--sepia-bright)", fontWeight: 600 }}>
                        {t("confirmOnOut")}
                      </strong>
                    </>
                  ) : (
                    <>
                      {t("confirmOffPre")}
                      <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                        {t("confirmOffOut")}
                      </strong>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Rule card ────────────────────────────────────────────────────────────────
function RuleCard({
  t,
  active,
  humanLabel,
  setHumanLabel,
  ruleText,
  setRuleText,
  ruleType,
  onTypeChange,
  scope,
  setScope,
  risk,
}: {
  t: ReturnType<typeof useTranslations>;
  active: boolean;
  humanLabel: string;
  setHumanLabel: (v: string) => void;
  ruleText: string;
  setRuleText: (v: string) => void;
  ruleType: RuleType;
  onTypeChange: (v: RuleType) => void;
  scope: RuleScope;
  setScope: (v: RuleScope) => void;
  risk: "low" | "medium" | "high";
}) {
  const pill =
    ruleType === "voice_note" ? t(`scopeOpt.${scope}`) : t(`ruleType.${ruleType}`);
  return (
    <div style={{ ...ruleCard, borderColor: active ? "var(--sepia-bright)" : "var(--border-strong)" }}>
      <p style={eyebrow}>{t("proposedRule")}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          value={humanLabel}
          onChange={(e) => setHumanLabel(e.target.value)}
          aria-label={t("field.label")}
          style={{ ...fieldInput, fontWeight: 600, flex: 1, minWidth: 180 }}
        />
        <span style={pillStyle}>{pill}</span>
      </div>

      <textarea
        value={ruleText}
        onChange={(e) => setRuleText(e.target.value)}
        aria-label={t("field.text")}
        rows={2}
        style={{ ...fieldInput, width: "100%", resize: "vertical", lineHeight: 1.5 }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <label style={selLabel}>
          {t("field.type")}
          <select
            value={ruleType}
            onChange={(e) => onTypeChange(e.target.value as RuleType)}
            style={selectStyle}
          >
            {RULE_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {t(`ruleType.${rt}`)}
              </option>
            ))}
          </select>
        </label>
        <label style={selLabel}>
          {t("field.scope")}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as RuleScope)}
            disabled={ruleType !== "voice_note"}
            style={{ ...selectStyle, opacity: ruleType !== "voice_note" ? 0.5 : 1 }}
          >
            {RULE_SCOPES.map((s) => (
              <option key={s} value={s}>
                {t(`scopeOpt.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(risk === "medium" || risk === "high") && (
        <div style={caution}>
          <span style={cautionTag}>{t("riskTag")}</span>
          <span>{t("riskBroad")}</span>
        </div>
      )}
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: "error" | "ok" | "muted";
  children: React.ReactNode;
}) {
  const map = {
    error: { bg: "var(--risky-bg)", fg: "var(--risky)", bd: "rgba(194,104,90,0.20)" },
    ok: { bg: "var(--pass-bg)", fg: "var(--pass)", bd: "rgba(122,160,121,0.30)" },
    muted: { bg: "var(--surface-deep)", fg: "var(--ink-muted)", bd: "var(--border-subtle)" },
  }[tone];
  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 11px",
        borderRadius: 6,
        background: map.bg,
        color: map.fg,
        border: `1px solid ${map.bd}`,
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── styles ───────────────────────────────────────────────────────────────────
const PANEL_CSS = `
@keyframes em-spin { to { transform: rotate(360deg); } }
.em-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.em-instr { display: flex; gap: 10px; }
@media (max-width: 700px) {
  .em-cols { grid-template-columns: 1fr; }
  .em-instr { flex-wrap: wrap; }
  .em-apply { min-height: 44px; }
}
`;

const wrap: CSSProperties = {
  marginTop: 24,
  background: "var(--surface)",
  border: "1px solid var(--border-subtle)",
  borderTop: "1px dashed var(--border-strong)",
  borderRadius: 8,
  padding: 18,
};
const heading: CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontWeight: 500,
  fontSize: 14,
  color: "var(--ink)",
  margin: "0 0 12px",
};
const instrInput: CSSProperties = {
  flex: 1,
  minWidth: 160,
  background: "var(--surface-deep)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  color: "var(--ink)",
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
};
const loadRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 };
const spinner: CSSProperties = {
  width: 15,
  height: 15,
  border: "2px solid var(--border-strong)",
  borderTopColor: "var(--sepia-bright)",
  borderRadius: "50%",
  animation: "em-spin 0.8s linear infinite",
  display: "inline-block",
};
const barOuter: CSSProperties = {
  height: 5,
  background: "var(--surface-deep)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 999,
  overflow: "hidden",
};
const barInner: CSSProperties = {
  height: "100%",
  background: "var(--sepia-bright)",
  borderRadius: 999,
  transition: "width 1s linear",
};
const loadSub: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 7,
  color: "var(--ink-faint)",
  fontSize: 11,
};
const skelLine: CSSProperties = {
  height: 11,
  background: "var(--surface-deep)",
  borderRadius: 4,
  marginBottom: 9,
};
const diffCol: CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: 7,
  padding: "13px 15px",
  background: "var(--surface-deep)",
};
const colH: CSSProperties = {
  fontSize: 11,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
  margin: "0 0 8px",
};
const postText: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.7,
  color: "var(--ink)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};
const ruleCard: CSSProperties = {
  marginTop: 18,
  background: "var(--raised)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "14px 16px",
};
const factCard: CSSProperties = {
  marginTop: 18,
  background: "var(--borderline-bg)",
  border: "1px solid rgba(201,166,107,.22)",
  borderRadius: 8,
  padding: "14px 16px",
};
const eyebrow: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: ".07em",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
  margin: "0 0 8px",
};
const fieldInput: CSSProperties = {
  background: "var(--surface-deep)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  color: "var(--ink)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "inherit",
};
const selLabel: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  color: "var(--ink-faint)",
};
const selectStyle: CSSProperties = {
  background: "var(--surface-deep)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  color: "var(--ink)",
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "inherit",
};
const pillStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--borderline-ink)",
  border: "1px solid rgba(201,166,107,.35)",
  borderRadius: 999,
  padding: "1px 9px",
  whiteSpace: "nowrap",
};
const caution: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  marginTop: 11,
  padding: "8px 11px",
  background: "var(--borderline-bg)",
  border: "1px solid rgba(201,166,107,.22)",
  borderRadius: 6,
  color: "var(--borderline-ink)",
  fontSize: 12,
  lineHeight: 1.45,
};
const cautionTag: CSSProperties = {
  fontSize: 10,
  letterSpacing: ".06em",
  fontWeight: 600,
  textTransform: "uppercase",
  color: "var(--borderline)",
  border: "1px solid rgba(201,166,107,.4)",
  borderRadius: 3,
  padding: "1px 5px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
const chkRow: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  marginTop: 16,
  cursor: "pointer",
};
const commitRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  marginTop: 16,
};
const textBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--ink-muted)",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
};

function primaryBtn(disabled: boolean): CSSProperties {
  // Shared sepia pill — one primary vocabulary across writer/kitchen/panel.
  return { ...primaryPill({ disabled, height: 38 }), padding: "0 20px" };
}
