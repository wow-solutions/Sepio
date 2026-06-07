import { Link } from "@/i18n/navigation";
import { SepioMark } from "@/components/shell/sepio-mark";
import { Wordmark } from "@/components/shell/wordmark";
import { BlogNameplate } from "./_components/blog-nameplate";

// Public chassis for the blog (forked from the legal/privacy LegalShell). Thin
// header: Sepio brand lockup (links home) on the left, the journal nameplate
// (The Sepio Journal / Blog) on the right so the blog identity is consistent on
// every blog surface. No rail/topbar/AppShell.
export function BlogShell({
  children,
  // The index already carries the full "The Sepio Journal / Blog" masthead in
  // its body, so it suppresses the compact header nameplate to avoid showing
  // the same lockup twice. Every other blog surface keeps it.
  hideNameplate = false,
}: {
  children: React.ReactNode;
  hideNameplate?: boolean;
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
            gap: 10,
            textDecoration: "none",
            color: "var(--ink)",
          }}
        >
          <SepioMark size={32} />
          <Wordmark size={22} />
        </Link>
        {hideNameplate ? <span /> : <BlogNameplate />}
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
