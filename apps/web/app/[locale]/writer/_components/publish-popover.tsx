"use client";

// PublishPopover — the destination checklist that opens from the writer-footer
// "Publish ▾" button. Presentational: the writer computes the rows (selection,
// per-brand connection state, per-channel publish status) and passes them in.
// Toggling a row flips the persisted destination selection (k.selected via the
// writer); "Publish (N)" fans out over the checked + publishable + not-yet-
// published channels. Non-publishable rows show why (soon / connect domain /
// connect LinkedIn) and are excluded from the count.

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ChannelId } from "@/lib/kitchen/channel-formats";

export type PublishStatus = {
  state: "publishing" | "published" | "failed";
  error?: string;
  needsConnect?: boolean;
};

export type PickerRow = {
  id: ChannelId;
  label: string;
  icon: string;
  checked: boolean;
  publishable: boolean; // capability live AND brand connected
  reason: "soon" | "domain" | "linkedin" | null; // why not publishable
  published: boolean; // already live (this session or loaded)
  status?: PublishStatus;
};

export function PublishPopover({
  rows,
  brandId,
  running,
  onToggle,
  onPublish,
  onClose,
}: {
  rows: PickerRow[];
  brandId: string;
  running: boolean;
  onToggle: (c: ChannelId) => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("writer.picker");
  const count = rows.filter(
    (r) => r.checked && r.publishable && !r.published,
  ).length;

  return (
    <>
      {/* Click-away backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={t("title")}
        style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          right: 0,
          zIndex: 41,
          width: 280,
          background: "var(--raised)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          boxShadow: "0 18px 48px -14px rgba(0,0,0,0.55)",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--ink-faint)",
            padding: "4px 8px 6px",
          }}
        >
          {t("title")}
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 8px",
              borderRadius: 8,
            }}
          >
            <input
              type="checkbox"
              checked={r.checked}
              onChange={() => onToggle(r.id)}
              aria-label={r.label}
              style={{ cursor: "pointer", flexShrink: 0 }}
            />
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: "rgba(176,123,80,0.12)",
                color: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-fraunces), Georgia, serif",
                fontWeight: 600,
                fontSize: 10,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {r.icon}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: "var(--ink)" }}>
              {r.label}
            </span>
            <RowStatus row={r} brandId={brandId} t={t} />
          </div>
        ))}

        <button
          type="button"
          onClick={onPublish}
          disabled={count === 0 || running}
          style={{
            marginTop: 6,
            height: 34,
            borderRadius: 8,
            border: 0,
            background:
              count === 0 || running ? "var(--border-strong)" : "var(--brand)",
            color: count === 0 || running ? "var(--ink-faint)" : "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: count === 0 || running ? "not-allowed" : "pointer",
          }}
        >
          {running ? t("publishing") : t("publishN", { count })}
        </button>
      </div>
    </>
  );
}

function RowStatus({
  row,
  brandId,
  t,
}: {
  row: PickerRow;
  brandId: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const muted: React.CSSProperties = {
    fontSize: 11,
    color: "var(--ink-faint)",
    flexShrink: 0,
  };
  if (row.published) return <span style={{ ...muted, color: "var(--pass)" }}>✓ {t("done")}</span>;
  if (row.status?.state === "publishing") return <span style={muted}>…</span>;
  if (row.status?.state === "failed") {
    return (
      <span style={{ ...muted, color: "var(--risky)" }} title={row.status.error}>
        {row.status.needsConnect ? (
          <Link href={`/brands/${brandId}`} style={{ color: "var(--info)" }}>
            {t("connect")}
          </Link>
        ) : (
          t("failed")
        )}
      </span>
    );
  }
  if (!row.publishable) {
    if (row.reason === "soon") return <span style={muted}>{t("soon")}</span>;
    return (
      <Link href={`/brands/${brandId}`} style={{ ...muted, color: "var(--info)" }}>
        {t("connect")}
      </Link>
    );
  }
  return null;
}
