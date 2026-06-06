"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { blockingFailures } from "@/lib/_private/blog-firewall";
import { authorSlugForAccount } from "@/lib/_private/author-accounts";
import {
  BLOG_BRAND_ID,
  parseBlogArticleOutput,
} from "@/lib/_private/blog-article";
import { getAuthor } from "@/lib/authors";
import { generateBlogArticle, ClaudeError, type BrandConfigRow } from "@/lib/claude";
import { researchBlogKeywords } from "@/lib/_private/blog-keyword-research";
import type { KeywordIdea } from "@/lib/_private/dataforseo-keywords";

// blog_posts isn't in database.types.ts yet (types weren't regenerated after
// PR1 — fast-follow). The typed client narrows .from() to the known-table union
// and rejects "blog_posts", so cast to an untyped client for blog writes only.
async function blogClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Auth gate shared by every blog write (defense-in-depth layer 2). Re-checks
// is_blog_admin server-side: page-level notFound() is layer 1, RLS is layer 3,
// but a non-admin could call the Server Action directly, so we repeat the gate.
async function requireBlogAdmin(
  supabase: SupabaseClient,
): Promise<{ userId: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: account } = await supabase
    .from("accounts")
    .select("is_blog_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!account?.is_blog_admin) return { error: "Forbidden" };
  return { userId: user.id };
}

// "Hello World" -> "hello-world". Used on create; slug is immutable after the
// first publish (recon C: v1 = immutable, not redirect).
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const SLUG_RE = /^[a-z0-9-]+$/;

// ── createDraft ───────────────────────────────────────────────────────────
const CreateDraftSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

export async function createDraft(input: {
  title: string;
}): Promise<CreateResult> {
  const parsed = CreateDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { title } = parsed.data;

  const supabase = await blogClient();
  const gate = await requireBlogAdmin(supabase);
  if ("error" in gate) return { ok: false, error: gate.error };

  const slug = slugify(title);
  if (!slug) return { ok: false, error: "Title must contain letters or numbers" };

  // Author defaults to the signed-in admin. If they're a registered blog author
  // (lib/authors.ts), use that canonical identity so the published post links to
  // /authors/{slug}; otherwise fall back to their app display_name. The author
  // fields stay editable in the editor either way.
  let authorName: string | null;
  let authorSlug: string | null;
  const registrySlug = authorSlugForAccount(gate.userId);
  const registryAuthor = registrySlug ? getAuthor(registrySlug) : null;
  if (registryAuthor) {
    authorName = registryAuthor.name;
    authorSlug = registryAuthor.slug;
  } else {
    const { data: account } = await supabase
      .from("accounts")
      .select("display_name")
      .eq("id", gate.userId)
      .maybeSingle();
    authorName = (account?.display_name as string | null) ?? null;
    authorSlug = authorName ? slugify(authorName) : null;
  }

  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      slug,
      locale: "en",
      title,
      status: "draft",
      author_id: gate.userId,
      author_name: authorName,
      author_slug: authorSlug,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Could not create draft" };

  revalidatePath("/blog/admin");
  return { ok: true, id: data.id as string };
}

// ── updatePost ────────────────────────────────────────────────────────────
const emptyToNull = (v: string) => {
  const t = v.trim();
  return t === "" ? null : t;
};

const UpdatePostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(300),
  body: z.string(), // may be empty for a draft
  authorName: z.string().trim().max(120),
  authorSlug: z
    .string()
    .trim()
    .max(120)
    .refine((s) => s === "" || SLUG_RE.test(s), "Author slug: lowercase, digits, hyphens"),
  coverImageUrl: z.string().trim().max(2000),
  ogTitle: z.string().trim().max(200),
  ogDescription: z.string().trim().max(300),
  ogImageUrl: z.string().trim().max(2000),
  intent: z.enum(["save", "publish", "unpublish"]),
  materiallyUpdated: z.boolean(),
  firewallAck: z.record(z.string(), z.boolean()),
});

export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;

