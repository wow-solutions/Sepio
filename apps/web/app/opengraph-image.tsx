import { ImageResponse } from "next/og";

// Social share card (LinkedIn/Telegram/etc). Branded sepia surface, the Fork
// tile, the wordmark, and the tagline. Uses ImageResponse's default font —
// Fraunces is not loaded here, so the wordmark renders in the fallback serif.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "#181410",
          color: "#F3ECE1",
        }}
      >
        <div
          style={{
            width: 132,
            height: 132,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 30,
            background: "linear-gradient(135deg, #1C1815, #4A2C19)",
          }}
        >
          <svg width="98" height="98" viewBox="0 0 200 200">
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
        <div style={{ display: "flex", fontSize: 88, letterSpacing: -2 }}>
          Sepi<span style={{ color: "#B07B50" }}>o</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#A09687" }}>
          One brand. Every feed. On schedule.
        </div>
      </div>
    ),
    { ...size }
  );
}
