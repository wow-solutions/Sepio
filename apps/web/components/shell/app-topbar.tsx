import { Link } from "@/i18n/navigation";
import { SepioMark } from "./sepio-mark";
import { Wordmark } from "./wordmark";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

type Props = {
  breadcrumb: string;
  // null → hide (e.g. /dashboard, where no brand is selected so /writer would
  // bounce through the brand redirect).
  newPostHref?: string | null;
  newPostLabel: string;
  userInitials?: string;
};

// The authed app top bar — 56px, per app handoff 2026-05-24. Brand lockup +
// breadcrumb (left), locale + New post + avatar (right). The ⌘K search box from
// the reference is intentionally deferred until real search exists (no dead
// stubs — see CLAUDE.md), so it is omitted rather than mocked.
export function AppTopBar({
  breadcrumb,
  newPostHref = null,
  newPostLabel,
  userInitials = "—",
}: Props) {
  return (
    <header
      style={{
        height: "var(--shell-topbar-h)",
        flexShrink: 0,
        padding: "0 22px",
        background: "rgba(24,20,16,0.78)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <SepioMark size={30} />
          <Wordmark size={18} />
        </Link>
        <div style={{ width: 1, height: 18, background: "var(--border-strong)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--brand)",
              boxShadow: "0 0 0 3px rgba(176,123,80,0.16)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              letterSpacing: "0.06em",
              color: "var(--ink-muted)",
            }}
          >
            {breadcrumb}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LocaleSwitcher />
        {newPostHref !== null && (
          <Link
            href={newPostHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--sepio-sepia)",
              color: "var(--sepio-cream)",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 9999,
              textDecoration: "none",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {newPostLabel}
          </Link>
        )}
        <div
          title="Account"
          aria-label="Account"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--sepio-sepia)",
            color: "var(--sepio-cream)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontVariationSettings: '"opsz" 36',
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid rgba(176,123,80,0.32)",
          }}
        >
          {userInitials.slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
