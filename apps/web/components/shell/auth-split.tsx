import { Link } from "@/i18n/navigation";
import { SepioMark } from "./sepio-mark";
import { Wordmark } from "./wordmark";
import { BlogWordmark } from "./blog-wordmark";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

// Editorial two-column auth layout from the app handoff 2026-05-24
// ("Sepio Auth screens"): form column left, sepia editorial pane right.
// The pane is dropped below 900px (see .auth-split in globals.css).

export function Em({ children }: { children: React.ReactNode }) {
  return (
    <em
      style={{
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontStyle: "italic",
        fontWeight: 400,
        color: "var(--sepio-sepia-bright)",
      }}
    >
      {children}
    </em>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--sepio-sepia-bright)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--sepio-sepia-bright)",
          boxShadow: "0 0 0 3px rgba(176,123,80,0.16)",
        }}
      />
      {children}
    </span>
  );
}

export function AuthDisplay({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontVariationSettings: '"opsz" 72',
        fontWeight: 500,
        fontSize: 40,
        lineHeight: 1.04,
        letterSpacing: "-0.028em",
        color: "var(--ink)",
        margin: "16px 0 0",
      }}
    >
      {children}
    </h1>
  );
}

export function AuthLede({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 15.5,
        lineHeight: 1.6,
        color: "var(--ink-muted)",
        margin: "12px 0 0",
        maxWidth: "46ch",
      }}
    >
      {children}
    </p>
  );
}

export function AuthFieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-muted)",
        marginBottom: 8,
      }}
    >
      <span>{children}</span>
      {hint && (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            textTransform: "none",
            letterSpacing: 0,
            color: "var(--ink-faint)",
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

// Honest editorial pane: brand positioning, no fabricated testimonial.
export function AuthPane({
  eyebrow,
  headline,
  lede,
}: {
  eyebrow: string;
  headline: React.ReactNode;
  lede: string;
}) {
  return (
    <div
      style={{
        height: "100%",
        padding: "88px 72px 64px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 22,
      }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <div
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontVariationSettings: '"opsz" 96',
          fontWeight: 500,
          fontSize: 46,
          lineHeight: 1.05,
          letterSpacing: "-0.026em",
          color: "var(--ink)",
        }}
      >
        {headline}
      </div>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 16,
          lineHeight: 1.6,
          color: "var(--ink-muted)",
          margin: 0,
          maxWidth: "42ch",
        }}
      >
        {lede}
      </p>
    </div>
  );
}

export function AuthSplit({
  screenLabel,
  rightPane,
  footer,
  children,
  // When set, the top-right shows the Blog wordmark (sibling to the Sepio
  // wordmark) next to the locale switcher instead of the screen-label text.
  // Used on /login.
  blogNav = false,
}: {
  screenLabel: string;
  rightPane: React.ReactNode;
  footer: { copyright: string; terms: string; privacy: string; blog?: string };
  children: React.ReactNode;
  blogNav?: boolean;
}) {
  return (
    <main className="auth-split">
      {/* LEFT — form column */}
      <div
        style={{
          padding: "40px clamp(24px, 5vw, 64px)",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Link
            href="/login"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
            }}
          >
            <SepioMark size={32} />
            <Wordmark size={22} />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {blogNav ? (
              <BlogWordmark size={22} />
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-faint)",
                }}
              >
                {screenLabel}
              </span>
            )}
            <LocaleSwitcher />
          </div>
        </div>

        <div
          style={{
            margin: "auto 0",
            maxWidth: 440,
            width: "100%",
            paddingTop: 40,
            paddingBottom: 40,
          }}
        >
          {children}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingTop: 28,
            borderTop: "1px solid var(--border-subtle)",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            flexWrap: "wrap",
          }}
        >
          <span>{footer.copyright}</span>
          <span style={{ display: "flex", gap: 18 }}>
            {footer.blog && (
              <Link href="/blog" style={{ color: "inherit", textDecoration: "none" }}>
                {footer.blog}
              </Link>
            )}
            <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>
              {footer.terms}
            </Link>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
              {footer.privacy}
            </Link>
          </span>
        </div>
      </div>

      {/* RIGHT — editorial pane */}
      <div className="auth-pane-col">{rightPane}</div>
    </main>
  );
}
