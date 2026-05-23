import { Link } from "@/i18n/navigation";
import { QuoteworthyMark } from "@/components/shell/quoteworthy-mark";

export function LegalShell({ children }: { children: React.ReactNode }) {
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
          <QuoteworthyMark size={28} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>Quoteworthy</span>
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
