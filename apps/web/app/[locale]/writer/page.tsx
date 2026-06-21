import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrandFromRequest } from "@/lib/get-brand";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { getPostBody } from "@/lib/post-body";
import { isChannelId, type ChannelId } from "@/lib/kitchen/channel-formats";
import type {
  InitialGroup,
  VariantData,
} from "@/components/shell/kitchen-context";
import { WriterClient, type InitialPost } from "./writer-client";

// Row shape for an edited post. title/excerpt and the kitchen columns aren't in
// the generated types yet (T-types lag), so the query result is cast to this.
type EditPostRow = {
  id: string;
  brand_id: string;
  platform: string;
  language: string;
  status: string;
  content_text: string | null;
  content_markdown: string | null;
  title: string | null;
  excerpt: string | null;
  external_post_url: string | null;
  content_group_id: string | null;
  source_post_id: string | null;
  variant_state: string | null;
  generated_from_source_version: number | null;
};

const POST_COLS =
  "id, brand_id, platform, language, status, content_text, content_markdown, title, excerpt, external_post_url, content_group_id, source_post_id, variant_state, generated_from_source_version";

function postToInitial(p: EditPostRow): InitialPost {
  return {
    id: p.id,
    platform: p.platform,
    language: p.language,
    status: p.status,
    title: p.title ?? "",
    excerpt: p.excerpt ?? "",
    body: getPostBody(p),
    externalUrl: p.external_post_url,
  };
}

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function WriterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  // The kitchen columns (content_group_id/source_post_id/variant_state) aren't in
  // the generated types yet (T-types lag), so post reads that select them go
  // through an untyped client. RLS still applies; we lose only column typing.
  const db = supabase as unknown as SupabaseClient;

  // Edit mode: ?post=<id> loads an existing post (RLS scopes to the owner).
  // Fetch it BEFORE the brand guard so the active brand can be derived from the
  // post — the "Edit in writer" link carries only ?post=, no ?brand=. Without
  // this, getBrandFromRequest would redirect to /dashboard before edit mode runs.
  const editPostId = typeof params.post === "string" ? params.post : undefined;
  let rawPost: EditPostRow | null = null;
  if (editPostId) {
    const { data } = await db
      .from("posts")
      .select(POST_COLS)
      .eq("id", editPostId)
      .maybeSingle();
    rawPost = (data as unknown as EditPostRow | null) ?? null;
  }

  // The post's brand wins over any ?brand= in the URL (edit mode edits the post
  // in its own brand's voice). This is a synthetic param, not user input — it
  // lets the shared guard validate ownership of the post's brand and return it.
  const brandParams = rawPost ? { ...params, brand: rawPost.brand_id } : params;
  const { brand, userId } = await getBrandFromRequest(brandParams);

  const [
    { data: allBrands },
    { data: allConfigs },
    { data: allPosts },
    { data: account },
  ] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name, slug")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("brand_configs")
      .select(
        "brand_id, brand_voice, tone_attributes, forbidden_words, voc_pain_points, seo_keywords_primary",
      ),
    supabase.from("posts").select("brand_id"),
    supabase
      .from("accounts")
      .select("display_name, plan_tier, plan_status, trial_ends_at, beta_access")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const brandsList = allBrands ?? [];
  const configsList = allConfigs ?? [];
  const postsList = allPosts ?? [];
  // The social fan-out is beta-locked (server 403 + rail hides the rows). Resolve
  // it once so the kitchen seed below never lands a non-beta user on a social
  // variant's editor (opening a variant URL would otherwise render its center).
  const betaAccess = account?.beta_access ?? false;

  // Build the edit-mode view model. The active brand is the post's brand.
  // When the opened post belongs to a content group (the kitchen), reconstruct
  // the WHOLE chain: the writer's main editor is always the BLOG SOURCE, the rail
  // is hydrated with every existing variant, and the active channel is the one
  // that was opened (so opening a LinkedIn variant lands on its kitchen view, not
  // the blog editor). Legacy/standalone posts (no group) keep the single-post path.
  let initialPost: InitialPost | null = null;
  let editBrandId: string | null = null;
  let kitchenInitialGroup: InitialGroup | null = null;
  let topic: string | null = null;
  if (rawPost) {
    editBrandId = rawPost.brand_id;
    if (rawPost.content_group_id) {
      const [{ data: groupRows }, { data: groupRow }] = await Promise.all([
        db.from("posts").select(POST_COLS).eq("content_group_id", rawPost.content_group_id),
        db
          .from("content_groups")
          .select("source_version")
          .eq("id", rawPost.content_group_id)
          .maybeSingle(),
      ]);
      const rows = (groupRows as unknown as EditPostRow[] | null) ?? [];
      // Current source version — a variant generated from an older version is
      // stale (the source article changed since). Persisted variant_state never
      // stores 'stale' (the API computes freshness on the fly), so derive it here
      // so a reopened group shows the badge without a regenerate round-trip.
      const groupSourceVersion =
        (groupRow as { source_version: number } | null)?.source_version ?? null;
      // The source is the post with no source_post_id (the blog). Fallback to the
      // opened post if the source row isn't visible (shouldn't happen under RLS).
      const sourceRow = rows.find((r) => r.source_post_id === null) ?? rawPost;
      initialPost = postToInitial(sourceRow);
      topic = sourceRow.title ?? null;

      const variants: Partial<Record<ChannelId, VariantData>> = {};
      for (const r of rows) {
        if (r.id === sourceRow.id) continue;
        if (r.platform === "hosted" || !isChannelId(r.platform)) continue;
        const baseState = r.variant_state ?? "synced";
        // A published variant is already live (can't be un-published); everything
        // else generated from a superseded source version is stale.
        const isStale =
          baseState !== "published" &&
          groupSourceVersion !== null &&
          r.generated_from_source_version !== groupSourceVersion;
        variants[r.platform] = {
          postId: r.id,
          body: getPostBody(r),
          state: isStale ? "stale" : baseState,
          loading: false,
          error: null,
          externalUrl: r.external_post_url ?? null,
        };
      }
      const openedPlatform: ChannelId =
        rawPost.id === sourceRow.id || !isChannelId(rawPost.platform)
          ? "hosted"
          : rawPost.platform;
      kitchenInitialGroup = {
        source: {
          postId: sourceRow.id,
          brandId: sourceRow.brand_id,
          language: sourceRow.language,
        },
        baseBody: getPostBody(sourceRow),
        // Non-beta can't fan out — drop the seeded variants and pin the active
        // channel to the blog source so the center never renders a social
        // variant's edit/publish controls (which would 403 anyway).
        variants: betaAccess ? variants : {},
        active: betaAccess ? openedPlatform : "hosted",
      };
    } else {
      initialPost = postToInitial(rawPost);
      topic = rawPost.title ?? null;
    }
  }

  const postCounts: Record<string, number> = {};
  for (const p of postsList) {
    postCounts[p.brand_id] = (postCounts[p.brand_id] ?? 0) + 1;
  }

  const switcherBrands: BrandOption[] = brandsList.map((b) => {
    const cfg = configsList.find((c) => c.brand_id === b.id);
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      postCount: postCounts[b.id] ?? 0,
      toneSummary: formatToneSummary(cfg?.tone_attributes ?? []),
    };
  });

  // In edit mode the active brand is the post's brand (the writer edits that
  // post in its own brand's voice), not the request default.
  const activeBrand =
    editBrandId != null
      ? (brandsList.find((b) => b.id === editBrandId) ?? brand)
      : brand;
  const currentConfig = configsList.find((c) => c.brand_id === activeBrand.id);

  const accountDisplayName = account?.display_name ?? "";
  const userInitials = makeInitials(accountDisplayName);

  const t = await getTranslations("writer");

  return (
    <AppShell
      active="writer"
      brands={switcherBrands}
      currentBrandId={activeBrand.id}
      breadcrumb={
        topic
          ? `${t("breadcrumb")} · ${activeBrand.name} · ${topic}`
          : `${t("breadcrumb")} · ${activeBrand.name}`
      }
      userInitials={userInitials}
      newPostHref={null}
      planTier={account?.plan_tier ?? null}
      planStatus={account?.plan_status ?? null}
      trialEndsAt={account?.trial_ends_at ?? null}
      kitchenInitialGroup={kitchenInitialGroup}
    >
      <WriterClient
        key={editPostId ?? "new"}
        brandId={activeBrand.id}
        brandName={activeBrand.name}
        brandConfig={{
          brandVoice: currentConfig?.brand_voice ?? null,
          toneAttributes: currentConfig?.tone_attributes ?? [],
          forbiddenWords: currentConfig?.forbidden_words ?? [],
          seoKeywords: currentConfig?.seo_keywords_primary ?? [],
        }}
        initialPost={initialPost}
        hasGroup={kitchenInitialGroup !== null}
        betaAccess={betaAccess}
      />
    </AppShell>
  );
}

function formatToneSummary(toneAttributes: string[]): string | undefined {
  if (toneAttributes.length === 0) return undefined;
  return toneAttributes
    .slice(0, 3)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(" · ");
}

function makeInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
