import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlogShell } from "../shell";

type AdminListRow = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  updated_at: string;
  published_at: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function BlogAdminListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // is_blog_admin (migration-added) + blog_posts aren't in database.types.ts
  // yet → use an untyped client for the gate read and the list query.
  const db = supabase as unknown as SupabaseClient;

  // Layer 1 gate: owner-only via accounts.is_blog_admin.
  const { data: account } = await db
    .from("accounts")
    .select("is_blog_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!account?.is_blog_admin) notFound();

  // RLS surfaces the admin's drafts AND published posts (the "blog admins manage
  // posts" policy).
  const { data, error } = await db
    .from("blog_posts")
    .select("id, title, slug, status, updated_at, published_at")
    .eq("locale", "en")
    .order("updated_at", { ascending: false })
    .returns<AdminListRow[]>();
  if (error) throw error;
  const posts = data ?? [];

  return (
    <BlogShell>
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 96px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 22,
              fontWeight: 600,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Blog admin
          </h1>
          <Link
            href="/blog/admin/new"
            style={{
              height: 36,
              padding: "0 16px",
              background: "var(--ink)",
              color: "var(--bg)",
              border: "1px solid var(--ink)",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            New post
          </Link>
        </div>

        {posts.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-muted)" }}>
            No posts yet. Start with “New post”.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {posts.map((p) => (
              <li
                key={p.id}
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <Link
                  href={`/blog/admin/${p.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 4px",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.title || "(untitled)"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color:
                        p.status === "published"
                          ? "var(--pass)"
                          : "var(--ink-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {p.status}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                      flexShrink: 0,
                    }}
                  >
                    {fmt(p.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </BlogShell>
  );
}

function fmt(iso: string): string {
  try {
    return DATE_FMT.format(new Date(iso));
  } catch {
    return iso;
  }
}
