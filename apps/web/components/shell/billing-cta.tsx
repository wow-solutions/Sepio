"use client";

import { useState, useTransition } from "react";
import { createCheckoutAction } from "@/lib/billing/checkout";

// Rail billing button. One action for every state: createCheckoutAction("early")
// returns a hosted-checkout URL for trial/expired accounts and the LS customer
// portal URL for subscribers, so the label (passed in, resolved server-side from
// plan state) is the only thing that differs — "Upgrade now" / "Manage plan" /
// "Update billing".
export function BillingCta({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutAction("early");
      if ("url" in result) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          padding: "7px 12px",
          background: "var(--brand)",
          color: "var(--sepio-ink)",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 9999,
          border: 0,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "…" : `${label} →`}
      </button>
      {error && (
        <div
          style={{
            fontSize: 10.5,
            color: "var(--danger, #b42318)",
            marginTop: 6,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
