import { Link } from "@/i18n/navigation";

// The "Blog" nav lockup — a sibling to the Sepio wordmark: Fraunces serif with
// the "o" in sepia-bright, mirroring "Sepi[o]". Always Latin ("Blog", never
// localized), like the Sepio wordmark. Uses the global --sepio-* tokens so it
// renders identically inside the landing's .lp scope and the app/auth scope.
export function BlogWordmark({ size = 26 }: { size?: number }) {
  return (
    <Link
      href="/blog"
      aria-label="Blog"
      style={{
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontVariationSettings: '"opsz" 60',
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        color: "var(--sepio-cream)",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      Bl<span style={{ color: "var(--sepio-sepia-bright)" }}>o</span>g
    </Link>
  );
}
