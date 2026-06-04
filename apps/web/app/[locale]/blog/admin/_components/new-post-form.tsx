"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createDraft } from "@/lib/blog-actions";

// Minimal "new post" entry: a title creates a draft (slug auto-derived), then we
// redirect into the full editor at /blog/admin/[id].
export function NewPostForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onCreate() {
    setErr(null);
    start(async () => {
      const result = await createDraft({ title });
      if (result.ok) {
        router.push(`/blog/admin/${result.id}`);
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--ink-muted)",
          marginBottom: 5,
        }}
      >
        Title
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim() && !pending) onCreate();
        }}
        placeholder="Post title"
        autoFocus
        style={{
          width: "100%",
          padding: "8px 10px",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          color: "var(--ink)",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          lineHeight: 1.5,
          outline: "none",
          marginBottom: 12,
        }}
      />

      {err && (
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
          {err}
        </div>
      )}

      <button
        type="button"
        onClick={onCreate}
        disabled={!title.trim() || pending}
        style={primaryBtn(!title.trim() || pending)}
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
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
