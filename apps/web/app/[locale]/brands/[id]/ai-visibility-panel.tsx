import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AiVisibilityMeasureButton } from "./ai-visibility-measure-button";

// ai_visibility_runs / ai_visibility_answers are not yet in database.types.ts
// (types weren't regenerated after the F1 slice-3 migration). The typed client
// narrows .from() to the known-table union and rejects these shapes, so we cast
// to an untyped client for these queries only — surgical, mirrors the
// precedent in lib/brand-blog.ts.
// TODO: regen database.types.ts (ai_visibility_runs, ai_visibility_answers).
async function aiVisibilityClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

type RunStatus = "running" | "complete" | "failed";
type AnswerStatus = "ok" | "failed" | "pending";
type MentionKind = "cited" | "named" | "none";

type RunRow = {
  id: string;
  status: RunStatus;
  degraded: boolean;
  engines: string[];
  questions_total: number;
  mentioned_count: number;
  cost_usd: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

type AnswerRow = {
  question_id: string;
  question: string;
  engine: string;
  status: AnswerStatus;
  mention_kind: MentionKind;
  citation_domains: string[];
};

// Fixed display order — matches lib/_private/ai-visibility/types.ts AI_ENGINES,
// duplicated here (display labels only) to keep this file out of the _private
// import graph.
const ENGINE_ORDER = ["chat_gpt", "claude", "gemini", "perplexity"] as const;
const ENGINE_LABEL: Record<string, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

type Report = {
  verdictAbsent: number; // X — answered questions with no mention on any engine
  verdictTotal: number; // Y — questions with >=1 ok answer
  perEngine: { engine: string; mentioned: number; completed: number }[];
  uncoveredQuestions: string[]; // top 5 question texts, X-set
  competitorDomains: { domain: string; count: number }[]; // top 5, client excluded
};

// Read-only report section for the F1 measure loop — same shape as Market
// Brain's DifferentiationView (card + labeled lists, no charts). Beta-gated by
// the caller (brand-analysis-sections.tsx), same as Market Brain / Editorial
// Memory.
export async function AiVisibilityPanel({
  brandId,
  website,
}: {
  brandId: string;
  website: string | null;
}) {
  const t = await getTranslations("brandDetail.aiVisibility");
  const locale = await getLocale();
  const supabase = await aiVisibilityClient();

  // Last 2 concluded runs (complete or failed) — "running" is deliberately
  // excluded here; the measure button surfaces alreadyRunning itself.
  const { data: runRows } = await supabase
    .from("ai_visibility_runs")
    .select(
      "id, status, degraded, engines, questions_total, mentioned_count, cost_usd, started_at, finished_at, error",
    )
    .eq("brand_id", brandId)
    .in("status", ["complete", "failed"])
    .order("started_at", { ascending: false })
    .limit(2)
    .returns<RunRow[]>();

  const runs = runRows ?? [];
  const latest = runs[0] ?? null;
  const latestComplete = runs.find((r) => r.status === "complete") ?? null;
  const previousComplete =
    runs.find((r) => r.status === "complete" && r.id !== latestComplete?.id) ?? null;

  let answers: AnswerRow[] = [];
  if (latestComplete) {
    const { data: answerRows } = await supabase
      .from("ai_visibility_answers")
      .select("question_id, question, engine, status, mention_kind, citation_domains")
      .eq("run_id", latestComplete.id)
      .returns<AnswerRow[]>();
    answers = answerRows ?? [];
  }

  const report = latestComplete ? buildReport(answers, website) : null;

  return (
    <div
      style={{
        background: "var(--raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: 22,
      }}
    >
      {!latest && (
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 16px" }}>{t("empty")}</p>
      )}

      {latest?.status === "failed" && (
        <Note tone="error">
          {t("lastFailed", {
            date: formatDate(latest.started_at, locale),
            error: latest.error ?? "",
          })}
        </Note>
      )}

      {report && latestComplete && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>
              {t("verdict", { absent: report.verdictAbsent, total: report.verdictTotal })}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0 }}>
              {t("measuredAt", { date: formatDate(latestComplete.started_at, locale) })} ·{" "}
              {t("costLabel", { cost: Number(latestComplete.cost_usd).toFixed(2) })}
            </p>
            {previousComplete && (
              <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "4px 0 0" }}>
                {t("delta", {
                  prevMentioned: previousComplete.mentioned_count,
                  prevTotal: previousComplete.questions_total,
                  mentioned: latestComplete.mentioned_count,
                  total: latestComplete.questions_total,
                })}
              </p>
            )}
          </div>

          {report.perEngine.length > 0 && (
            <div>
              <p style={cardLabelStyle()}>{t("engineHeader")}</p>
              {latestComplete.degraded && (
                <p style={{ fontSize: 12, color: "var(--risky)", margin: "0 0 8px" }}>
                  {t("degradedTag")}
                </p>
              )}
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {report.perEngine.map((e) => (
                  <li key={e.engine} style={rowStyle()}>
                    <span style={{ fontSize: 13, color: "var(--ink)" }}>
                      {ENGINE_LABEL[e.engine] ?? e.engine}
                    </span>
                    <span style={monoStyle()}>
                      {e.mentioned}/{e.completed}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.uncoveredQuestions.length > 0 && (
            <div>
              <p style={cardLabelStyle()}>{t("gapsHeader")}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {report.uncoveredQuestions.map((q, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      padding: "6px 0",
                      borderBottom:
                        i < report.uncoveredQuestions.length - 1
                          ? "1px solid var(--border-subtle)"
                          : "none",
                    }}
                  >
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.competitorDomains.length > 0 && (
            <div>
              <p style={cardLabelStyle()}>{t("competitorsHeader")}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {report.competitorDomains.map((d) => (
                  <li key={d.domain} style={rowStyle()}>
                    <span style={monoStyle()}>{d.domain}</span>
                    <span style={monoStyle()}>{d.count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <AiVisibilityMeasureButton brandId={brandId} />
    </div>
  );
}

// Derives the display report from one complete run's answers. Pure — no
// translation/formatting concerns, so it stays easy to reason about (and test)
// independent of i18n.
function buildReport(answers: AnswerRow[], website: string | null): Report {
  const clientHost = toHost(website);

  const byQuestion = new Map<string, { question: string; ok: { mention: MentionKind }[] }>();
  for (const a of answers) {
    if (a.status !== "ok") continue;
    const entry = byQuestion.get(a.question_id) ?? { question: a.question, ok: [] };
    entry.ok.push({ mention: a.mention_kind });
    byQuestion.set(a.question_id, entry);
  }

  let verdictTotal = 0;
  let verdictAbsent = 0;
  const uncoveredQuestions: string[] = [];
  for (const { question, ok } of byQuestion.values()) {
    if (ok.length === 0) continue;
    verdictTotal++;
    const mentioned = ok.some((o) => o.mention !== "none");
    if (!mentioned) {
      verdictAbsent++;
      if (uncoveredQuestions.length < 5) uncoveredQuestions.push(question);
    }
  }

  const perEngine = ENGINE_ORDER.filter((e) => answers.some((a) => a.engine === e)).map(
    (engine) => {
      const okForEngine = answers.filter((a) => a.engine === engine && a.status === "ok");
      const mentioned = okForEngine.filter((a) => a.mention_kind !== "none").length;
      return { engine, mentioned, completed: okForEngine.length };
    },
  );

  const domainCounts = new Map<string, number>();
  for (const a of answers) {
    if (a.status !== "ok") continue;
    for (const d of a.citation_domains) {
      if (clientHost && (d === clientHost || d.endsWith(`.${clientHost}`))) continue;
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }
  const competitorDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  return { verdictAbsent, verdictTotal, perEngine, uncoveredQuestions, competitorDomains };
}

// Normalize a url or bare domain to its lowercase host, www. stripped — same
// rule as lib/_private/ai-visibility/mention-detector.ts's toHost, duplicated
// (display-only, no detection logic) to keep this file out of _private.
function toHost(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
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

function rowStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 0",
    fontSize: 13,
  };
}

function monoStyle(): React.CSSProperties {
  return { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)" };
}

function Note({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  const isErr = tone === "error";
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "8px 10px",
        borderRadius: 6,
        background: isErr ? "var(--risky-bg)" : "var(--pass-bg)",
        color: isErr ? "var(--risky)" : "var(--pass)",
        border: `1px solid ${isErr ? "rgba(194,104,90,0.20)" : "rgba(122,160,121,0.30)"}`,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}
