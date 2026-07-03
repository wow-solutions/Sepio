"use client"; // Error boundaries must be Client Components

// Last-resort boundary: replaces the ROOT layout when it (or [locale]/layout)
// throws. Nothing from the app is guaranteed here — no globals.css tokens, no
// fonts, no next-intl — so colors are hardcoded to the sepio palette and copy
// stays English-only.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#181410",
          color: "#F3ECE1",
          fontFamily: "Georgia, serif",
          padding: "40px 24px",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 30, fontWeight: 500, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "#A09687",
              margin: "0 0 24px",
            }}
          >
            The app hit an unexpected error. Try again, or reload the page if it
            keeps happening.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 38,
              padding: "0 20px",
              background: "#6B4226",
              color: "#F3ECE1",
              border: "none",
              borderRadius: 9999,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: 24,
                fontFamily: "monospace",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "#7A6F62",
              }}
            >
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
