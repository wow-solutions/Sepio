import { Link } from "@/i18n/navigation";
import { SepioMark } from "@/components/shell/sepio-mark";
import { Wordmark } from "@/components/shell/wordmark";

// Public chassis for the blog (forked from the legal/privacy LegalShell). Thin
// header (home mark + wordmark) and a footer — no rail/topbar/AppShell.
export function BlogShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <header
        style={{
          height: "var(--shell-topbar-h)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "var(--ink)",
          }}
        >
          <SepioMark size={28} />
          <Wordmark size={17} />
        </Link>
        <Link
          href="/blog"
          style={{
            fontSize: 14,
            color: "var(--ink-faint)",
            textDecoration: "none",
          }}
        >
          Blog
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
        <Link href="/blog" style={{ color: "var(--ink-faint)" }}>
          Blog
        </Link>
        {" · "}
        <Link
          href="/blog/editorial-policy"
          style={{ color: "var(--ink-faint)" }}
        >
          Editorial policy
        </Link>
        {" · "}
        {/* /feed.xml is a non-localized top-level route -> plain anchor, not i18n Link */}
        <a href="/feed.xml" style={{ color: "var(--ink-faint)" }}>
          RSS
        </a>
        {" · "}
        <Link href="/privacy" style={{ color: "var(--ink-faint)" }}>
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" style={{ color: "var(--ink-faint)" }}>
          Terms
        </Link>
      </footer>
    </main>
  );
}
