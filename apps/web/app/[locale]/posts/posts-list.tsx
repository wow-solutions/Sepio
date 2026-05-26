"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { BrandDot } from "@/components/brand/brand-dot";
import { brandColor } from "@/lib/brand-color";
import { StatusBadge } from "./status-badge";
import { DeleteRowButton } from "./delete-row-button";
import { bulkDeletePosts } from "./[id]/actions";

export type PostRow = {
  id: string;
  brandId: string;
  brandName: string;
  brandSlug: string | null;
  platform: string;
  contentText: string | null;
  status: string;
  detectionScore: number | null;
  externalPostUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
};

type Props = {
  posts: PostRow[];
  locale: string;
};

const PREVIEW_LIMIT = 140;

export function PostsList({ posts, locale }: Props) {
  const t = useTranslations("posts");
  const tDetail = useTranslations("posts.detail");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [pending, startBulk] = useTransition();

  const visibleDraftIds = useMemo(
    () => posts.filter((p) => p.status === "draft").map((p) => p.id),
    [posts],
  );
  const visiblePendingIds = useMemo(
    () =>
      posts.filter((p) => p.status === "pending_approval").map((p) => p.id),
    [posts],
  );

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectIds(ids: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkErr(null);
  }

  function onBulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(t("bulkDeleteConfirm", { count: selected.size })))
      return;
    setBulkErr(null);
    const ids = Array.from(selected);
    startBulk(async () => {
      const result = await bulkDeletePosts(ids);
      if (result.ok) {
        setSelected(new Set());
        router.refresh();
      } else {
        setBulkErr(result.error);
      }
    });
  }

  const hasSelection = selected.size > 0;

  return (
    <>
      {/* Bulk toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "8px 12px",
          background: hasSelection ? "var(--raised)" : "transparent",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 12,
          minHeight: 36,
        }}
      >
        {hasSelection ? (
          <>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--ink)",
                fontWeight: 500,
              }}
            >
              {t("bulkSelected", { count: selected.size })}
            </span>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={pending}
              style={{
                height: 26,
                padding: "0 10px",
                borderRadius: 4,
                border: "1px solid rgba(194,104,90,0.30)",
                background: "transparent",
                color: "var(--risky)",
                fontSize: 12,
                fontWeight: 500,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending
                ? tDetail("deleting")
                : t("bulkDeleteAction", { count: selected.size })}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={pending}
              style={{
                height: 26,
                padding: "0 10px",
                borderRadius: 4,
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--ink-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t("bulkClear")}
            </button>
            {bulkErr && (
              <span style={{ fontSize: 11, color: "var(--risky)" }}>
                {bulkErr}
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ color: "var(--ink-faint)" }}>
              {t("bulkQuickSelect")}
            </span>
            <button
              type="button"
              onClick={() => selectIds(visibleDraftIds)}
              disabled={visibleDraftIds.length === 0}
              style={quickBtn(visibleDraftIds.length === 0)}
            >
              {t("bulkAllDrafts", { count: visibleDraftIds.length })}
            </button>
            <button
              type="button"
              onClick={() => selectIds(visiblePendingIds)}
              disabled={visiblePendingIds.length === 0}
              style={quickBtn(visiblePendingIds.length === 0)}
            >
              {t("bulkAllPending", { count: visiblePendingIds.length })}
            </button>
          </>
        )}
      </div>

      {/* Rows */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {posts.map((p) => {
          const color = p.brandSlug ? brandColor(p.brandSlug) : "var(--ink-faint)";
          const dateStr = formatDate(p.publishedAt ?? p.createdAt, locale);
          const preview = (p.contentText ?? "").slice(0, PREVIEW_LIMIT);
          const canSelect = p.status !== "published";
          const isSelected = selected.has(p.id);

          return (
            <li
              key={p.id}
              className="posts-row"
              style={{
                background: "var(--raised)",
                border: `1px solid ${isSelected ? "var(--brand)" : "var(--border-subtle)"}`,
                borderRadius: 10,
                padding: "16px 18px",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              {canSelect ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  aria-label={t("selectRowAria")}
                  style={{ marginTop: 4, cursor: "pointer" }}
                />
              ) : (
                <span style={{ width: 13, marginTop: 4 }} aria-hidden />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <BrandDot color={color} size={8} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                    {p.brandName}
                  </span>
                  <StatusBadge status={p.status} label={t(`status.${p.status}`)} />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                    }}
                  >
                    {p.platform.toUpperCase()}
                  </span>
                  {p.detectionScore !== null && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ink-faint)",
                      }}
                    >
                      · {t("scoreLabel", { score: p.detectionScore })}
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                    }}
                  >
                    {dateStr}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-muted)",
                    lineHeight: 1.5,
                    margin: "0 0 12px",
                    overflowWrap: "anywhere",
                  }}
                >
                  {preview || <em>{t("emptyContent")}</em>}
                  {(p.contentText?.length ?? 0) > PREVIEW_LIMIT && "…"}
                </p>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link
                    href={`/posts/${p.id}`}
                    style={{
                      height: 26,
                      padding: "0 10px",
                      borderRadius: 4,
                      border: "1px solid var(--border-subtle)",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: 12,
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    {t("openAction")}
                  </Link>
                  {p.externalPostUrl && (
                    <a
                      href={p.externalPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        color: "var(--info)",
                        textDecoration: "underline",
                      }}
                    >
                      {t("viewOnLinkedIn")}
                    </a>
                  )}
                  {canSelect && (
                    <span style={{ marginLeft: "auto" }}>
                      <DeleteRowButton postId={p.id} />
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function quickBtn(disabled: boolean) {
  return {
    height: 26,
    padding: "0 10px",
    borderRadius: 4,
    border: "1px solid var(--border-subtle)",
    background: "transparent",
    color: disabled ? "var(--ink-faint)" : "var(--ink)",
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  } as const;
}

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
