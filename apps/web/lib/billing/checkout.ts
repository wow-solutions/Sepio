"use server";

// Checkout server action. Creates an LS hosted-checkout URL for a paid tier, or
// routes an already-subscribed user to the customer portal (LS handles upgrade/
// downgrade/cancel there — we don't build an in-app plan switcher).
//
// The API key lives only here (server-side). The client gets back a URL to send
// the browser to, or an error string.

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo";
import { isPaidTier, variantForTier } from "./config";
import { createCheckout, getCustomerPortalUrl } from "./lemon-squeezy";

// `notice` is a calm, informational message (not an error) — used when the
// customer portal isn't reachable yet because the LS store is still in test
// mode / pending activation.
export type CheckoutResult =
  | { url: string }
  | { error: string }
  | { notice: string };

export async function createCheckoutAction(planTier: string): Promise<CheckoutResult> {
  if (!isPaidTier(planTier)) {
    return { error: "Unknown plan" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Please sign in first" };
  }

  // Own account row (RLS-scoped). Tells us whether a live subscription exists.
  const { data: account } = await supabase
    .from("accounts")
    .select("lemonsqueezy_subscription_id, plan_status")
    .eq("id", user.id)
    .maybeSingle();

  // An expired subscription is dead — let the user buy fresh. Anything else with
  // a subscription id is manageable in the portal (active/past_due/cancelled/…).
  const hasLiveSub =
    !!account?.lemonsqueezy_subscription_id && account.plan_status !== "expired";

  try {
    if (hasLiveSub) {
      // The LS customer portal is a storefront page gated behind store
      // activation. While the store is in test mode (pending activation) it
      // returns "store not activated", so show a calm notice instead of bouncing
      // the user to that page. Flip LEMONSQUEEZY_TEST_MODE=false once activated.
      if (process.env.LEMONSQUEEZY_TEST_MODE === "true") {
        const t = await getTranslations("shell");
        return { notice: t("billingNotice") };
      }
      const portal = await getCustomerPortalUrl(account!.lemonsqueezy_subscription_id!);
      if (!portal) {
        return { error: "Could not open the billing portal. Please contact support." };
      }
      return { url: portal };
    }

    const url = await createCheckout({
      accountId: user.id,
      email: user.email,
      variantId: variantForTier(planTier),
      redirectUrl: `${SITE_URL}/dashboard?welcome=1`,
    });
    return { url };
  } catch (err) {
    console.error("[checkout] failed for account", user.id, err);
    return { error: "Could not start checkout. Please try again." };
  }
}
