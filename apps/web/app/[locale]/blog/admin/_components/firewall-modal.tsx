"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

// Display data for a checklist row. The criteria DEFINITION lives server-side
// in lib/_private/blog-firewall.ts; this client never imports that module — it
// receives the { id, label, blocking } projection as a prop. (Boundary: no
// "use client" file imports _private.)
export type FirewallItemView = {
  id: string;
  label: string;
  blocking: boolean;
  group: "confidentiality" | "quality";
};

// Blocking pre-publish dialog. Confirm stays disabled until every BLOCKING item
// is checked; non-blocking nudges don't gate the button. Returns the full ack
// map (id -> boolean) so the Server Action re-runs the gate authoritatively.
export function FirewallModal({
  items,
  title,
  onConfirm,
  onCancel,
  pending,
}: {
  items: FirewallItemView[];
  title: string;
  onConfirm: (acked: Record<string, boolean>) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);

  // Esc to cancel + focus trap. Restore focus to the trigger on unmount.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus();
      }
    };
  }, [onCancel]);

  const blocking = items.filter((i) => i.blocking);
  const allBlockingChecked = blocking.every((i) => checked[i.id]);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return createPortal(
    <div
      onMouseDown={(e) => {
        // Click on the backdrop (not the panel) = cancel.
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="firewall-modal-title"
        tabIndex={-1}
        style={{
          width: "min(520px, 100%)",
          maxHeight: "min(86vh, 720px)",
          overflowY: "auto",
          zIndex: 1000,
          background: "color-mix(in srgb, var(--raised) 92%, transparent)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          border: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          padding: "20px 22px",
          outline: "none",
        }}
      >
        <h2
          id="firewall-modal-title"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 16,
            fontWeight: 600,
            color: "var(--ink)",
            margin: "0 0 4px",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink-muted)",
            lineHeight: 1.5,
            margin: "0 0 14px",
          }}
        >
          Confirm each item before this goes public. Blocking items must all be
          checked.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((item) => {
            const isChecked = !!checked[item.id];
            return (
              <label
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 44,
                  padding: "4px 6px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item.id)}
                  style={{ width: 18, height: 18, flexShrink: 0, cursor: "pointer" }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: "var(--ink)",
                    // Weight shift, not color alone, signals checked (a11y).
                    fontWeight: isChecked ? 600 : 400,
                  }}
                >
                  {item.label}
                  {!item.blocking && (
                    <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
                      {" "}
                      (optional)
                    </span>
                  )}
                </span>
                {isChecked && (
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      color: "var(--pass)",
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: 18,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={ghostBtn(pending)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(checked)}
            disabled={!allBlockingChecked || pending}
            style={primaryBtn(!allBlockingChecked || pending)}
          >
            {pending ? "Publishing…" : "Confirm & publish"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Button styles mirrored from posts/[id]/post-editor.tsx so heights/tokens match.
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
