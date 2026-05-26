import { getTranslations } from "next-intl/server";
import { AppTopBar } from "./app-topbar";
import { Rail, type RailActive } from "./rail";
import { CollapsibleRail } from "./collapsible-rail";
import type { BrandOption } from "@/components/brand/brand-switcher";

type Props = {
  active: RailActive;
  brands: BrandOption[];
  currentBrandId: string | null;
  breadcrumb: string;
  newPostHref?: string | null;
  userInitials?: string;
  planTier?: string | null;
  planStatus?: string | null;
  trialEndsAt?: string | null;
  children: React.ReactNode;
};

// The authenticated app chassis: persistent 56px top bar + 240px rail + a
// scrolling main. Pages wrap their content in <AppShell> instead of rendering
// a bare <TopBar>. Labels are resolved here (server component) so call-sites
// stay clean. Per app handoff 2026-05-24.
export async function AppShell({
  active,
  brands,
  currentBrandId,
  breadcrumb,
  newPostHref = null,
  userInitials,
  planTier,
  planStatus,
  trialEndsAt,
  children,
}: Props) {
  const t = await getTranslations("shell");

  // Resolve the trial label here (server) so Rail receives a plain string and
  // can pass cleanly through the client CollapsibleRail.
  const trialDays = trialDaysLeft(trialEndsAt);
  const trialLabel =
    planStatus === "trial" && trialDays !== null
      ? t("trialLeft", { days: trialDays })
      : null;

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      <AppTopBar
        breadcrumb={breadcrumb}
        newPostHref={newPostHref}
        newPostLabel={t("newPost")}
        userInitials={userInitials}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <CollapsibleRail
          expandLabel={t("showMenu")}
          collapseLabel={t("hideMenu")}
        >
          <Rail
            active={active}
            brands={brands}
            currentBrandId={currentBrandId}
            planTier={planTier}
            trialLabel={trialLabel}
            labels={{
              workspace: t("workspace"),
              home: t("home"),
              writer: t("writer"),
              posts: t("posts"),
              channels: t("channels"),
              soon: t("soon"),
              connect: t("connect"),
              upgrade: t("upgrade"),
              selectBrandHint: t("selectBrandHint"),
            }}
          />
        </CollapsibleRail>
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function trialDaysLeft(trialEndsAt?: string | null): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  return days > 0 ? days : 0;
}
