type Props = { size?: number };

// The Fork — Sepio's brand symbol. A source dot on the left, five branches
// fanning right to five sepia-bright endpoint dots (one input → many platforms).
// Geometry is the locked handoff mark (design_handoff_sepio_brand v1); do not
// redraw it. Stroke is thickened in viewBox units so the lines stay legible at
// the small nav/auth tile sizes we render here (24–40px).
export function SepioMark({ size = 28 }: Props) {
  const inner = Math.round(size * 0.78);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "22.37%",
        background: "linear-gradient(135deg, #1C1815, #4A2C19)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg
        viewBox="0 0 200 200"
        width={inner}
        height={inner}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sepio"
      >
        <circle cx="32" cy="100" r="15" fill="#F3ECE1" />
        <g
          stroke="#F3ECE1"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          opacity="0.92"
        >
          <path d="M 46 100 C 90 100, 100 100, 118 28" />
          <path d="M 46 100 C 100 100, 110 100, 130 64" />
          <path d="M 46 100 L 168 100" />
          <path d="M 46 100 C 100 100, 110 100, 130 136" />
          <path d="M 46 100 C 90 100, 100 100, 118 172" />
        </g>
        <g fill="#B07B50">
          <circle cx="122" cy="22" r="11" />
          <circle cx="135" cy="58" r="11" />
          <circle cx="172" cy="100" r="12" />
          <circle cx="135" cy="142" r="11" />
          <circle cx="122" cy="178" r="11" />
        </g>
      </svg>
    </div>
  );
}