export async function updatePost(input: UpdatePostInput): Promise<ActionResult> {
  const parsed = UpdatePostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await blogClient();
  const gate = await requireBlogAdmin(supabase);
  if ("error" in gate) return { ok: false, error: gate.error };

  // Load existing row to enforce status transitions + slug immutability.
  const { data: row, error: loadErr } = await supabase
    .from("blog_posts")
    .select("status, published_at, slug")
    .eq("id", data.id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!row) return { ok: false, error: "Not found" };

  const currentStatus = row.status as "draft" | "published";
  const currentPublishedAt = row.published_at as string | null;
  const slug = row.slug as string;
  const now = new Date().toISOString();

  // Content fields write on every save. NEVER slug (immutable post-create here)
  // and NEVER updated_at (the blog_posts_set_updated_at trigger owns it).
  const patch: Record<string, unknown> = {
    title: data.title,
    description: emptyToNull(data.description),
    body: data.body, // raw markdown; empty allowed for draft
    author_name: emptyToNull(data.authorName),
    author_slug: emptyToNull(data.authorSlug),
    cover_image_url: emptyToNull(data.coverImageUrl),
    og_title: emptyToNull(data.ogTitle),
    og_description: emptyToNull(data.ogDescription),
    og_image_url: emptyToNull(data.ogImageUrl),
  };

  const requireFirewall = () => {
    if (!data.body.trim()) {
      return "Body is required to publish";
    }
    const failures = blockingFailures(data.firewallAck);
    if (failures.length > 0) {
      return "Resolve the firewall checklist before publishing";
    }
    return null;
  };

  let revalidatePublic = false;

  if (data.intent === "publish") {
    if (currentStatus === "published") {
      return { ok: false, error: "Already published" };
    }
    const fw = requireFirewall();
    if (fw) return { ok: false, error: fw };
    patch.status = "published";
    if (currentPublishedAt === null) patch.published_at = now;
    patch.firewall_ack_by = gate.userId;
    patch.firewall_ack_at = now;
    revalidatePublic = true;
  } else if (data.intent === "unpublish") {
    if (currentStatus !== "published") {
      return { ok: false, error: "Post is not published" };
    }
    patch.status = "draft"; // preserve published_at — re-publish keeps original date
    revalidatePublic = true;
  } else {
    // intent === "save"
    if (currentStatus === "published" && data.materiallyUpdated) {
      const fw = requireFirewall();
      if (fw) return { ok: false, error: fw };
      patch.material_updated_at = now;
      patch.firewall_ack_by = gate.userId;
      patch.firewall_ack_at = now;
    }
    // A content edit on an already-published post still changes the live page.
    if (currentStatus === "published") revalidatePublic = true;
  }

  const { error } = await supabase
    .from("blog_posts")
    .update(patch)
    .eq("id", data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/blog/admin");
  if (revalidatePublic) {
    revalidatePath("/blog");
    revalidatePath(`/blog/${slug}`);
  }
  return { ok: true };
}

// ── deletePost (draft-only) ───────────────────────────────────────────────
export async function deleteBlogPost(input: {
  id: string;
}): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { ok: false, error: "Invalid id" };

  const supabase = await blogClient();
  const gate = await requireBlogAdmin(supabase);
  if ("error" in gate) return { ok: false, error: gate.error };

  // Block deleting a published post (it has a live public URL).
  const { data: row } = await supabase
    .from("blog_posts")
    .select("status")
    .eq("id", id.data)
    .maybeSingle();
  if (!row) return { ok: false, error: "Not found" };
  if (row.status === "published") {
    return { ok: false, error: "Unpublish before deleting" };
  }

  const { error } = await supabase.from("blog_posts").delete().eq("id", id.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/blog/admin");
  return { ok: true };
}

// ── uploadBlogImage ───────────────────────────────────────────────────────
// Upload a cover/OG/inline image to the public `blog-images` bucket and return
// its public URL. The bucket has no client write policy (default-deny), so the
// write goes through the service-role client — gated by is_blog_admin first.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // mirrors the bucket's file_size_limit
const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadBlogImage(
  formData: FormData,
): Promise<UploadResult> {
  const supabase = await blogClient();
  const gate = await requireBlogAdmin(supabase);
  if ("error" in gate) return { ok: false, error: gate.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  if (file.size === 0) return { ok: false, error: "Empty file" };
  if (file.size > MAX_IMAGE_BYTES)
    return { ok: false, error: "Image is larger than 5 MB" };
  const ext = IMAGE_EXT[file.type];
  if (!ext)
    return { ok: false, error: "Only PNG, JPEG, WebP, or GIF images" };

  const service = createServiceRoleClient();
  const path = `${gate.userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await service.storage
    .from("blog-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data } = service.storage.from("blog-images").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

// ── generateBlogDraft ─────────────────────────────────────────────────────
// Generate a full article draft (Markdown) from a brief. The brief may be in
// any language (e.g. Russian); the article is always English. Reuses the shared
// `blog` generation format + the founder brand voice (WOW SOLUTIONS). The result
// is a DRAFT the admin edits and runs through the firewall before publishing —
// no Pangram, no auto-save.
const GenerateDraftSchema = z.object({
  brief: z.string().trim().min(20, "Brief is too short").max(4000),
});

export type GenerateDraftResult =
  | {
      ok: true;
      markdown: string;
      description: string | null;
      // Real-search-demand keywords the article was targeted at (blog-DataForSEO).
      // Empty + degraded=true when keyword research was unavailable — generation
      // still succeeds, just without SEO targeting.
      keywordsUsed: KeywordIdea[];
      degraded: boolean;
    }
  | { ok: false; error: string };

export async function generateBlogDraft(input: {
  brief: string;
}): Promise<GenerateDraftResult> {
  const parsed = GenerateDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid brief" };
  }

  const supabase = await blogClient();
  const gate = await requireBlogAdmin(supabase);
  if ("error" in gate) return { ok: false, error: gate.error };

  // brand_configs is owner-scoped by RLS; read the blog's voice config via
  // service-role so generation is independent of which admin is signed in.
  const service = createServiceRoleClient();
  const { data: cfg, error: cfgErr } = await service
    .from("brand_configs")
    .select("*")
    .eq("brand_id", BLOG_BRAND_ID)
    .maybeSingle();
  if (cfgErr) return { ok: false, error: cfgErr.message };
  if (!cfg) return { ok: false, error: "Blog brand voice config not found" };

  // Research real search demand for the brief's topic, then target the article
  // at it. Never blocks generation — researchBlogKeywords degrades to [] on any
  // failure (missing seeds, DataForSEO down) and we generate untargeted.
  const research = await researchBlogKeywords(parsed.data.brief, {
    cacheClient: service,
  });

  try {
    const result = await generateBlogArticle(cfg as BrandConfigRow, parsed.data.brief, {
      keywords: research.keywords,
    });
    const { body, description } = parseBlogArticleOutput(result.text);
    return {
      ok: true,
      markdown: body,
      description,
      keywordsUsed: research.keywords,
      degraded: research.degraded,
    };
  } catch (e) {
    const msg = e instanceof ClaudeError ? e.message : "Generation failed";
    return { ok: false, error: msg };
  }
}
