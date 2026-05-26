import { Link } from "@/i18n/navigation";
import { BrandSwitcher, type BrandOption } from "@/components/brand/brand-switcher";

export type RailActive =
  | "home"
  | "writer"
  | "posts"
  | "connections"
  | "settings"
  | "billing"
  | null;

type Props = {
  active: RailActive;
  brands: BrandOption[];
  currentBrandId: string | null;
  planTier?: string | null;
  // Pre-resolved trial label (e.g. "Trial · 11 days left"). Computed server-side
  // in AppShell so this stays a plain string — Rail can be passed through the
  // client CollapsibleRail without a non-serializable function prop.
  trialLabel?: string | null;
  labels: {
    workspace: string;
    home: string;
    writer: string;
    posts: string;
    channels: string;
    soon: string;
    connect: string;
    upgrade: string;
    selectBrandHint: string;
  };
};

// Channels we surface in the rail. LinkedIn is the only wired platform today
// (ADR-0019); the rest are shown as "soon" so the rail reads honest, not
// over-promised. The 2-letter Fraunces pill matches the handoff channel rail.
const CHANNELS: { name: string; icon: string; live: boolean }[] = [
  { name: "LinkedIn", icon: "in", live: true },
  { name: "Telegram", icon: "Tg", live: false },
  { name: "Instagram", icon: "Ig", live: false },
  { name: "TikTok", icon: "Tt", live: false },
  { name: "Threads", icon: "Th", live: false },
  { name: "Blog", icon: "Bl", live: false },
];

const ACTIVE_BG = "rgba(176,123,80,0.12)";
const ACTIVE_BORDER = "rgba(176,123,80,0.28)";

export function Rail({
  active,
  brands,
  currentBrandId,
  planTier,
  trialLabel,
  labels,
}: Props) {
  // Brand-scoped routes need a brand. When none is selected, Writer/Posts point
  // back to the dashboard (mirrors the old TopBar's null-href behaviour).
  const writerHref = currentBrandId
    ? `/writer?brand=${currentBrandId}`
    : "/dashboard";
  const postsHref = currentBrandId
    ? `/posts?brand=${currentBrandId}`
    : "/posts";

  const showTrial = Boolean(trialLabel);

  return (
    <aside
      style={{
        width: "var(--shell-sidebar-w)",
        flexShrink: 0,
        background: "var(--sepio-surface-deep)",
        borderRight: "1px solid var(--border-subtle)",
        padding: "18px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        overflowY: "auto",
      }}
    >
      {/* Workspace context — current brand + switcher (multi-brand spine) */}
      <div>
        <RailGroupLabel>{labels.workspace}</RailGroupLabel>
        <BrandSwitcher
          brands={brands}
          currentBrandId={currentBrandId}
          variant="rail"
        />
        {!currentBrandId && (
          <p
            style={{
              margin: "8px 4px 0",
              fontSize: 11.5,
              lineHeight: 1.45,
              color: "var(--ink-faint)",
            }}
          >
            {labels.selectBrandHint}
          </p>
        )}
      </div>

      {/* Primary nav. Writer is brand-scoped — hide it when no brand is
          selected (e.g. on the dashboard) so it can't lead nowhere. */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <RailItem href="/dashboard" icon="◉" label={labels.home} active={active === "home"} />
        {currentBrandId && (
          <RailItem href={writerHref} icon="✎" label={labels.writer} active={active === "writer"} />
        )}
        <RailItem href={postsHref} icon="◊" label={labels.posts} active={active === "posts"} />
      </nav>

      {/* Channels */}
      <div>
        <RailGroupLabel>{labels.channels}</RailGroupLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {CHANNELS.map((c) => (
            <RailChannel
              key={c.name}
              name={c.name}
              icon={c.icon}
              live={c.live}
              href={c.live && currentBrandId ? `/brands/${currentBrandId}` : null}
              soonLabel={labels.soon}
            />
          ))}
        </div>
      </div>

      {/* Trial / plan card */}
      <div style={{ marginTop: "auto" }}>
        {showTrial ? (
          <div
            style={{
              padding: 14,
              background: "rgba(176,123,80,0.06)",
              border: "1px solid rgba(176,123,80,0.18)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--brand)",
                marginBottom: 8,
              }}
            >
              {trialLabel}
            </div>
            <div
              style={{
                fontFamily: "var(--font-fraunces), Georgia, serif",
                fontVariationSettings: '"opsz" 36',
                fontSize: 15,
                fontWeight: 500,
                color: "var(--ink)",
                letterSpacing: "-0.012em",
                marginBottom: 10,
                textTransform: "capitalize",
              }}
            >
              {planTier ?? "trial"}
            </div>
            <Link
              href="/pricing"
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "7px 12px",
                background: "var(--brand)",
                color: "var(--sepio-ink)",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 9999,
                textDecoration: "none",
              }}
            >
              {labels.upgrade} →
            </Link>
          </div>
        ) : (
          planTier && (
            <div
              style={{
                padding: "10px 14px",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-faint)",
              }}
            >
              {planTier}
            </div>
          )
        )}
      </div>
    </aside>
  );
}

function RailGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
        margin: "0 12px 8px",
      }}
    >
      {children}
    </div>
  );
}

function RailItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "7px 12px",
        background: active ? ACTIVE_BG : "transparent",
        border: `1px solid ${active ? ACTIVE_BORDER : "transparent"}`,
        color: active ? "var(--ink)" : "var(--ink-muted)",
        fontSize: 13.5,
        borderRadius: 7,
        textDecoration: "none",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: active ? "var(--brand)" : "var(--ink-faint)",
          width: 16,
          display: "inline-flex",
          justifyContent: "center",
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function RailChannel({
  name,
  icon,
  live,
  href,
  soonLabel,
}: {
  name: string;
  icon: string;
  live: boolean;
  href: string | null;
  soonLabel: string;
}) {
  const inner = (
    <>
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
          opacity: live ? 1 : 0.5,
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span style={{ flex: 1, color: live ? "var(--ink)" : "var(--ink-faint)" }}>
        {name}
      </span>
      {live ? (
        // Live channel — green "connected" status dot. LinkedIn is the wired
        // platform today.
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--pass)",
            boxShadow: "0 0 0 3px rgba(122,160,121,0.18)",
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          {soonLabel}
        </span>
      )}
    </>
  );

  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "7px 12px",
    borderRadius: 7,
    fontSize: 13.5,
    textDecoration: "none",
  };

  if (live && href) {
    return (
      <Link href={href} style={baseStyle}>
        {inner}
      </Link>
    );
  }
  return <div style={{ ...baseStyle, cursor: "default" }}>{inner}</div>;
}
