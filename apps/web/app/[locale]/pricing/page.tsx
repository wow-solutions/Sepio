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
          padding: "104px 24px 32px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontVariationSettings: '"opsz" 144',
            fontSize: "clamp(38px, 5.5vw, 56px)",
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1.04,
            margin: "0 0 16px",
            color: "var(--ink)",
          }}
        >
          Simple,{" "}
          <em style={{ fontStyle: "italic", color: "var(--brand)" }}>honest</em>{" "}
          pricing.
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
            <div key={plan.name} style={{ width: "100%", maxWidth: 480 }}>
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
        background:
          "linear-gradient(180deg, rgba(176,123,80,0.10) 0%, var(--surface-elev, var(--surface)) 62%)",
        border: "1px solid var(--border-strong)",
        borderRadius: 22,
        padding: "36px 34px",
        boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--brand)",
          }}
        >
          {plan.name}
        </span>
        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div
            style={{
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontVariationSettings: '"opsz" 144',
              fontSize: 52,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "var(--ink)",
            }}
          >
            ${plan.price}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-faint)",
              marginTop: 2,
            }}
          >
            / month
          </div>
        </div>
      </div>

      <p
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontVariationSettings: '"opsz" 48',
          fontSize: 18,
          fontWeight: 500,
          lineHeight: 1.35,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          margin: "14px 0 0",
        }}
      >
        {plan.blurb}
      </p>

      <div
        style={{ height: 1, background: "var(--border-subtle)", margin: "24px 0" }}
      />

      <ul
        style={{
          listStyle: "none",
          margin: "0 0 30px",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 13,
        }}
      >
        {plan.features.map((feature) => (
          <li
            key={feature}
            style={{
              fontSize: 14.5,
              color: "var(--ink)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              lineHeight: 1.5,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--brand)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flex: "0 0 auto", marginTop: 3 }}
              aria-hidden="true"
            >
              <path d="M5 12l4 4L19 6" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isAuthed ? (
        <BuyButton tier={plan.tier} label={`Upgrade to ${plan.name}`} highlight />
      ) : (
        <Link
          href="/signup"
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            padding: "14px 22px",
            borderRadius: 9999,
            background: "var(--sepio-sepia, var(--brand))",
            color: "var(--sepio-cream)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Start 14-day trial
        </Link>
      )}
    </div>
  );
}
