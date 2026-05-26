"use client";

import { useEffect, useState } from "react";

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--ink-muted)",
  cursor: "pointer",
  padding: 4,
  display: "inline-flex",
};

// Wraps the (server-rendered) Rail and lets it collapse to a thin strip.
// State persists in localStorage. Rail is passed as children so it stays a
// server component; all its props are already resolved to serializable values.
export function CollapsibleRail({
  children,
  expandLabel,
  collapseLabel,
}: {
  children: React.ReactNode;
  expandLabel: string;
  collapseLabel: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sepio-rail-collapsed") === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("sepio-rail-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (collapsed) {
    return (
      <aside
        style={{
          width: 48,
          flexShrink: 0,
          background: "var(--sepio-surface-deep)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 16,
        }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={expandLabel}
          title={expandLabel}
          style={iconBtn}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", flexShrink: 0 }}>
      {children}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapseLabel}
        title={collapseLabel}
        style={{
          ...iconBtn,
          position: "absolute",
          top: 14,
          right: 10,
          color: "var(--ink-faint)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
    </div>
  );
}
