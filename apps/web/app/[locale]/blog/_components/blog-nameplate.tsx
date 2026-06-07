import { Link } from "@/i18n/navigation";

// Compact journal nameplate for the shared blog header: a small uppercase
// "THE SEPIO JOURNAL" eyebrow over a Fraunces-serif "Blog". Mirrors the big
// index masthead (.bi-kick + .bi-head h1) so the blog identity reads the same
// on every blog surface (index, article, author, editorial policy). Links to
// the blog index.
export function BlogNameplate() {
  return (
    <Link
      href="/blog"
      aria-label="The Sepio Journal — Blog"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 3,
        textDecoration: "none",
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-onest), ui-sans-serif, system-ui, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          fontSize: 9.5,
          fontWeight: 600,
          color: "var(--sepio-sepia-bright)",
        }}
      >
        The Sepio Journal
      </span>
      <span
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontWeight: 600,
          fontSize: 23,
          letterSpacing: "-0.01em",
          lineHeight: 0.95,
          color: "var(--ink)",
        }}
      >
        Blog
      </span>
    </Link>
  );
}
