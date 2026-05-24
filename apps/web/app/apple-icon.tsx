import { ImageResponse } from "next/og";

// iOS home-screen icon. The OS applies its own rounded-corner mask, so the
// tile here is a flat sepia gradient (no squircle radius) with the Fork.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1C1815, #4A2C19)",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 200 200">
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
    ),
    { ...size }
  );
}
