"use client";

// The CHANNELS section of the rail. Two modes:
//  - Outside the writer (no kitchen source): static — connection indicator +
//    "soon" label, live channels link to the brand page. (Honest, no toggles.)
//  - Inside the writer with a blog source: each row is interactive —
//    [icon] [connection dot] [name] [publish-here toggle]. Clicking the row makes
//    that channel active (lazy-generates its variant + previews it); the toggle
//    selects it as a destination. Blog ('hosted') is the foundation: always on.
//
// Connection indicator = whether auto-publish is wired for the channel today
// (Blog + LinkedIn). Generation works for ALL channels regardless (slice 1 =
// ready-to-use text; auto-publish only to the blog).

import { useKitchen } from "./kitchen-context";
import {
  CHANNEL_ORDER,
  CHANNEL_LABEL,
  CHANNEL_ICON,
  type ChannelId,
} from "@/lib/kitchen/channel-formats";

// Auto-publish availability today (the connection indicator). Generation is
// available for every channel; this only drives the dot vs "soon" label.
const PUBLISH_LIVE: Record<ChannelId, boolean> = {
  hosted: true,
  linkedin: true,
  x: false,
  facebook: false,
  instagram: false,
  threads: false,
  telegram: false,
  tiktok: false,
};

// The channel rail is the same on every page: each row is [icon · connection
// dot · name · iOS publish-toggle]. Clicking the row PREVIEWS the channel in the
// writer (sets active); the toggle selects it as a publish destination. The
// destination selection persists per brand (kitchen-context localStorage).
export function KitchenChannels() {
  const k = useKitchen();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <style>{"@keyframes kc-spin{to{transform:rotate(360deg)}}"}</style>
      {CHANNEL_ORDER.map((c) => {
        const live = PUBLISH_LIVE[c];
        const icon = CHANNEL_ICON[c];
        const name = CHANNEL_LABEL[c];
        const isActive = k.active === c;
        const selected = k.selected.has(c);
        const variant = k.variants[c];
        const loading = !!variant?.loading;
        return (
          <div
            key={c}
            style={{
              ...rowStyle(isActive),
              cursor: "pointer",
              background: isActive ? "rgba(176,123,80,0.12)" : "transparent",
            }}
            onClick={() => k.selectChannel(c)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                k.selectChannel(c);
              }
            }}
          >
            <IconPill icon={icon} dim={!selected} />
            <ConnDot live={live} />
            <span
              style={{
                flex: 1,
                color: selected ? "var(--ink)" : "var(--ink-muted)",
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {name}
            </span>
            {loading ? (
              <Spinner />
            ) : (
              <KitchenToggle
                on={selected}
                disabled={false}
                onToggle={() => k.toggleChannel(c)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 12px",
    borderRadius: 7,
    fontSize: 13.5,
    textDecoration: "none",
    outline: active ? "1px solid rgba(176,123,80,0.25)" : "none",
  };
}

function IconPill({ icon, dim }: { icon: string; dim: boolean }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        background: "rgba(176,123,80,0.12)",
        color: "var(--brand)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontVariationSettings: '"opsz" 36',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: "-0.02em",
        flexShrink: 0,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {icon}
    </span>
  );
}

// Connection indicator — LEFT of the name. Green dot = auto-publish wired today;
// hollow = generate-only (copy/export until the integration lands).
function ConnDot({ live }: { live: boolean }) {
  return (
    <span
      aria-hidden
      title={live ? "Connected" : "Generate only (publish coming)"}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        flexShrink: 0,
        background: live ? "var(--pass)" : "transparent",
        border: live ? "none" : "1.5px solid var(--ink-faint)",
        boxShadow: live ? "0 0 0 3px rgba(122,160,121,0.18)" : "none",
      }}
    />
  );
}


// Apple-style on/off switch — RIGHT of the name. Stops propagation so toggling a
// destination doesn't also switch the active preview.
function KitchenToggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
      style={{
        position: "relative",
        width: 40,
        height: 24,
        borderRadius: 999,
        border: 0,
        padding: 0,
        flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        background: on ? "#34c759" : "var(--border-strong)",
        opacity: disabled ? 0.55 : 1,
        transition: "background 0.2s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          transform: on ? "translateX(16px)" : "translateX(0)",
          transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 13,
        height: 13,
        flexShrink: 0,
        border: "2px solid var(--border-strong)",
        borderTopColor: "var(--brand)",
        borderRadius: "50%",
        animation: "kc-spin 0.8s linear infinite",
      }}
    />
  );
}
