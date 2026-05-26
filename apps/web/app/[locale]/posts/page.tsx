import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { BrandDot } from "@/components/brand/brand-dot";
import { brandColor } from "@/lib/brand-color";
import { PostsList, type PostRow } from "./posts-list";

type PageProps = {
  searchParams: Promise<{ status?: string; brand?: string }>;
};

const STATUS_OPTIONS = ["all", "draft", "pending_approval", "published"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

export default async function PostsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const statusFilter: StatusFilter = STATUS_OPTIONS.includes(sp.status as StatusFilter)
    ? (sp.status as StatusFilter)
    : "all";
  const brandFilter = sp.brand ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("posts");
  const locale = await getLocale();

  const { data: brandsList } = await supabase
    .from("brands")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("name");

  const brands = brandsList ?? [];
  const brandById = new Map(brands.map((b) => [b.id, b]));

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  let q = supabase
    .from("posts")
    .select(
      "id, brand_id, platform, content_text, status, detection_score, external_post_url, created_at, published_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }
  if (brandFilter) {
    q = q.eq("brand_id", brandFilter);
  }
  const { data: posts } = await q;
  const list = posts ?? [];

  const enriched: PostRow[] = list.map((p) => {
    const brand = brandById.get(p.brand_id);
    return {
      id: p.id,
      brandId: p.brand_id,
      brandName: brand?.name ?? "—",
      brandSlug: brand?.slug ?? null,
      platform: p.platform,
      contentText: p.content_text,
      status: p.status,
      detectionScore: p.detection_score,
      externalPostUrl: p.external_post_url,
      createdAt: p.created_at,
      publishedAt: p.published_at,
    };
  });

  const switcherBrands: BrandOption[] = brands.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
  }));

  return (
    <AppShell
      active="posts"
      brands={switcherBrands}
      currentBrandId={brandFilter}
      breadcrumb={t("breadcrumb")}
      userInitials={makeInitials(account?.display_name ?? user.email ?? "")}
      newPostHref={brandFilter ? `/writer?brand=${brandFilter}` : null}
      planTier={account?.plan_tier ?? null}
      planStatus={account?.plan_status ?? null}
      trialEndsAt={account?.trial_ends_at ?? null}
    >
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-fraunces), Georgia, serif",
                fontVariationSettings: '"opsz" 96',
                fontSize: 36,
                fontWeight: 500,
                letterSpacing: "-0.026em",
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.02,
              }}
            >
              {t("title")}
            </h1>
            <p
              style={{
                marginTop: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ink-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {t("subtitle", { count: list.length })}
            </p>
          </div>
        </div>

        {/* Brand filter chips — only when there's more than one brand */}
        {brands.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <BrandChip
              label={t("brandAll")}
              active={!brandFilter}
              href={
                statusFilter === "all"
                  ? "/posts"
                  : `/posts?status=${statusFilter}`
              }
            />
            {brands.map((b) => (
              <BrandChip
                key={b.id}
                label={b.name}
                color={brandColor(b.slug)}
                active={brandFilter === b.id}
                href={
                  statusFilter === "all"
                    ? `/posts?brand=${b.id}`
                    : `/posts?status=${statusFilter}&brand=${b.id}`
                }
              />
            ))}
          </div>
        )}

        {/* Status filter chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {STATUS_OPTIONS.map((s) => {
            const active = s === statusFilter;
            const href =
              s === "all"
                ? brandFilter
                  ? `/posts?brand=${brandFilter}`
                  : "/posts"
                : brandFilter
                  ? `/posts?status=${s}&brand=${brandFilter}`
                  : `/posts?status=${s}`;
            return (
              <Link
                key={s}
                href={href}
                style={{
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 14,
                  border: "1px solid var(--border-subtle)",
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--bg)" : "var(--ink-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                }}
              >
                {t(`filter.${s}`)}
              </Link>
            );
          })}
        </div>

        {list.length === 0 ? (
          <EmptyState title={t("empty.title")} body={t("empty.body")} cta={t("empty.cta")} />
        ) : (
          <PostsList posts={enriched} locale={locale} />
        )}
      </section>
    </AppShell>
  );
}

function BrandChip({
  label,
  href,
  active,
  color,
}: {
  label: string;
  href: string;
  active: boolean;
  color?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 14,
        border: `1px solid ${active ? "var(--brand)" : "var(--border-subtle)"}`,
        background: active ? "rgba(176,123,80,0.12)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-muted)",
        fontSize: 12,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        textDecoration: "none",
      }}
    >
      {color && <BrandDot color={color} size={7} />}
      {label}
    </Link>
  );
}

function makeInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px dashed var(--border-strong)",
        borderRadius: 12,
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 24,
          color: "var(--ink-muted)",
          margin: 0,
          marginBottom: 6,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </p>
      <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 20px", maxWidth: 420, marginInline: "auto" }}>
        {body}
      </p>
      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 32,
          padding: "0 14px",
          background: "var(--ink)",
          color: "var(--bg)",
          border: "1px solid var(--ink)",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          textDecoration: "none",
        }}
      >
        {cta}
      </Link>
    </div>
  );
}
