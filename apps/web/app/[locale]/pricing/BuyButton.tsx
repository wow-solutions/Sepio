"use client";

import { useState, useTransition } from "react";
import { createCheckoutAction } from "@/lib/billing/checkout";
import type { PaidTier } from "@/lib/billing/config";

// Authed upgrade CTA: calls the checkout server action and sends the browser to
// the returned LS checkout (or customer portal). Anon visitors never see this —
// the pricing page renders the "Start trial → /signup" link for them instead.
export function BuyButton({
  tier,
  label,
  highlight,
}: {
  tier: PaidTier;
  label: string;
  highlight?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutAction(tier);
      if ("url" in result) {
        window.location.href = result.url;
      } else {
        setError("error" in result ? result.error : result.notice);
      }
    });
  }

  return (
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          padding: "14px 22px",
          borderRadius: 9999,
          background: highlight ? "var(--sepio-sepia, var(--brand))" : "transparent",
          color: highlight ? "var(--sepio-cream)" : "var(--ink)",
          border: highlight ? "0" : "1px solid var(--border-strong)",
          fontSize: 14,
          fontWeight: 600,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Opening checkout…" : label}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "var(--danger, #b42318)", textAlign: "center" }}>
          {error}
        </span>
      )}
    </div>
  );
}
