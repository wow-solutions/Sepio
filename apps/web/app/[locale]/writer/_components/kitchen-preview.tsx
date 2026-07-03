"use client";

// KitchenCenter — the CENTER editor area when a non-blog channel is active in
// the rail. It shows the article AS IT WILL LOOK on that channel, with an
// animated Preview / Edit segmented toggle at the top-left. Preview = read-only
// render; Edit = a textarea that saves the variant post. Regenerate re-fans from
// the source; Copy puts the text on the clipboard.
//
// The blog ('hosted') is the source and keeps the normal editor — this only
// renders for a generated channel variant.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { useKitchen } from "@/components/shell/kitchen-context";
import { CHANNEL_LABEL } from "@/lib/kitchen/channel-formats";
import { EditorialPanel } from "@/app/[locale]/posts/[id]/editorial-panel";
import { MemoryReceipt, focusEditorialPanel } from "./memory-receipt";
import { GenerationProgress } from "./generation-progress";
import { primaryPill } from "@/components/ui/button-styles";
import { saveDraft } from "../actions";

export type ViewMode = "preview" | "edit";

// Publishing moved to the writer-footer "Publish ▾" destination picker, which
// fans out over the selected channels. This center is editor-only now: Preview/
// Edit, Save, Regenerate, Copy, Editorial Memory.
export function KitchenCenter({
  mode,
  onModeChange,
  betaAccess = false,
  sourceTitle,
  ruleCount = null,
  onRuleCount,
}: {
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  betaAccess?: boolean;
  sourceTitle?: string;
  // "Sepio knows N rules" badge state — owned by the writer (shared with the
  // blog editor's panel), refreshed via onRuleCount after a rule save (W2).
  ruleCount?: number | null;
  onRuleCount?: (n: number) => void;
}) {
  const t = useTranslations("writer");
  const {
    active,
    variants,
    source,
    regenerate,
    updateVariantBody,
    registerFlush,
  } = useKitchen();
  const variant = active === "hosted" ? undefined : variants[active];

  const [draft, setDraft] = useState("");
  const [pending, startSave] = useTransition();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [humanizing, setHumanizing] = useState(false);
  const [humanizeSnapshot, setHumanizeSnapshot] = useState<string | null>(null);

  const body = variant?.body ?? "";
  useEffect(() => {
    setDraft(body);
    setSaveErr(null);
    setHumanizeSnapshot(null);
  }, [body, active]);

  const dirty = draft !== body;
  // A published variant is read-only (the backend saveDraft also rejects it).
  // Reachable now that opening a group can land directly on a published channel.
  const isPublished = variant?.state === "published";

  // Expose this channel's unsaved draft to the publish fan-out: when the picker
  // publishes, it flushes the active editor first so the live edit is persisted
  // (replaces the save-then-publish the removed per-channel button used to do).
  useEffect(() => {
    registerFlush(async () => {
      const pid = variant?.postId;
      if (!pid || isPublished || draft === body) return true;
      const r = await saveDraft(pid, draft);
      if (r.ok) updateVariantBody(active, draft);
      return r.ok;
    });
    return () => registerFlush(null);
  }, [registerFlush, variant?.postId, isPublished, draft, body, active, updateVariantBody]);

  // Humanize the LIVE draft of this variant via the stateless /api/posts/humanize
  // (mirrors the blog editor's onHumanize). Leaves the result in `draft` so the
  // existing Save persists it — humanize itself does not touch the DB.
  async function onHumanize() {
    if (!draft.trim() || humanizing) return;
    setSaveErr(null);
    const snapshot = draft;
    setHumanizing(true);
    try {
      const res = await fetch("/api/posts/humanize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft, brand_id: source?.brandId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        setSaveErr(
          data && typeof data.error === "string" && data.error
            ? data.error
            : `HTTP ${res.status}`,
        );
        return;
      }
      const data = (await res.json()) as { text: string };
      setHumanizeSnapshot(snapshot);
      setDraft(data.text);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Network error");
    } finally {
      setHumanizing(false);
    }
  }

  function onUndoHumanize() {
    if (humanizeSnapshot === null) return;
    setDraft(humanizeSnapshot);
    setHumanizeSnapshot(null);
  }

  function onSave() {
    const postId = variant?.postId;
    if (!postId) return;
    setSaveErr(null);
    startSave(async () => {
      const r = await saveDraft(postId, draft);
      if (!r.ok) setSaveErr(r.error);
      // Keep the context body in sync — otherwise `dirty` stays true forever and
      // switching channels and back would resurrect the pre-save text. State is
      // left untouched (saveDraft doesn't persist variant_state).
      else updateVariantBody(active, draft);
    });
  }

  return (
    <>
      {/* Header bar — article topic (read-only) on the left like the blog editor,
          Preview/Edit toggle centered over the text column, channel name pinned
          right. minmax(0,1fr) lets the topic truncate without shoving the toggle
          off-center. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
          alignItems: "center",
          gap: 14,
          padding: "12px 32px",
          borderBottom: "1px solid var(--border-subtle)",
          height: 56,
          flexShrink: 0,
        }}
      >
        <span
          title={sourceTitle || undefined}
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--ink-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {sourceTitle}
        </span>
        <SegToggle
          mode={mode}
          onChange={onModeChange}
          previewLabel={t("kitchen.preview")}
          editLabel={t("kitchen.edit")}
        />
        <span
          style={{
            justifySelf: "end",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {CHANNEL_LABEL[active]}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 32px 24px", minHeight: 0 }}>
        <div style={{ maxWidth: "var(--editor-max-w)", margin: "0 auto" }}>
          {variant?.state === "stale" && !variant.loading && !variant.error && body && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(176,123,80,0.10)",
                border: "1px solid rgba(176,123,80,0.28)",
                fontSize: 13,
                color: "var(--ink-muted)",
              }}
            >
              <span style={{ flex: 1, minWidth: 200 }}>{t("kitchen.staleNotice")}</span>
              <button type="button" onClick={() => regenerate(active)} disabled={!!variant?.loading} style={btn(false, true)}>
                {t("kitchen.regenerate")}
              </button>
            </div>
          )}
          {variant?.loading ? (
            <GenerationProgress
              compact
              expectedS={25}
              label={t("kitchen.generating")}
            />
          ) : variant?.error ? (
            <ErrorBox msg={variant.error} retryLabel={t("kitchen.retry")} onRetry={() => regenerate(active)} />
          ) : !body ? (
            <Center text={t("kitchen.empty")} />
          ) : mode === "preview" ? (
            <div
              style={{
                background: "#fff",
                color: "#0a0a0a",
                borderRadius: 14,
                padding: "26px 30px",
                boxShadow: "0 18px 48px -14px rgba(0,0,0,0.5)",
                fontSize: 15.5,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {draft}
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={isPublished || pending}
              rows={18}
              style={{
                width: "100%",
                background: "var(--surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                outline: "none",
                resize: "vertical",
                padding: "20px 24px",
                fontFamily: "var(--font-sans)",
                fontSize: 16,
                lineHeight: 1.65,
                color: "var(--ink)",
                minHeight: 400,
              }}
            />
          )}

          {saveErr && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--risky)" }}>{saveErr}</div>
          )}

          {/* Editorial Memory ("Научи Sepio") for the active variant — same panel
              as the blog editor, fed the variant post + live draft. Hidden for a
              published variant; disabled while the draft is dirty (refine diffs
              against the saved DB body) or saving. */}
          {betaAccess &&
            mode === "edit" &&
            !isPublished &&
            variant?.postId &&
            !variant.loading &&
            !variant.error &&
            body.trim() &&
            source && (
              <>
              {/* W2 memory receipt for THIS variant — persisted snapshot from
                  the fan-out ([] = teach-CTA focusing the panel below). */}
              <MemoryReceipt
                applied={variant.appliedRules}
                onTeach={focusEditorialPanel}
              />
              <EditorialPanel
                postId={variant.postId}
                brandId={source.brandId}
                currentContent={draft}
                disabled={dirty || pending}
                disabledHint={t("editorialDirtyHint")}
                ruleCount={ruleCount}
                onRuleCount={onRuleCount}
                onApplied={(newBody) => {
                  // Update the variant body in context (NOT this center's draft
                  // directly): if we're still on this channel the `[body, active]`
                  // effect resyncs draft; if the user switched channels mid-apply
                  // it won't clobber the other channel's editor.
                  updateVariantBody(active, newBody);
                }}
              />
              </>
            )}
        </div>
      </div>

      {/* Footer actions */}
      {body && (
        <footer
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: "12px 32px",
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "flex-end",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => {
              // Swallow the rejection (insecure context / denied permission) so it
              // doesn't surface as an unhandled promise rejection (R-25).
              void navigator.clipboard?.writeText(draft).catch(() => {});
            }}
            style={btn(false, false)}
          >
            {t("kitchen.copy")}
          </button>
          {!isPublished && (
            <button type="button" onClick={() => regenerate(active)} disabled={!!variant?.loading} style={btn(!!variant?.loading, false)}>
              {t("kitchen.regenerate")}
            </button>
          )}
          {isPublished && variant?.externalUrl && (
            <a
              href={variant.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btn(false, true), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              {t("kitchen.viewPublished")}
            </a>
          )}
          {mode === "edit" && !isPublished && humanizeSnapshot !== null && (
            <button type="button" onClick={onUndoHumanize} disabled={humanizing} style={btn(humanizing, false)} title={t("undoTooltip")}>
              {t("undo")}
            </button>
          )}
          {mode === "edit" && !isPublished && (
            <button
              type="button"
              onClick={onHumanize}
              disabled={humanizing || pending || !draft.trim()}
              style={btn(humanizing || pending || !draft.trim(), false)}
              title={t("rehumanizeTooltip")}
            >
              {humanizing ? t("humanizing") : t("rehumanize")}
            </button>
          )}
          {mode === "edit" && !isPublished && (
            <button type="button" onClick={onSave} disabled={pending || !dirty || !variant?.postId} style={btn(pending || !dirty || !variant?.postId, false)}>
              {pending ? t("statusSaving") : !dirty ? t("saved") : t("saveDraft")}
            </button>
          )}
        </footer>
      )}
    </>
  );
}

