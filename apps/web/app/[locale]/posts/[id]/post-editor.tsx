"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PublishButton } from "./publish-button";
import { deletePost } from "./actions";
import { MemoryReceipt } from "@/app/[locale]/writer/_components/memory-receipt";
import type { AppliedRule } from "@/lib/applied-rules";

// View-only post detail (kitchen slice 2). Editing — including the Editorial
// Memory loop — moved to /writer?post=<id>, so this surface only reads, publishes,
// and deletes. The "Edit in writer" link is the single entry point to editing.

type FontChoice = "sans" | "serif" | "mono";

const FONT_STORAGE_KEY = "qw:post-font";

const FONT_VAR: Record<FontChoice, string> = {
  sans: "var(--font-sans)",
  serif: "var(--font-serif)",
  mono: "var(--font-mono)",
};

type Props = {
  postId: string;
  initialContent: string;
  status: string;
  externalUrl: string | null;
  // W2 receipt snapshot (null = not tracked → nothing rendered). Read-only
  // here; the [] teach-CTA links into the writer (the panel lives there).
  appliedRules?: AppliedRule[] | null;
};

export function PostEditor({
  postId,
  initialContent,
  status,
  externalUrl,
  appliedRules = null,
}: Props) {
  const t = useTranslations("posts.detail");
  const router = useRouter();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [font, setFont] = useState<FontChoice>("sans");
  const [pendingDelete, startDelete] = useTransition();

  const isPublished = status === "published";
  const canMutate = !isPublished;

  useEffect(() => {
    const saved = window.localStorage.getItem(FONT_STORAGE_KEY);
    if (saved === "sans" || saved === "serif" || saved === "mono") {
      setFont(saved);
    }
  }, []);

  function chooseFont(next: FontChoice) {
    setFont(next);
    window.localStorage.setItem(FONT_STORAGE_KEY, next);
  }

  function onDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleteErr(null);
    startDelete(async () => {
      const result = await deletePost(postId);
      if (result.ok) {
        router.push("/posts");
        router.refresh();
      } else {
        setDeleteErr(result.error);
      }
    });
  }

  const lenIndicator = describeLength(initialContent.length, t);

  return (
    <>
      {/* Toolbar: font picker + char count */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <FontToggle font={font} onChange={chooseFont} t={t} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: lenIndicator.color,
          }}
        >
          {initialContent.length} · {lenIndicator.label}
        </span>
      </div>

      {/* Content area: read-only */}
      <article
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 16,
        }}
      >
        <pre
          style={{
            fontFamily: FONT_VAR[font],
            fontSize: 15,
            lineHeight: 1.65,
            color: "var(--ink)",
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {initialContent || ""}
        </pre>
      </article>

      {appliedRules != null && (
        <div style={{ marginBottom: 16, marginTop: -4 }}>
          <MemoryReceipt
            applied={appliedRules}
            teachHref={canMutate ? `/writer?post=${postId}` : undefined}
          />
        </div>
      )}

      {deleteErr && <ErrorBanner msg={deleteErr} />}

      {/* Action row */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {isPublished && externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryBtn(false)}
          >
            {t("viewOnLinkedIn")}
          </a>
        ) : (
          <>
            <PublishButton postId={postId} />
            {canMutate && (
              <Link href={`/writer?post=${postId}`} style={ghostBtn(false)}>
                {t("editInWriter")}
              </Link>
            )}
            {canMutate && (
              <button
                type="button"
                onClick={onDelete}
                disabled={pendingDelete}
                style={dangerBtn(pendingDelete)}
              >
                {pendingDelete ? t("deleting") : t("delete")}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function FontToggle({
  font,
  onChange,
  t,
}: {
  font: FontChoice;
  onChange: (next: FontChoice) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const choices: { key: FontChoice; label: string }[] = [
    { key: "sans", label: t("font.sans") },
    { key: "serif", label: t("font.serif") },
    { key: "mono", label: t("font.mono") },
  ];
  return (
    <div
      role="group"
      aria-label={t("font.label")}
      style={{
        display: "inline-flex",
        border: "1px solid var(--border-subtle)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {choices.map((c, i) => {
        const active = font === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            style={{
              padding: "4px 10px",
              fontFamily: FONT_VAR[c.key],
              fontSize: 12,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--bg)" : "var(--ink-muted)",
              border: "none",
              borderLeft: i === 0 ? "none" : "1px solid var(--border-subtle)",
              cursor: "pointer",
              lineHeight: 1.4,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--risky-bg)",
        color: "var(--risky)",
        border: "1px solid rgba(194,104,90,0.20)",
        fontSize: 12,
        lineHeight: 1.4,
        marginBottom: 12,
      }}
    >
      {msg}
    </div>
  );
}

type LenInfo = { label: string; color: string };

function describeLength(
  len: number,
  t: ReturnType<typeof useTranslations>,
): LenInfo {
  if (len < 800) return { label: t("length.short"), color: "var(--ink-faint)" };
  if (len < 1300) return { label: t("length.ok"), color: "var(--ink-muted)" };
  if (len <= 1900) return { label: t("length.sweet"), color: "var(--pass)" };
  if (len <= 2500)
    return { label: t("length.long"), color: "var(--borderline)" };
  return { label: t("length.tooLong"), color: "var(--risky)" };
}

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    height: 36,
    padding: "0 16px",
    background: disabled ? "var(--ink-faint)" : "var(--ink)",
    color: "var(--bg)",
    border: "1px solid var(--ink)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    opacity: disabled ? 0.7 : 1,
  };
}

function ghostBtn(disabled: boolean): CSSProperties {
  return {
    height: 36,
    padding: "0 14px",
    background: "transparent",
    color: "var(--ink)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function dangerBtn(disabled: boolean): CSSProperties {
  return {
    height: 36,
    padding: "0 14px",
    background: "transparent",
    color: "var(--risky)",
    border: "1px solid rgba(194,104,90,0.30)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    marginLeft: "auto",
    opacity: disabled ? 0.6 : 1,
  };
}
