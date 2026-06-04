"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { BlogBody } from "@/components/blog/blog-body";
import { updatePost, deleteBlogPost } from "@/lib/blog-actions";
import { FirewallModal, type FirewallItemView } from "./firewall-modal";

type Mode = "write" | "preview";

export type BlogEditorInitial = {
  title: string;
  slug: string;
  description: string;
  body: string;
  authorName: string;
  authorSlug: string;
  coverImageUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
};

export function BlogEditor({
  postId,
  status,
  initial,
  firewallItems,
}: {
  postId: string;
  status: "draft" | "published";
  initial: BlogEditorInitial;
  // Firewall display data — passed from the server (which imports the _private
  // criteria module). The client never imports _private itself.
  firewallItems: FirewallItemView[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("write");

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [body, setBody] = useState(initial.body);
  const [authorName, setAuthorName] = useState(initial.authorName);
  const [authorSlug, setAuthorSlug] = useState(initial.authorSlug);
  const [coverImageUrl, setCoverImageUrl] = useState(initial.coverImageUrl);
  const [ogTitle, setOgTitle] = useState(initial.ogTitle);
  const [ogDescription, setOgDescription] = useState(initial.ogDescription);
  const [ogImageUrl, setOgImageUrl] = useState(initial.ogImageUrl);
  const [materiallyUpdated, setMateriallyUpdated] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showFirewall, setShowFirewall] = useState(false);
  const [pending, start] = useTransition();

  const isPublished = status === "published";

  function commonInput() {
    return {
      id: postId,
      title,
      description,
      body,
      authorName,
      authorSlug,
      coverImageUrl,
      ogTitle,
      ogDescription,
      ogImageUrl,
    };
  }

  // Plain save (draft→draft, or content edit on a published post). When the
  // post is published and "material update" is ticked, that flips on
  // firewall_ack — so route it through the modal instead of saving silently.
  function onSave() {
    setErr(null);
    setNotice(null);
    if (isPublished && materiallyUpdated) {
      setShowFirewall(true);
      return;
    }
    start(async () => {
      const result = await updatePost({
        ...commonInput(),
        intent: "save",
        materiallyUpdated: false,
        firewallAck: {},
      });
      if (result.ok) {
        setNotice("Saved");
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  function onPublishClick() {
    setErr(null);
    setNotice(null);
    setShowFirewall(true);
  }

  // Modal confirm: publish (draft) OR material-update save (published).
  function onFirewallConfirm(acked: Record<string, boolean>) {
    start(async () => {
      const result = await updatePost({
        ...commonInput(),
        intent: isPublished ? "save" : "publish",
        materiallyUpdated: isPublished ? true : false,
        firewallAck: acked,
      });
      if (result.ok) {
        setShowFirewall(false);
        setNotice(isPublished ? "Updated" : "Published");
        router.refresh();
      } else {
        setErr(result.error);
        setShowFirewall(false);
      }
    });
  }

  function onUnpublish() {
    setErr(null);
    setNotice(null);
    start(async () => {
      const result = await updatePost({
        ...commonInput(),
        intent: "unpublish",
        materiallyUpdated: false,
        firewallAck: {},
      });
      if (result.ok) {
        setNotice("Moved to draft");
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  function onDelete() {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    setErr(null);
    start(async () => {
      const result = await deleteBlogPost({ id: postId });
      if (result.ok) {
        router.push("/blog/admin");
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <>
      {/* Slug (read-only — immutable after create) + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
          }}
        >
          /blog/{initial.slug}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: isPublished ? "var(--pass)" : "var(--ink-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {status}
        </span>
      </div>

      {/* Meta fields */}
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Meta description" hint="Shown in search + social cards.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label="Author name" grow>
          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Author slug" grow>
          <input
            value={authorSlug}
            onChange={(e) => setAuthorSlug(e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Cover image URL" hint="Confirm it has alt text before publishing.">
        <input
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="https://…"
          style={inputStyle}
        />
      </Field>

      {/* Write | Preview toggle */}
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div
          role="group"
          aria-label="Editor mode"
          style={{
            display: "inline-flex",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {(["write", "preview"] as Mode[]).map((m, i) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--bg)" : "var(--ink-muted)",
                  border: "none",
                  borderLeft: i === 0 ? "none" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  lineHeight: 1.4,
                }}
              >
                {m === "write" ? "Write" : "Preview"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body: textarea OR live preview (same .prose chassis as the public page) */}
      <article
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 16,
        }}
      >
        {mode === "write" ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the post in Markdown…"
            style={{
              width: "100%",
              minHeight: 360,
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              lineHeight: 1.65,
              color: "var(--ink)",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "vertical",
              padding: 0,
            }}
          />
        ) : (
          <div className="prose">
            <BlogBody source={body} />
          </div>
        )}
      </article>

      {/* OG overrides (optional) */}
      <details style={{ marginBottom: 16 }}>
        <summary
          style={{
            fontSize: 12.5,
            color: "var(--ink-muted)",
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          SEO / Open Graph overrides (optional)
        </summary>
        <Field label="OG title" hint="Falls back to the post title.">
          <input
            value={ogTitle}
            onChange={(e) => setOgTitle(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="OG description" hint="Falls back to the meta description.">
          <input
            value={ogDescription}
            onChange={(e) => setOgDescription(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="OG image URL" hint="Falls back to the cover image.">
          <input
            value={ogImageUrl}
            onChange={(e) => setOgImageUrl(e.target.value)}
            placeholder="https://…"
            style={inputStyle}
          />
        </Field>
      </details>

      {/* Material-update toggle (published only) */}
      {isPublished && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 44,
            fontSize: 13,
            color: "var(--ink)",
            marginBottom: 8,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={materiallyUpdated}
            onChange={(e) => setMateriallyUpdated(e.target.checked)}
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
          This is a material update (bumps the public “updated” date; re-runs the
          firewall)
        </label>
      )}

      {err && <Banner kind="error" msg={err} />}
      {notice && <Banner kind="ok" msg={notice} />}

      {/* Action row */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={primaryBtn(pending)}
        >
          {pending ? "Saving…" : "Save"}
        </button>

        {!isPublished ? (
          <button
            type="button"
            onClick={onPublishClick}
            disabled={pending}
            style={ghostBtn(pending)}
          >
            Publish…
          </button>
        ) : (
          <button
            type="button"
            onClick={onUnpublish}
            disabled={pending}
            style={ghostBtn(pending)}
          >
            Unpublish
          </button>
        )}

        {!isPublished && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            style={dangerBtn(pending)}
          >
            Delete
          </button>
        )}
      </div>

      {showFirewall && (
        <FirewallModal
          items={firewallItems}
          title={isPublished ? "Confirm material update" : "Pre-publish firewall"}
          onConfirm={onFirewallConfirm}
          onCancel={() => setShowFirewall(false)}
          pending={pending}
        />
      )}
    </>
  );
}

function Field({
  label,
  hint,
  grow,
  children,
}: {
  label: string;
  hint?: string;
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14, flex: grow ? "1 1 200px" : undefined }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--ink-muted)",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p
          style={{
            fontSize: 11.5,
            color: "var(--ink-faint)",
            margin: "5px 0 0",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  color: "var(--ink)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  lineHeight: 1.5,
  outline: "none",
};

function Banner({ kind, msg }: { kind: "error" | "ok"; msg: string }) {
  const error = kind === "error";
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        background: error ? "var(--risky-bg)" : "var(--surface)",
        color: error ? "var(--risky)" : "var(--pass)",
        border: error
          ? "1px solid rgba(194,104,90,0.20)"
          : "1px solid var(--border-subtle)",
        fontSize: 12,
        lineHeight: 1.4,
        marginBottom: 12,
      }}
    >
      {msg}
    </div>
  );
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
