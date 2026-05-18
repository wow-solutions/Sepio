import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/shell/top-bar";
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
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <TopBar
        brands={switcherBrands}
        currentBrandId={null}
        breadcrumbSection="Brands"
        userInitials={userInitials}
      />

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
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.022em",
                color: "var(--ink)",
                margin: 0,
              }}
            >
              Your brands
            </h1>
            <p
              style={{
                marginTop: 8,
                fontSize: 14,
                color: "var(--ink-muted)",
              }}
            >
              {account?.display_name ?? user.email}
              {" · "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {account?.plan_tier ?? "trial"}
              </span>
              {" · "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-faint)",
                }}
              >
                {list.length} brand{list.length === 1 ? "" : "s"}
              </span>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <form action={signout}>
              <button
                type="submit"
                style={{
                  height: 32,
                  padding: "0 12px",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: 6,
                  color: "var(--ink-muted)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </form>
            <Link
              href="/brands/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 32,
                padding: "0 14px",
                background: "var(--ink)",
                color: "var(--bg)",
                border: "1px solid var(--ink)",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              + Add brand
            </Link>
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState />
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
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BrandCard({
  brand,
  isNew,
}: {
  brand: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    primary_language: string;
  };
  isNew: boolean;
}) {
  const color = brandColor(brand.slug);
  return (
    <li
      style={{
        position: "relative",
        background: "var(--surface)",
        border: `1px solid ${isNew ? "var(--pass)" : "var(--border-subtle)"}`,
        borderRadius: 10,
        padding: 20,
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
              fontSize: 15,
              fontWeight: 600,
              color: "var(--ink)",
              margin: 0,
              letterSpacing: "-0.01em",
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
            New
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
          gap: 8,
          alignItems: "center",
          paddingTop: 14,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <Link
          href={`/writer?brand=${brand.id}`}
          style={{
            height: 28,
            padding: "0 10px",
            background: "var(--raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Writer →
        </Link>
        <span
          title="Posts list — Sprint 1A next"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "not-allowed",
          }}
        >
          Posts · soon
        </span>
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
          Connections →
        </Link>
      </div>
    </li>
  );
}

function EmptyState() {
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
        No brands yet.
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
        The brand wizard collects voice, tone, customer language and SEO topics.
        Takes about 3 minutes.
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
        Create your first brand
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
