import { getTranslations } from "next-intl/server";
import { DifferentiationSchema } from "@/lib/market-brain/derived-only";
import { coerceClientBrain } from "@/lib/client-brain/schema";
import { CompetitorsPanel } from "./competitors-panel";
import { RulesPanel, type BrandRuleRow } from "./rules-panel";
import { ClientBrainPanel } from "./client-brain-panel";

// The brand "analysis" surfaces — Client Brain (study the client's site),
// Market Brain (competitors + differentiation), Editorial Memory (brand rules).
// These live under Brand Settings, NOT the brand Connections page. Server
// component: fetches nothing itself (the settings page passes already-read,
// RLS-scoped data) but owns the i18n + section chrome. Market Brain + Editorial
// Memory stay beta-gated.
export async function BrandAnalysisSections({
  brandId,
  website,
  clientBrainFacts,
  betaAccess,
  competitors,
  differentiationParsed,
  brandRules,
}: {
  brandId: string;
  website: string | null;
  clientBrainFacts: ReturnType<typeof coerceClientBrain>;
  betaAccess: boolean;
  competitors: { id: string; url: string; domain: string; status: string }[];
  differentiationParsed: ReturnType<typeof DifferentiationSchema.safeParse> | null;
  brandRules: BrandRuleRow[];
}) {
  const t = await getTranslations("brandDetail");

  return (
    <>
      {/* Client Brain — study the client's site → ground generation (ungated) */}
      <h2 style={sectionHeading()}>{t("clientBrain.header")}</h2>
      <p style={sectionSub()}>{t("clientBrain.subtitle")}</p>
      <ClientBrainPanel brandId={brandId} website={website} facts={clientBrainFacts} />

      {/* Market Brain (gated by beta_access) */}
      {betaAccess && (
        <>
          <h2 style={sectionHeading()}>{t("marketBrain.header")}</h2>
          <p style={sectionSub()}>{t("marketBrain.subtitle")}</p>

          <h3 style={subHeadingStyle()}>{t("marketBrain.competitorsHeader")}</h3>
          <CompetitorsPanel brandId={brandId} competitors={competitors} />

          <h3 style={{ ...subHeadingStyle(), marginTop: 28 }}>
            {t("marketBrain.differentiationHeader")}
          </h3>
          <DifferentiationView
            parsed={differentiationParsed}
            labels={{
              empty: t("marketBrain.differentiationEmpty"),
              themes: t("marketBrain.themesLabel"),
              gaps: t("marketBrain.gapsLabel"),
              prevalence: t("marketBrain.prevalenceLabel"),
            }}
          />
        </>
      )}

      {/* Editorial Memory (gated by beta_access) */}
      {betaAccess && (
        <>
          <h2 style={sectionHeading()}>{t("editorialMemory.header")}</h2>
          <p style={sectionSub()}>{t("editorialMemory.subtitle")}</p>
          <RulesPanel brandId={brandId} rules={brandRules} />
        </>
      )}
    </>
  );
}

function sectionHeading(): React.CSSProperties {
  return {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--ink)",
    margin: "40px 0 4px",
    letterSpacing: "-0.01em",
  };
}

function sectionSub(): React.CSSProperties {
  return { fontSize: 13, color: "var(--ink-muted)", margin: "0 0 16px" };
}

function subHeadingStyle(): React.CSSProperties {
  return { fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: "0 0 12px" };
}

function cardLabelStyle(): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "var(--ink-faint)",
    margin: "0 0 8px",
  };
}

function DifferentiationView({
  parsed,
  labels,
}: {
  parsed: ReturnType<typeof DifferentiationSchema.safeParse> | null;
  labels: { empty: string; themes: string; gaps: string; prevalence: string };
}) {
  const data = parsed?.success ? parsed.data : null;
  const hasContent =
    data && (data.common_themes.length > 0 || data.positioning_gaps.length > 0);

  if (!hasContent) {
    return <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>{labels.empty}</p>;
  }

  return (
    <div
      style={{
        background: "var(--raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {data.common_themes.length > 0 && (
        <div>
          <p style={cardLabelStyle()}>{labels.themes}</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.common_themes.map((th, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  fontSize: 13,
                  color: "var(--ink)",
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {th.prevalence_count}× {labels.prevalence}
                </span>
                <span>{th.theme}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.positioning_gaps.length > 0 && (
        <div>
          <p style={cardLabelStyle()}>{labels.gaps}</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.positioning_gaps.map((gap, i) => (
              <li key={i} style={{ padding: "6px 0" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                  {gap.angle}
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "2px 0 0" }}>
                  {gap.rationale}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
