import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, localizedUrl } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import type { PaidTier } from "@/lib/billing/config";
import { LegalShell } from "../privacy/shell";
import { BuyButton } from "./BuyButton";

const TITLE = "Pricing — Sepio | AI Content Engine for Agencies";
const DESCRIPTION =
  "See Sepio plans for agencies: GEO-ready, multi-platform content in your clients' voice. Monthly, cancel anytime. Start free, no credit card.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const l = ((await params).locale as Locale) ?? "en";
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: alternatesFor(l, "pricing"),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: localizedUrl(l, "pricing"),
      siteName: "Sepio",
      type: "website",
    },
  };
}

type Plan = {
  name: string;
  tier: PaidTier;
  price: number;
  blurb: string;
  features: string[];
  highlight?: boolean;
};

// Early access: one purchasable plan ($29) while functionality is still filling
// out. The full agency ladder (Starter / Growth / Agency / Scale) ships later.
const PLANS: Plan[] = [
  {
    name: "Early Access",
    tier: "early",
    price: 29,
    highlight: true,
    blurb: "Try Sepio now, at a founding price, and shape what it becomes.",
    features: [
      "Everything available today",
      "Generate SEO & social content per brand",
      "LinkedIn, Telegram & blog publishing",
      "Topic research + keyword targeting",
      "Founding price, locked while you stay",
      "Direct line to the founder for feedback",
    ],
  },
];

export default async function PricingPage() {
  // Authed users get a working "Upgrade" button (→ checkout/portal); anon
  // visitors keep the marketing CTA to /signup (trial-first funnel).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <LegalShell>
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "72px 24px 32px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: "0 0 16px",
            color: "var(--ink)",
          }}
        >
          Simple, honest pricing.
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--ink-muted)",
            margin: "0 auto 12px",
            maxWidth: 580,
            lineHeight: 1.55,
          }}
        >
          Sepio is in early access. One founding plan, one honest price —
          come in now, use what works today, and help shape the rest.
          Cancel anytime. 14-day free trial, no card.
        </p>
      </section>

      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 24px 80px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{ width: "100%", maxWidth: 360 }}>
              <PlanCard plan={plan} isAuthed={isAuthed} />
            </div>
          ))}
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "var(--ink-faint)",
            maxWidth: 720,
            margin: "40px auto 0",
            lineHeight: 1.6,
          }}
        >
          Billed monthly in USD via Lemon Squeezy, cancel anytime. Full agency
          plans (Starter, Growth, Agency, Scale) arrive as features ship — early
          members keep their founding price. LinkedIn, Telegram, and Blog work
          today; Instagram, Threads, and TikTok roll out as Meta and TikTok
          approve the integration.
        </p>
      </section>
    </LegalShell>
  );
}

function PlanCard({ plan, isAuthed }: { plan: Plan; isAuthed: boolean }) {
  return (
    <div
      style={{
        border: plan.highlight
          ? "1px solid var(--ink)"
          : "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: "28px 24px",
        background: "var(--surface, transparent)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        position: "relative",
      }}
    >
      {plan.highlight && (
        <span
          style={{
            position: "absolute",
            top: -10,
            left: 20,
            background: "var(--ink)",
            color: "var(--bg)",
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 999,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Most popular
        </span>
      )}
      <div>
        <div
          style={{
            fontSize: 14,
            color: "var(--ink-muted)",
            marginBottom: 4,
            fontWeight: 600,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {plan.name}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            ${plan.price}
          </span>
          <span style={{ fontSize: 14, color: "var(--ink-faint)" }}>/mo</span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-muted)",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          {plan.blurb}
        </p>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        {plan.features.map((feature) => (
          <li
            key={feature}
            style={{
              fontSize: 13,
              color: "var(--ink)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              lineHeight: 1.45,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: "var(--ink-muted)",
                marginTop: 2,
                fontSize: 11,
              }}
            >
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isAuthed ? (
        <BuyButton
          tier={plan.tier}
          label={`Upgrade to ${plan.name}`}
          highlight={plan.highlight}
        />
      ) : (
        <Link
          href="/signup"
          style={{
            display: "block",
            textAlign: "center",
            padding: "10px 16px",
            borderRadius: 8,
            background: plan.highlight ? "var(--ink)" : "transparent",
            color: plan.highlight ? "var(--bg)" : "var(--ink)",
            border: plan.highlight
              ? "1px solid var(--ink)"
              : "1px solid var(--border-strong)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            marginTop: "auto",
          }}
        >
          Start 14-day trial
        </Link>
      )}
    </div>
  );
}
