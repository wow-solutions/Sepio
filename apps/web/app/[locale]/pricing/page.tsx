import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { LegalShell } from "../privacy/shell";

export const metadata: Metadata = {
  title: "Pricing — Quoteworthy",
  description:
    "Content automation for solo consultants and boutique agencies. Plans from $49 to $399.",
};

type Plan = {
  name: string;
  price: number;
  blurb: string;
  features: string[];
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Solo",
    price: 49,
    blurb: "For one brand, one consultant.",
    features: [
      "30 posts per month",
      "1 brand",
      "1 language",
      "SVG templated images",
      "LinkedIn + Telegram + Blog",
      "Topic research (3 sources)",
    ],
  },
  {
    name: "Solo Pro",
    price: 99,
    highlight: true,
    blurb: "Adds image generation and multi-language.",
    features: [
      "100 posts per month",
      "1 brand",
      "3 languages",
      "AI image generation (5 / month)",
      "All platforms (after rollout)",
      "Per-platform format adapter",
    ],
  },
  {
    name: "Boutique",
    price: 199,
    blurb: "Manage a small portfolio of clients.",
    features: [
      "300 posts per month",
      "3 brands",
      "3 languages",
      "AI image generation (30 / month)",
      "All platforms (after rollout)",
      "Carousels + Photo Mode",
    ],
  },
  {
    name: "Agency",
    price: 399,
    blurb: "Built for boutique agencies running multiple clients.",
    features: [
      "1,000 posts per month",
      "10 brands",
      "5 languages",
      "AI image generation (100 / month)",
      "All platforms (after rollout)",
      "Priority support",
    ],
  },
];

export default function PricingPage() {
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
          Drafting, scheduling, and publishing across LinkedIn, Telegram,
          Instagram, Threads, TikTok, and your blog — in one dashboard.
          Cancel anytime. 14-day free trial on every plan.
        </p>
      </section>

      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 24px 80px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
          }}
        >
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 40,
            fontSize: 13,
            color: "var(--ink-faint)",
            maxWidth: 720,
            margin: "40px auto 0",
            lineHeight: 1.6,
          }}
        >
          Every plan includes a 14-day free trial — no card required. Prices
          billed monthly in USD via Lemon Squeezy. Instagram, Threads, and
          TikTok publishing are rolled out as Meta and TikTok approve the
          integration; LinkedIn, Telegram, and Blog work today.
        </p>
      </section>
    </LegalShell>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
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
    </div>
  );
}
