import { Link } from "@/i18n/navigation";
import { BrandSwitcher, type BrandOption } from "@/components/brand/brand-switcher";
import { BillingCta } from "./billing-cta";
import { KitchenChannels } from "./kitchen-channels";

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
  // State-aware billing CTA label ("Upgrade now" / "Manage plan" / "Update
  // billing"), resolved in AppShell. The action behind it is the same for all.
  billingLabel?: string;
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

// The channel list + per-channel row rendering moved to KitchenChannels (the
// content-kitchen selector — interactive in the writer, indicators elsewhere).

const ACTIVE_BG = "rgba(176,123,80,0.12)";
const ACTIVE_BORDER = "rgba(176,123,80,0.28)";

export function Rail({
  active,
  brands,
  currentBrandId,
  planTier,
  trialLabel,
  billingLabel,
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

      {/* Channels — the content-kitchen selector. Inside the writer the rows are
          interactive (toggle a destination + click to preview its variant); on
          every other page they fall back to connection indicators. */}
      <div>
        <RailGroupLabel>{labels.channels}</RailGroupLabel>
        <KitchenChannels />
      </div>

      {/* Plan / billing card — countdown only on trial, CTA in every state */}
      {planTier && (
        <div style={{ marginTop: "auto" }}>
          <div
            style={{
              padding: 14,
              background: "rgba(176,123,80,0.06)",
              border: "1px solid rgba(176,123,80,0.18)",
              borderRadius: 10,
            }}
          >
            {trialLabel && (
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
            )}
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
              {planTier}
            </div>
            {billingLabel && <BillingCta label={billingLabel} />}
          </div>
        </div>
      )}
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

