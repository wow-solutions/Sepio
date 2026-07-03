import type { CSSProperties } from "react";

// The ONE primary action style (sepia pill) — shared so writer, editorial
// panel, kitchen, publish popover and dashboard stop speaking three different
// button languages. Style helper (not a component) so it works on <button>
// and <Link> alike.
export function primaryPill(opts: {
  disabled?: boolean;
  height?: number;
  fullWidth?: boolean;
}): CSSProperties {
  const { disabled = false, height = 36, fullWidth = false } = opts;
  return {
    ...(fullWidth ? { width: "100%" } : {}),
    height,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 16px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    borderRadius: 9999,
    fontSize: height >= 40 ? 14 : 13,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "1px solid var(--sepio-sepia)",
    background: "var(--sepio-sepia)",
    color: "var(--sepio-cream)",
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "opacity 120ms",
  };
}
