import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import { BrandDot } from "@/components/brand/brand-dot";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { brandColor } from "@/lib/brand-color";
import { PostEditor } from "./post-editor";
import { StatusBadge } from "../status-badge";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PostDetailPage({ params }: PageProps) {
  const { id: postId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("posts.detail");
  const locale = await getLocale();

  // RLS scopes to user's brands
  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, brand_id, platform, content_text, status, detection_score, external_post_url, created_at, published_at",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!post) notFound();

  const { data: brandsList } = await supabase
    .from("brands")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("name");
  const brands = brandsList ?? [];
  const brand = brands.find((b) => b.id === post.brand_id);

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at, beta_access")
    .eq("id", user.id)
    .maybeSingle();

  const switcherBrands: BrandOption[] = brands.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
  }));

  const color = brand ? brandColor(brand.slug) : "var(--ink-faint)";
  const dateStr = formatDateTime(post.published_at ?? post.created_at, locale);

  return (
    <AppShell
      active="posts"
      brands={switcherBrands}
      currentBrandId={post.brand_id}
      breadcrumb={brand?.name ?? t("breadcrumb")}
      userInitials={makeInitials(account?.display_name ?? user.email ?? "")}
      newPostHref={`/writer?brand=${post.brand_id}`}
      planTier={account?.plan_tier ?? null}
      planStatus={account?.plan_status ?? null}
      trialEndsAt={account?.trial_ends_at ?? null}
    >
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <Link
          href="/posts"
          style={{
            fontSize: 13,
            color: "var(--ink-muted)",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 20,
          }}
        >
          {t("backToList")}
        </Link>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <BrandDot color={color} size={10} />
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
            {brand?.name ?? "—"}
          </span>
          <StatusBadge status={post.status} label={t(`status.${post.status}`)} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-faint)",
            }}
          >
            {post.platform.toUpperCase()}
          </span>
          {post.detection_score !== null && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-faint)",
              }}
            >
              {t("score", { score: post.detection_score })}
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            margin: "0 0 24px",
          }}
        >
          {post.status === "published" ? t("publishedAt", { date: dateStr }) : t("createdAt", { date: dateStr })}
        </p>

        <PostEditor
          postId={post.id}
          brandId={post.brand_id}
          initialContent={post.content_text ?? ""}
          status={post.status}
          externalUrl={post.external_post_url}
          betaAccess={account?.beta_access === true}
        />
      </section>
    </AppShell>
  );
}

function makeInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateTime(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
