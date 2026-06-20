import Link from "next/link";

// Minimal, FIRST-PARTY chassis for a client's blog on their own domain
// (blog.client.com). Deliberately carries NO Sepio branding, wordmark, or
// links back to sepio.app — the page must read as the client's own blog (and
// we never pass SEO link-equity back to ourselves). Uses the shared blog.css
// editorial theme for readable typography. next/link (framework-level, no i18n
// router needed) for the home link; clean same-host URLs.
export function ClientBlogShell({
  brandName,
  children,
}: {
  brandName: string | null;
  children: React.ReactNode;
}) {
  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <header
        style={{
          minHeight: 66,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            color: "var(--ink)",
            fontWeight: 600,
            fontSize: 18,
          }}
        >
          {brandName ?? "Blog"}
        </Link>
      </header>

      {children}

      <footer
        style={{
          padding: "32px 24px",
          textAlign: "center",
          fontSize: 12,
          color: "var(--ink-faint)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {brandName && <span>© {new Date().getFullYear()} {brandName}</span>}
      </footer>
    </main>
  );
}
