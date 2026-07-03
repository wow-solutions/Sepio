"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { useTranslations } from "next-intl";

// Route error boundary for the whole locale tree. Catches render/data errors in
// any page below [locale]/layout.tsx (the layout itself — and its
// NextIntlClientProvider — stays mounted above, so useTranslations works here).
// Server-thrown errors arrive redacted with only `digest`; we surface the digest
// so a user report can be matched to server logs.
export default function LocaleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("boundary");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: "40px 24px",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontVariationSettings: '"opsz" 72',
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            margin: "0 0 12px",
          }}
        >
          {t("title")}
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink-muted)",
            margin: "0 0 24px",
          }}
        >
          {t("body")}
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 36,
            padding: "0 18px",
            background: "var(--sepio-sepia)",
            color: "var(--sepio-cream)",
            border: "none",
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {t("retry")}
        </button>
        {error.digest && (
          <p
            style={{
              marginTop: 24,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "var(--ink-faint)",
            }}
          >
            {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
