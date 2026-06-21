import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AppTopBar } from "./app-topbar";
import { Rail, type RailActive } from "./rail";
import { CollapsibleRail } from "./collapsible-rail";
import { KitchenProvider, type InitialGroup } from "./kitchen-context";
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
  // Writer only: seed the kitchen from an opened content group (reconstruct the
  // whole chain). Keys the provider so a different group/channel re-initializes.
  kitchenInitialGroup?: InitialGroup | null;
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
  kitchenInitialGroup = null,
  children,
}: Props) {
  const t = await getTranslations("shell");

  // Resolve beta_access once here (server) so the rail can gate the social
  // fan-out rows without every page threading the flag through. accounts.id is
  // the auth user id; default closed if signed out / no row.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let betaAccess = false;
  if (user) {
    const { data: account } = await supabase
      .from("accounts")
      .select("beta_access")
      .eq("id", user.id)
      .maybeSingle();
    betaAccess = account?.beta_access ?? false;
  }

  // Remount the provider (re-run its state initializers) when the opened group/
  // channel changes; stay stable per-brand otherwise so normal navigation keeps
  // the rail's persisted selection.
  const kitchenKey = kitchenInitialGroup
    ? `group:${kitchenInitialGroup.source.postId}:${kitchenInitialGroup.active}`
    : `brand:${currentBrandId ?? "none"}`;

  // Resolve trial + billing labels here (server) so Rail/AccountMenu receive
  // plain strings and pass cleanly through the client CollapsibleRail / menu.
  // NOTE: `trial` is a plan_TIER, not a plan_status (statuses are active/
  // cancelled/past_due/expired/paused/unpaid) — gating on planStatue here was a
  // bug that hid the countdown for every trial user.
  const isTrial = planTier === "trial";
  const trialDays = trialDaysLeft(trialEndsAt);
  const trialLabel =
    isTrial && trialDays !== null ? t("trialLeft", { days: trialDays }) : null;

  // State-aware billing CTA label. The action is identical (createCheckoutAction
  // returns checkout for trial, portal for subscribers); only the copy changes.
  const billingLabel = isTrial
    ? t("upgrade")
    : planStatus === "past_due" || planStatus === "unpaid"
      ? t("updateBilling")
      : t("managePlan");

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
        accountLabels={{
          account: t("account"),
          changePassword: t("changePassword"),
          signOut: t("signOut"),
          billing: billingLabel,
        }}
      />
      {/* KitchenProvider wraps BOTH the rail and the page so the content-kitchen
          channel selection (set by the writer) is readable by the rail. Inert on
          every page except the writer. */}
      <KitchenProvider
        key={kitchenKey}
        brandId={currentBrandId}
        initialGroup={kitchenInitialGroup}
      >
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
              billingLabel={billingLabel}
              betaAccess={betaAccess}
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
      </KitchenProvider>
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
