import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { firewallChecklistView } from "@/lib/_private/blog-firewall";
import { BlogShell } from "../../shell";
import { BlogEditor, type BlogEditorInitial } from "../_components/blog-editor";

type PageProps = {
  params: Promise<{ id: string }>;
};

type EditRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: string | null;
  status: "draft" | "published";
  author_name: string | null;
  author_slug: string | null;
  cover_image_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
};

export default async function BlogAdminEditPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // is_blog_admin (migration-added) + blog_posts aren't in database.types.ts
  // yet → use an untyped client. RLS = layer 3.
  const db = supabase as unknown as SupabaseClient;

  // Layer 1 gate: owner-only via accounts.is_blog_admin.
  const { data: account } = await db
    .from("accounts")
    .select("is_blog_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!account?.is_blog_admin) notFound();

  const { data: row } = await db
    .from("blog_posts")
    .select(
      "id, slug, title, description, body, status, author_name, author_slug, cover_image_url, og_title, og_description, og_image_url",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<EditRow>();
  if (!row) notFound();

  const initial: BlogEditorInitial = {
    title: row.title ?? "",
    slug: row.slug,
    description: row.description ?? "",
    body: row.body ?? "",
    authorName: row.author_name ?? "",
    authorSlug: row.author_slug ?? "",
    coverImageUrl: row.cover_image_url ?? "",
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImageUrl: row.og_image_url ?? "",
  };

  // Firewall display data is computed server-side (this Server Component imports
  // the _private criteria module); the client editor receives it as a prop and
  // never imports _private.
  const firewallItems = firewallChecklistView();

  return (
    <BlogShell>
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 96px" }}>
        <Link
          href="/blog/admin"
          style={{
            fontSize: 13,
            color: "var(--ink-muted)",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 24,
          }}
        >
          ← All posts
        </Link>

        <BlogEditor
          postId={row.id}
          status={row.status}
          initial={initial}
          firewallItems={firewallItems}
        />
      </section>
    </BlogShell>
  );
}
