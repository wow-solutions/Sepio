import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import { BrandDot } from "@/components/brand/brand-dot";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { brandColor } from "@/lib/brand-color";
import { signout } from "./actions";

type PageProps = {
  searchParams: Promise<{ brand?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const { brand: highlightId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("dashboard");

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at")
    .eq("id", user.id)
    .single();

  const [{ data: brands }, { data: allConfigs }, { data: allPosts }] =
    await Promise.all([
      supabase
        .from("brands")
        .select("id, name, slug, industry, primary_language, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("brand_configs").select("brand_id, tone_attributes"),
      supabase.from("posts").select("brand_id"),
    ]);

  const list = brands ?? [];
  const configsList = allConfigs ?? [];
  const postsList = allPosts ?? [];

  const postCounts: Record<string, number> = {};
  for (const p of postsList) {
    postCounts[p.brand_id] = (postCounts[p.brand_id] ?? 0) + 1;
  }

  const switcherBrands: BrandOption[] = list.map((b) => {
    const cfg = configsList.find((c) => c.brand_id === b.id);
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      postCount: postCounts[b.id] ?? 0,
      toneSummary: formatToneSummary(cfg?.tone_attributes ?? []),
    };
  });

  const userInitials = makeInitials(account?.display_name ?? user.email ?? "");

  return (
    <AppShell
      active="home"
      brands={switcherBrands}
      currentBrandId={null}
      breadcrumb={t("breadcrumb")}
      userInitials={userInitials}
      planTier={account?.plan_tier ?? null}
      planStatus={account?.plan_status ?? null}
      trialEndsAt={account?.trial_ends_at ?? null}
    >
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "40px 32px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 32,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--brand)",
                marginBottom: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  boxShadow: "0 0 0 3px rgba(176,123,80,0.16)",
                }}
              />
              {account?.display_name ?? user.email}
            </div>
            <h1
              style={{
                fontFamily: "var(--font-fraunces), Georgia, serif",
                fontVariationSettings: '"opsz" 144',
                fontSize: 40,
                fontWeight: 500,
                letterSpacing: "-0.028em",
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.02,
              }}
            >
              {t("title")}
            </h1>
            <p
              style={{
                marginTop: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ink-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {account?.plan_tier ?? "trial"} · {t("brandCount", { count: list.length })}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <form action={signout}>
              <button
                type="submit"
                style={{
                  height: 36,
                  padding: "0 14px",
                  background: "transparent",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 9999,
                  color: "var(--ink-muted)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("signOut")}
              </button>
            </form>
            <Link
              href="/brands/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 36,
                padding: "0 18px",
                background: "var(--sepio-sepia)",
                color: "var(--sepio-cream)",
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {t("addBrand")}
            </Link>
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
          />
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {list.map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                isNew={highlightId === b.id}
                labels={{
                  newBadge: t("card.newBadge"),
                  writer: t("card.writer"),
                  posts: t("card.posts"),
                  connections: t("card.connections"),
                  settings: t("card.settings"),
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function BrandCard({
  brand,
  isNew,
  labels,
}: {
  brand: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    primary_language: string;
  };
  isNew: boolean;
  labels: {
    newBadge: string;
    writer: string;
    posts: string;
    connections: string;
    settings: string;
  };
}) {
  const color = brandColor(brand.slug);
  return (
    <li
      className="brand-card"
      style={{
        position: "relative",
        background: "var(--raised)",
        border: `1px solid ${isNew ? "var(--pass)" : "var(--border-subtle)"}`,
        borderRadius: 14,
        padding: 22,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          background: color,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandDot color={color} size={10} />
          <h3
            style={{
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontVariationSettings: '"opsz" 48',
              fontSize: 18,
              fontWeight: 500,
              color: "var(--ink)",
              margin: 0,
              letterSpacing: "-0.014em",
            }}
          >
            {brand.name}
          </h3>
        </div>
        {isNew && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--pass)",
              border: "1px solid rgba(122,160,121,0.30)",
              background: "var(--pass-bg)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {labels.newBadge}
          </span>
        )}
      </div>

      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          margin: 0,
          marginBottom: 20,
        }}
      >
        {brand.industry ? `${brand.industry} · ` : ""}
        {brand.primary_language.toUpperCase()}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          paddingTop: 14,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <Link
          href={`/writer?brand=${brand.id}`}
          style={{
            height: 28,
            padding: "0 12px",
            background: "rgba(176,123,80,0.12)",
            border: "1px solid rgba(176,123,80,0.28)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
          }}
        >
          {labels.writer}
        </Link>
        <Link
          href={`/posts?brand=${brand.id}`}
          style={{
            height: 28,
            padding: "0 10px",
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
          }}
        >
          {labels.posts}
        </Link>
        <Link
          href={`/brands/${brand.id}`}
          style={{
            height: 28,
            padding: "0 10px",
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
          }}
        >
          {labels.connections}
        </Link>
        <Link
          href={`/brands/${brand.id}/settings`}
          style={{
            height: 28,
            padding: "0 10px",
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
          }}
        >
          {labels.settings}
        </Link>
      </div>
    </li>
  );
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px dashed var(--border-strong)",
        borderRadius: 14,
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 28,
          color: "var(--ink-muted)",
          margin: 0,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 14,
          color: "var(--ink-muted)",
          margin: "0 0 24px",
          maxWidth: 440,
          marginInline: "auto",
        }}
      >
        {body}
      </p>
      <Link
        href="/brands/new"
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 36,
          padding: "0 16px",
          background: "var(--ink)",
          color: "var(--bg)",
          border: "1px solid var(--ink)",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {cta}
      </Link>
    </div>
  );
}

function makeInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatToneSummary(toneAttributes: string[]): string | undefined {
  if (toneAttributes.length === 0) return undefined;
  return toneAttributes
    .slice(0, 3)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(" · ");
}
