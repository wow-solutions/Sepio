import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/shell/top-bar";
import { BrandDot } from "@/components/brand/brand-dot";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { brandColor } from "@/lib/brand-color";
import { disconnectLinkedIn } from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkedin?: string; linkedin_error?: string; message?: string }>;
};

export default async function BrandDetailPage({ params, searchParams }: PageProps) {
  const { id: brandId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch brand (RLS-scoped)
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, slug, industry, primary_language")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) notFound();

  // Fetch all brands for TopBar
  const { data: brandsList } = await supabase
    .from("brands")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Fetch LinkedIn connection status
  const { data: linkedinToken } = await supabase
    .from("brand_oauth_tokens")
    .select("account_handle, scopes, connected_at, expires_at, status")
    .eq("brand_id", brandId)
    .eq("platform", "linkedin")
    .maybeSingle();

  const switcherBrands: BrandOption[] = (brandsList ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
  }));

  const color = brandColor(brand.slug);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <TopBar
        brands={switcherBrands}
        currentBrandId={brand.id}
        breadcrumbSection="Brand"
        breadcrumbCurrent={brand.name}
      />

      <section style={{ maxWidth: 880, margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <BrandDot color={color} size={14} />
          <h1
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              color: "var(--ink)",
              margin: 0,
            }}
          >
            {brand.name}
          </h1>
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: "0 0 32px",
          }}
        >
          {brand.industry ? `${brand.industry} · ` : ""}
          {brand.primary_language.toUpperCase()}
        </p>

        {/* Toasts */}
        {sp.linkedin === "connected" && (
          <Banner
            tone="success"
            title="LinkedIn подключён"
            body="Теперь ты можешь публиковать посты в свой LinkedIn из этого бренда."
          />
        )}
        {sp.linkedin_error && (
          <Banner
            tone="error"
            title={`Ошибка подключения LinkedIn (${sp.linkedin_error})`}
            body={sp.message ?? "Попробуй ещё раз. Если повторяется — проверь логи."}
          />
        )}

        {/* Connections section */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--ink)",
            margin: "0 0 16px",
            letterSpacing: "-0.01em",
          }}
        >
          Подключённые платформы
        </h2>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--ink)",
                  margin: "0 0 4px",
                }}
              >
                LinkedIn
              </h3>
              {linkedinToken ? (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-muted)",
                    margin: 0,
                  }}
                >
                  Подключён: <strong>{linkedinToken.account_handle}</strong>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                      marginLeft: 12,
                    }}
                  >
                    с {formatDate(linkedinToken.connected_at)}
                  </span>
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-muted)",
                    margin: 0,
                  }}
                >
                  Не подключён. Подключи свой личный LinkedIn чтобы публиковать посты.
                </p>
              )}
            </div>

            {linkedinToken ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href={`/api/auth/linkedin/request?brand_id=${brand.id}`}
                  style={buttonStyleSecondary()}
                >
                  Переподключить
                </Link>
                <form action={disconnectWithBrand.bind(null, brand.id)}>
                  <button type="submit" style={buttonStyleDanger()}>
                    Отключить
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href={`/api/auth/linkedin/request?brand_id=${brand.id}`}
                style={buttonStylePrimary()}
              >
                Подключить LinkedIn
              </Link>
            )}
          </div>
        </div>

        {/* Back link */}
        <div style={{ marginTop: 32 }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: 13,
              color: "var(--ink-muted)",
              textDecoration: "none",
            }}
          >
            ← Все бренды
          </Link>
        </div>
      </section>
    </div>
  );
}

// Server action wrapper to bind brandId (form action requires (formData) shape)
async function disconnectWithBrand(brandId: string): Promise<void> {
  "use server";
  await disconnectLinkedIn(brandId);
}

function Banner({ tone, title, body }: { tone: "success" | "error"; title: string; body: string }) {
  const colors =
    tone === "success"
      ? { bg: "var(--pass-bg)", border: "rgba(122,160,121,0.30)", fg: "var(--pass)" }
      : { bg: "rgba(200, 80, 80, 0.08)", border: "rgba(200,80,80,0.30)", fg: "rgb(180, 60, 60)" };
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 24,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: colors.fg,
        }}
      >
        {title}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 13,
          color: "var(--ink-muted)",
        }}
      >
        {body}
      </p>
    </div>
  );
}

function buttonStylePrimary(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 36,
    padding: "0 16px",
    background: "var(--ink)",
    color: "var(--bg)",
    border: "1px solid var(--ink)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  };
}

function buttonStyleSecondary(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 32,
    padding: "0 12px",
    background: "var(--raised)",
    color: "var(--ink)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  };
}

function buttonStyleDanger(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 32,
    padding: "0 12px",
    background: "transparent",
    color: "rgb(180, 60, 60)",
    border: "1px solid rgba(200,80,80,0.30)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
