import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlogShell } from "../../shell";
import { NewPostForm } from "../_components/new-post-form";

export default async function NewBlogPostPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // is_blog_admin (migration-added) isn't in database.types.ts yet → untyped
  // client for the gate read.
  const db = supabase as unknown as SupabaseClient;

  // Layer 1 gate: owner-only via accounts.is_blog_admin.
  const { data: account } = await db
    .from("accounts")
    .select("is_blog_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!account?.is_blog_admin) notFound();

  return (
    <BlogShell>
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "40px 24px 96px" }}>
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

        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 20,
            fontWeight: 600,
            color: "var(--ink)",
            margin: "0 0 6px",
          }}
        >
          New post
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-muted)",
            lineHeight: 1.5,
            margin: "0 0 24px",
          }}
        >
          Start with a title — the slug is derived from it and locked once you
          publish. You’ll land in the editor next.
        </p>

        <NewPostForm />
      </section>
    </BlogShell>
  );
}
