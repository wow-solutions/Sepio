"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ANGLE_IDS, type AngleId } from "@/lib/angles-shared";

const PANEL_WIDTH = 252;

// Self-contained angle picker: a Sepio-styled pill button + a floating panel.
// The panel is portalled to <body> and positioned in viewport coords, so it
// floats OVER the topic card without resizing it and is never clipped by the
// left rail's overflow:auto. It tracks the button on scroll/resize. Used both on
// each topic card and on the typed-topic prompt header.
export function AngleDropdown({
  angle,
  onPick,
  disabled,
}: {
  angle: AngleId | null;
  onPick: (a: AngleId | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("writer.angle");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  // Drives the iOS-style pop (scale + fade) one frame after the panel mounts.
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // While open: place the panel under the button (viewport coords), keep it
  // there on scroll/resize, and close on outside-click / Esc. The panel lives in
  // a portal, so the outside-click test checks BOTH the button and the panel.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - PANEL_WIDTH - 8,
      );
      setCoords({ top: r.bottom + 4, left });
    };
    place();
    const onScroll = () => place();
    const onResize = () => place();
    const onDocMouseDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || panelRef.current?.contains(tgt)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Pop-in: a frame after mount, flip `mounted` so the CSS transition animates
  // scale .96/opacity 0 → 1/1 — the iOS context-menu spring.
  useEffect(() => {
    if (!open) {
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const label = angle === null ? t("pick") : `${t(`${angle}.label`)} ▾`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        style={{
          height: 26,
          padding: "0 10px",
          borderRadius: 9999,
          border: "1px solid var(--border-strong)",
          background: "transparent",
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.02em",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: PANEL_WIDTH,
              zIndex: 1000,
              // iOS "frosted" material — translucent over a backdrop blur, so it
              // reads as a floating menu rather than a flat panel.
              background: "color-mix(in srgb, var(--raised) 82%, transparent)",
              backdropFilter: "blur(22px) saturate(180%)",
              WebkitBackdropFilter: "blur(22px) saturate(180%)",
              border: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              maxHeight: "min(60vh, 480px)",
              overflowY: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              transformOrigin: "top left",
              transform: mounted ? "scale(1)" : "scale(0.96)",
              opacity: mounted ? 1 : 0,
              transition:
                "transform 150ms cubic-bezier(0.2,0.9,0.3,1), opacity 120ms ease",
            }}
          >
            <Row
              label={t("none")}
              selected={angle === null}
              onPick={() => {
                onPick(null);
                setOpen(false);
              }}
            />
            {ANGLE_IDS.map((id, i) => (
              <Row
                key={id}
                label={t(`${id}.label`)}
                desc={t(`${id}.desc`)}
                selected={angle === id}
                last={i === ANGLE_IDS.length - 1}
                onPick={() => {
                  onPick(id);
                  setOpen(false);
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

// Source-hydration state shared by the card expansion and the typed-topic path.
export type SourceState = {
  status: "idle" | "checking" | "success" | "failed" | "unavailable";
  url?: string;
  title?: string | null;
};

export type Stance = { sentiment: "like" | "dislike"; note: string };

// The block revealed once an angle is picked: an honest source-status line for
// article-using angles, plus the compact stance form for the comment angle.
// Reused by the selected topic card AND the typed-topic prompt path so the two
// surfaces stay in sync.
export function AngleExpansion({
  angle,
  sourceState,
  stance,
  onStanceChange,
  disabled,
}: {
  angle: AngleId;
  sourceState: SourceState;
  stance: Stance;
  onStanceChange: (s: Stance) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <SourceStatusLine sourceState={sourceState} />
      {angle === "comment" && (
        <StanceForm
          stance={stance}
          onStanceChange={onStanceChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function SourceStatusLine({ sourceState }: { sourceState: SourceState }) {
  const t = useTranslations("writer.angle");
  if (sourceState.status === "idle") return null;

  const rowStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--ink-faint)",
    letterSpacing: "0.02em",
    marginTop: 10,
    lineHeight: 1.45,
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
  };

  if (sourceState.status === "checking") {
    return <div style={rowStyle}>{t("sourceChecking")}</div>;
  }
  if (sourceState.status === "success" && sourceState.url) {
    return (
      <div style={rowStyle}>
        <span>{t("sourceGrounded")}</span>
        <a
          href={sourceState.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--info)", textDecoration: "none" }}
        >
          {hostOf(sourceState.url)} ↗
        </a>
      </div>
    );
  }
  if (sourceState.status === "failed") {
    return <div style={rowStyle}>{t("sourceUnavailable")}</div>;
  }
  return <div style={rowStyle}>{t("sourceTopicOnly")}</div>;
}

function StanceForm({
  stance,
  onStanceChange,
  disabled,
}: {
  stance: Stance;
  onStanceChange: (s: Stance) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("writer.angle");
  return (
    <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
      <div
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: "1fr",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          padding: 2,
        }}
      >
        {(["like", "dislike"] as const).map((s) => {
          const active = stance.sentiment === s;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onStanceChange({ ...stance, sentiment: s });
              }}
              style={{
                height: 24,
                background: active ? "var(--raised)" : "transparent",
                border: 0,
                color: active ? "var(--ink)" : "var(--ink-muted)",
                fontSize: 11.5,
                fontWeight: 500,
                borderRadius: 4,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {t(
                s === "like"
                  ? "commentSentimentLike"
                  : "commentSentimentDislike",
              )}
            </button>
          );
        })}
      </div>
      <textarea
        value={stance.note}
        onChange={(e) =>
          onStanceChange({ ...stance, note: e.target.value.slice(0, 500) })
        }
        onClick={(e) => e.stopPropagation()}
        disabled={disabled}
        rows={2}
        maxLength={500}
        placeholder={t("commentNotePlaceholder")}
        style={{
          display: "block",
          width: "100%",
          marginTop: 8,
          padding: 8,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          color: "var(--ink)",
          fontFamily: "inherit",
          fontSize: 12,
          lineHeight: 1.5,
          resize: "vertical",
          outline: "none",
        }}
      />
    </div>
  );
}

// Bare host for a source URL, e.g. "https://www.x.com/a" -> "x.com".
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Row({
  label,
  desc,
  selected,
  last,
  onPick,
}: {
  label: string;
  desc?: string;
  selected: boolean;
  last?: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 14px",
        background: hover
          ? "color-mix(in srgb, var(--ink) 9%, transparent)"
          : "transparent",
        border: 0,
        borderBottom: last
          ? "none"
          : "0.5px solid color-mix(in srgb, var(--ink) 10%, transparent)",
        cursor: "pointer",
        width: "100%",
        transition: "background 90ms ease",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            marginBottom: desc ? 2 : 0,
          }}
        >
          {label}
        </span>
        {desc && (
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              lineHeight: 1.35,
              color: "var(--ink-faint)",
              overflowWrap: "anywhere",
            }}
          >
            {desc}
          </span>
        )}
      </span>
      {selected && (
        <span
          style={{
            flexShrink: 0,
            color: "var(--info)",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      )}
    </button>
  );
}
