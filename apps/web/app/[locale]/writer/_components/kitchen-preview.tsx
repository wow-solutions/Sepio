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
import { Link } from "@/i18n/navigation";
import { useKitchen } from "@/components/shell/kitchen-context";
import { CHANNEL_LABEL, type ChannelId } from "@/lib/kitchen/channel-formats";
import { EditorialPanel } from "@/app/[locale]/posts/[id]/editorial-panel";
import { saveDraft } from "../actions";

export type ViewMode = "preview" | "edit";

// Channels the publish dispatcher can actually post to today. Other kitchen
// channels would 400 ("not yet supported"), so we don't show Publish for them.
const PUBLISHABLE = new Set<ChannelId>(["linkedin"]);

export function KitchenCenter({
  mode,
  onModeChange,
  betaAccess = false,
  sourceTitle,
}: {
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  betaAccess?: boolean;
  sourceTitle?: string;
}) {
  const t = useTranslations("writer");
  const {
    active,
    variants,
    source,
    regenerate,
    updateVariantBody,
    markVariantPublished,
  } = useKitchen();
  const variant = active === "hosted" ? undefined : variants[active];

  const [draft, setDraft] = useState("");
  const [pending, startSave] = useTransition();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  // Synchronous in-flight guard (state lags a render → two fast clicks could both
  // enter onPublish; the loser's 409 would stomp the winner's success).
  const publishingRef = useRef(false);
  // Live mirror of `active` so a publish resolving after a channel switch only
  // writes component-global error/reconnect state when we're still on its channel.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const body = variant?.body ?? "";
  useEffect(() => {
    setDraft(body);
    setSaveErr(null);
    setPublishErr(null);
    setNeedsReconnect(false);
  }, [body, active]);

  const dirty = draft !== body;
  // A published variant is read-only (the backend saveDraft also rejects it).
  // Reachable now that opening a group can land directly on a published channel.
  const isPublished = variant?.state === "published";
  const canPublish = PUBLISHABLE.has(active);

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

  async function onPublish() {
    // Capture the target at click time — the user may switch channels while the
    // publish is in flight; every write below targets THIS channel. Context
    // mutations (markVariantPublished/updateVariantBody) are channel-keyed and
    // always safe; component-global UI state (error/reconnect) is only written
    // when we're still viewing this channel (activeRef).
    const ch = active;
    const pid = variant?.postId;
    const text = draft;
    const isDirty = dirty;
    if (!pid || publishingRef.current) return;
    publishingRef.current = true;
    setPublishErr(null);
    setNeedsReconnect(false);
    setPublishing(true);
    const onChannel = () => activeRef.current === ch;
    try {
      // Publish what's on screen: save the draft first if it diverges from DB.
      if (isDirty) {
        const r = await saveDraft(pid, text);
        if (!r.ok) {
          if (onChannel()) setPublishErr(r.error);
          return;
        }
        updateVariantBody(ch, text);
      }

      let res: Response;
      try {
        res = await fetch(`/api/posts/${pid}/publish`, { method: "POST" });
      } catch (err) {
        if (onChannel())
          setPublishErr(err instanceof Error ? err.message : t("networkError"));
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; url?: string; error?: string; needsReconnect?: boolean }
        | null;

      if (res.ok && data?.success) {
        markVariantPublished(ch, data.url ?? null);
        return;
      }
      if (data?.needsReconnect) {
        if (onChannel()) setNeedsReconnect(true);
        return;
      }
      if (onChannel()) setPublishErr(data?.error ?? `HTTP ${res.status}`);
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
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
          {variant?.loading ? (
            <Center text={t("kitchen.generating")} />
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
              readOnly={isPublished || pending || publishing}
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
          {publishErr && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--risky)" }}>{publishErr}</div>
          )}
          {needsReconnect && source && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-muted)" }}>
              {t("kitchen.notConnected")}{" "}
              <Link
                href={`/brands/${source.brandId}`}
                style={{ color: "var(--sepia-bright)", textDecoration: "none", fontWeight: 500 }}
              >
                {t("kitchen.connectLinkedin")}
              </Link>
            </div>
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
              <EditorialPanel
                postId={variant.postId}
                brandId={source.brandId}
                currentContent={draft}
                disabled={dirty || pending}
                disabledHint={t("editorialDirtyHint")}
                onApplied={(newBody) => {
                  // Update the variant body in context (NOT this center's draft
                  // directly): if we're still on this channel the `[body, active]`
                  // effect resyncs draft; if the user switched channels mid-apply
                  // it won't clobber the other channel's editor.
                  updateVariantBody(active, newBody);
                }}
              />
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
            <button type="button" onClick={() => regenerate(active)} disabled={!!variant?.loading || publishing} style={btn(!!variant?.loading || publishing, false)}>
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
          {mode === "edit" && !isPublished && (
            <button type="button" onClick={onSave} disabled={pending || publishing || !dirty || !variant?.postId} style={btn(pending || publishing || !dirty || !variant?.postId, false)}>
              {pending ? t("statusSaving") : !dirty ? t("saved") : t("saveDraft")}
            </button>
          )}
          {mode === "edit" && !isPublished && canPublish && variant?.postId && !variant.loading && !variant.error && (
            <button type="button" onClick={onPublish} disabled={publishing || pending} style={btn(publishing || pending, true)}>
              {publishing ? t("kitchen.publishing") : t("kitchen.publish")}
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
  return {
    height: 32,
    padding: "0 14px",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    border: primary ? "1px solid var(--ink)" : "1px solid var(--border-strong)",
    background: primary ? "var(--ink)" : "transparent",
    color: primary ? "var(--bg)" : "var(--ink)",
    opacity: disabled ? 0.55 : 1,
  };
}