// Animated segmented toggle — a sepia-filled pill that hugs the active label
// and slides between segments with a springy overshoot. The two labels have
// different widths (i18n), so the pill geometry is measured from the active
// button rather than assumed to be 50%.
const SEG_ORDER = ["preview", "edit"] as const;

export function SegToggle({
  mode,
  onChange,
  previewLabel,
  editLabel,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  previewLabel: string;
  editLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<ViewMode, HTMLButtonElement | null>>({
    preview: null,
    edit: null,
  });
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  // Measure the active button and park the pill over it. Runs on mode change
  // and whenever the labels or container resize (webfont swap, locale change).
  useLayoutEffect(() => {
    function measure() {
      const wrap = wrapRef.current;
      const btn = btnRefs.current[mode];
      if (!wrap || !btn) return;
      setPill({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
        ready: true,
      });
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [mode, previewLabel, editLabel]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: "inline-flex",
        background: "var(--sepio-surface-deep, #120F0C)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 999,
        padding: 4,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: pill.left,
          width: pill.width,
          background: "linear-gradient(180deg,#7A4D2C,#5E3A21)",
          borderRadius: 999,
          boxShadow:
            "0 2px 8px -2px rgba(107,66,38,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
          opacity: pill.ready ? 1 : 0,
          // No transition until the first measurement lands, so the pill
          // doesn't slide in from x=0 on mount.
          transition: pill.ready
            ? "left 0.42s cubic-bezier(0.34,1.56,0.64,1), width 0.42s cubic-bezier(0.34,1.56,0.64,1)"
            : "none",
        }}
      />
      {SEG_ORDER.map((m) => (
        <button
          key={m}
          ref={(el) => {
            btnRefs.current[m] = el;
          }}
          type="button"
          onClick={() => onChange(m)}
          style={{
            position: "relative",
            zIndex: 1,
            height: 30,
            padding: "0 20px",
            border: 0,
            borderRadius: 999,
            background: "transparent",
            // Fixed colors: the pill/container are always-dark chrome, so the
            // labels must not follow theme tokens (would mis-contrast in light).
            color: mode === m ? "#F6EFE6" : "#A09687",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            transition: "color 0.2s ease",
            whiteSpace: "nowrap",
          }}
        >
          {m === "preview" ? previewLabel : editLabel}
        </button>
      ))}
    </div>
  );
}

function Center({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 14, color: "var(--ink-faint)", padding: "60px 4px", textAlign: "center" }}>
      {text}
    </div>
  );
}

function ErrorBox({ msg, retryLabel, onRetry }: { msg: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--risky-bg)", border: "1px solid rgba(194,104,90,0.20)", color: "var(--risky)", fontSize: 13 }}>
      <div style={{ marginBottom: 10 }}>{msg}</div>
      <button type="button" onClick={onRetry} style={btn(false, false)}>{retryLabel}</button>
    </div>
  );
}

function btn(disabled: boolean, primary: boolean): React.CSSProperties {
  if (primary) {
    // Shared sepia pill — one primary vocabulary across writer/kitchen/panel.
    return { ...primaryPill({ disabled, height: 32 }), padding: "0 14px" };
  }
  return {
    height: 32,
    padding: "0 14px",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--ink)",
    opacity: disabled ? 0.55 : 1,
  };
}
