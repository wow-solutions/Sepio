"use client";

import { useEffect, useState, type CSSProperties } from "react";

// Long-generation feedback: spinner + budget bar + elapsed clock + document
// skeleton. Visual vocabulary lifted from EditorialPanel's running phase so
// blog generation, variant generation and rewrites read as one system.
// The bar paces itself against `expectedS` and parks at 95% — generation time
// varies too much to promise 100%.
export function GenerationProgress({
  expectedS,
  label,
  hint,
  cancelLabel,
  onCancel,
  compact = false,
}: {
  expectedS: number;
  label: string;
  hint?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const pct = Math.min(95, Math.round((elapsed / expectedS) * 100));
  const skeleton = compact ? [92, 84, 60] : [64, 96, 88, 92, 76, 54];

  return (
    <div
      role="status"
      style={{
        maxWidth: compact ? 520 : "var(--editor-max-w)",
        margin: "0 auto",
        padding: compact ? "8px 0" : "24px 0",
      }}
    >
      <style>{GP_CSS}</style>
      <div style={loadRow}>
        <span className="gp-spin" style={spinner} />
        <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{label}</span>
      </div>
      <div style={barOuter}>
        <div style={{ ...barInner, width: `${pct}%` }} />
      </div>
      <div style={loadSub}>
        <span>{hint ?? ""}</span>
        <span>{formatElapsed(elapsed)}</span>
      </div>
      <div style={{ marginTop: 18 }} aria-hidden>
        {skeleton.map((w, i) => (
          <div
            key={i}
            style={{
              ...skelLine,
              width: `${w}%`,
              // First line reads as the title of the forming document.
              height: !compact && i === 0 ? 18 : 11,
              marginBottom: !compact && i === 0 ? 16 : 10,
            }}
          />
        ))}
      </div>
      {onCancel && cancelLabel && (
        <button type="button" onClick={onCancel} style={cancelBtn}>
          {cancelLabel}
        </button>
      )}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const GP_CSS = `
@keyframes gp-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .gp-spin { animation: none !important; }
}
`;

const loadRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
};
const spinner: CSSProperties = {
  width: 15,
  height: 15,
  border: "2px solid var(--border-strong)",
  borderTopColor: "var(--sepia-bright)",
  borderRadius: "50%",
  animation: "gp-spin 0.8s linear infinite",
  display: "inline-block",
};
const barOuter: CSSProperties = {
  height: 5,
  background: "var(--surface-deep)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 999,
  overflow: "hidden",
};
const barInner: CSSProperties = {
  height: "100%",
  background: "var(--sepia-bright)",
  borderRadius: 999,
  transition: "width 1s linear",
};
const loadSub: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 7,
  color: "var(--ink-muted)",
  fontSize: 11,
};
const skelLine: CSSProperties = {
  height: 11,
  background: "var(--surface-deep)",
  borderRadius: 4,
  marginBottom: 10,
};
const cancelBtn: CSSProperties = {
  marginTop: 18,
  height: 30,
  padding: "0 14px",
  borderRadius: 9999,
  border: "1px solid var(--border-strong)",
  background: "transparent",
  color: "var(--ink-muted)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};
