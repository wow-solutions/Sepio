type Props = { size?: number };

// The Sepio wordmark — Fraunces 500 at display optical size, trailing "o" in
// sepia-bright. Locked by design_handoff_sepio_brand v1:
//  - Always Latin. Never localize (no «Сепио»), so it binds --font-fraunces
//    directly rather than --font-serif (which falls back to Onest on :lang(ru)).
//  - Rendered as ONE inline element so a parent flex `gap` can't open a visible
//    split between "Sepi" and "o".
export function Wordmark({ size = 16 }: Props) {
  return (
    <span
      style={{
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontVariationSettings: '"opsz" 144',
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.045em",
        color: "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      Sepi<span style={{ color: "var(--sepio-sepia-bright)" }}>o</span>
    </span>
  );
}
