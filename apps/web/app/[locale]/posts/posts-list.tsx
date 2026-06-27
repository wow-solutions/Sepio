"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { BrandDot } from "@/components/brand/brand-dot";
import { brandColor } from "@/lib/brand-color";
import { StatusBadge } from "./status-badge";
import { bulkDeletePosts } from "./[id]/actions";

// One channel within a topic group (the blog source counts as a channel here).
export type GroupChannel = {
  platform: string;
  postId: string;
  status: string;
  externalPostUrl: string | null;
};

// A topic = one content_group (or a single legacy post). The card the user sees.
export type TopicGroup = {
  key: string;
  topic: string | null; // source blog title; null → fall back to `preview`
  preview: string | null; // source body preview, used when there's no title
  brandId: string;
  brandName: string;
  brandSlug: string | null;
  sourcePostId: string; // "Open" target — Part 1 reconstructs the whole chain
  channels: GroupChannel[];
  statuses: string[]; // distinct statuses across the group's posts
  latestDate: string;
  postIds: string[]; // every post in the chain — used for chain delete
};

type Props = {
  groups: TopicGroup[];
  locale: string;
};

export function PostsList({ groups, locale }: Props) {
  const t = useTranslations("posts");
  const tDetail = useTranslations("posts.detail");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [pending, startBulk] = useTransition();

  // A group is selectable/deletable if it has any non-published post (published
  // content is protected, mirroring the previous per-post behaviour).
  const isSelectable = (g: TopicGroup) => g.statuses.some((s) => s !== "published");

  const draftGroupKeys = useMemo(
    () => groups.filter((g) => g.statuses.includes("draft")).map((g) => g.key),
    [groups],
  );
  const pendingGroupKeys = useMemo(
    () =>
      groups
        .filter((g) => g.statuses.includes("pending_approval"))
        .map((g) => g.key),
    [groups],
  );

  // Prune selection when the visible groups change (status/brand filter applied
  // server-side) so the toolbar count + delete never reference vanished groups.
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(groups.map((g) => g.key));
      const next = new Set([...prev].filter((k) => valid.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [groups]);

  // Every non-published post id across the selected groups (the actual delete set).
  const selectedIds = useMemo(() => {
    const byKey = new Map(groups.map((g) => [g.key, g]));
    const ids: string[] = [];
    for (const key of selected) {
      const g = byKey.get(key);
      if (!g) continue;
      for (const c of g.channels) {
        if (c.status !== "published") ids.push(c.postId);
      }
    }
    return [...new Set(ids)];
  }, [selected, groups]);

  function toggle(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function selectKeys(keys: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkErr(null);
  }

  function onBulkDelete() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    if (!window.confirm(t("bulkDeleteConfirm", { count: ids.length }))) return;
    setBulkErr(null);
    startBulk(async () => {
      const result = await deleteInBatches(ids);
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
                : t("bulkDeleteAction", { count: selectedIds.length })}
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
              onClick={() => selectKeys(draftGroupKeys)}
              disabled={draftGroupKeys.length === 0}
              style={quickBtn(draftGroupKeys.length === 0)}
            >
              {t("bulkAllDrafts", { count: draftGroupKeys.length })}
            </button>
            <button
              type="button"
              onClick={() => selectKeys(pendingGroupKeys)}
              disabled={pendingGroupKeys.length === 0}
              style={quickBtn(pendingGroupKeys.length === 0)}
            >
              {t("bulkAllPending", { count: pendingGroupKeys.length })}
            </button>
          </>
        )}
      </div>

      {/* Topic cards */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {groups.map((g) => {
          const color = g.brandSlug ? brandColor(g.brandSlug) : "var(--ink-faint)";
          const dateStr = formatDate(g.latestDate, locale);
          const canSelect = isSelectable(g);
          const isSelected = selected.has(g.key);
          const label = g.topic || g.preview;
          // Per-channel "open" links: ONLY for channels actually published with
          // a real URL, labelled by platform. (Previously this grabbed the first
          // channel with any URL — the blog — and mislabelled it "Open in
          // LinkedIn", so the link showed even when LinkedIn was still a draft.)
          const publishedLinks = g.channels.filter(
            (c) => c.status === "published" && c.externalPostUrl,
          );

          return (
            <li
              key={g.key}
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
                  onChange={(e) => toggle(g.key, e.target.checked)}
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
                    {g.brandName}
                  </span>
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

                {/* Topic — the article title (or a body preview when untitled). */}
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--ink)",
                    lineHeight: 1.35,
                    margin: "0 0 10px",
                    overflowWrap: "anywhere",
                  }}
                >
                  {label || <em style={{ fontWeight: 400, color: "var(--ink-muted)" }}>{t("emptyContent")}</em>}
                </p>

                {/* Channels in this topic + each channel's status. */}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  {g.channels.map((c) => (
                    <span
                      key={c.postId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 22,
                        padding: "0 8px",
                        borderRadius: 11,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--surface)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          color: "var(--ink-muted)",
                        }}
                      >
                        {c.platform === "hosted"
                          ? "BLOG"
                          : c.platform.toUpperCase()}
                      </span>
                      <StatusBadge status={c.status} label={t(`status.${c.status}`)} />
                    </span>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link
                    href={`/writer?post=${g.sourcePostId}`}
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
                  {publishedLinks.map((c) => (
                    <a
                      key={c.postId}
                      href={c.externalPostUrl as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        color: "var(--info)",
                        textDecoration: "underline",
                      }}
                    >
                      {t(`viewOn.${viewOnKey(c.platform)}`)}
                    </a>
                  ))}
                  {canSelect && (
                    <span style={{ marginLeft: "auto" }}>
                      <DeleteChainButton group={g} />
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

// Delete the whole chain (every non-published post in the group).
function DeleteChainButton({ group }: { group: TopicGroup }) {
  const t = useTranslations("posts");
  const tDetail = useTranslations("posts.detail");
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, startDelete] = useTransition();

  function onClick() {
    const ids = group.channels
      .filter((c) => c.status !== "published")
      .map((c) => c.postId);
    if (ids.length === 0) return;
    if (!window.confirm(t("bulkDeleteConfirm", { count: ids.length }))) return;
    setErr(null);
    startDelete(async () => {
      const result = await deleteInBatches(ids);
      if (result.ok) router.refresh();
      else setErr(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          height: 26,
          padding: "0 10px",
          borderRadius: 4,
          border: "1px solid rgba(194,104,90,0.25)",
          background: "transparent",
          color: "var(--risky)",
          fontSize: 12,
          fontWeight: 500,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? tDetail("deleting") : t("deleteAction")}
      </button>
      {err && <span style={{ fontSize: 11, color: "var(--risky)" }}>{err}</span>}
    </>
  );
}

// bulkDeletePosts rejects batches over 200; a chain is small but a quick-select
// over many groups can exceed it, so delete in chunks.
async function deleteInBatches(
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let i = 0; i < ids.length; i += 200) {
    const r = await bulkDeletePosts(ids.slice(i, i + 200));
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true };
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

// Map a channel platform to its `posts.viewOn.*` i18n key. Unknown platforms
// fall back to a generic "open" label.
function viewOnKey(platform: string): "linkedin" | "blog" | "wordpress" | "generic" {
  if (platform === "linkedin") return "linkedin";
  if (platform === "hosted") return "blog";
  if (platform === "wordpress") return "wordpress";
  return "generic";
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
