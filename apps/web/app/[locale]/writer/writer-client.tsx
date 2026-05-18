"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { PangramResponse } from "@/lib/pangram";
import { DetectionGauge } from "@/components/detection/detection-gauge";
import { scoreBucket, bucketCssVar } from "@/lib/detection";
import { saveDraft } from "./actions";

type GenerateResponse = {
  post_id: string;
  content: string;
  detection_score: number;
  detection_breakdown: PangramResponse;
  status: "draft" | "pending_approval";
  cache_read_tokens: number;
};

type Stage =
  | "idle"
  | "generating"
  | "detecting"
  | "ready"
  | "saving"
  | "saved"
  | "publishing"
  | "published"
  | "error";

const LINKEDIN_MAX = 3000;

type Props = {
  brandId: string;
  brandName: string;
  brandConfig: {
    brandVoice: string | null;
    toneAttributes: string[];
    forbiddenWords: string[];
    seoKeywords: string[];
  };
};

export function WriterClient({ brandId, brandName, brandConfig }: Props) {
  const t = useTranslations("writer");
  const [mode, setMode] = useState<"topic" | "article">("topic");
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<PangramResponse | null>(null);
  const [status, setStatus] = useState<"draft" | "pending_approval" | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [brandContextOpen, setBrandContextOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const voiceShort = shortenVoice(brandConfig.brandVoice);
  const toneTop = truncateList(brandConfig.toneAttributes, 4);
  const avoidTop = truncateList(brandConfig.forbiddenWords, 4);
  const topicsTop = truncateList(brandConfig.seoKeywords, 4);
  const hasBrandContext =
    voiceShort.short !== "—" ||
    toneTop.shown.length > 0 ||
    avoidTop.shown.length > 0 ||
    topicsTop.shown.length > 0;

  const charCount = content.length;
  const overLimit = charCount > LINKEDIN_MAX;
  const busy =
    stage === "generating" ||
    stage === "detecting" ||
    stage === "saving" ||
    stage === "publishing";
  const dirty = postId !== null && content !== originalContent;

  async function onGenerate() {
    setError(null);
    setStage("generating");
    setPostId(null);
    setScore(null);
    setBreakdown(null);
    setStatus(null);

    const payload: { brand_id: string; topic_hint?: string; source_text?: string } = {
      brand_id: brandId,
    };
    if (mode === "article") {
      const src = sourceText.trim();
      if (src.length < 50) {
        setError(t("articleTooShort"));
        setStage("error");
        return;
      }
      payload.source_text = src;
    } else {
      payload.topic_hint = topic.trim() || undefined;
    }

    let res: Response;
    try {
      res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("networkError"));
      setStage("error");
      return;
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: unknown; stage?: unknown }
        | null;
      const errText =
        data && typeof data.error === "string" && data.error
          ? data.error
          : `HTTP ${res.status}`;
      const note =
        data && typeof data.stage === "string" ? ` (${data.stage})` : "";
      setError(`${errText}${note}`);
      setStage("error");
      return;
    }

    setStage("detecting");
    const data = (await res.json()) as GenerateResponse;
    setContent(data.content);
    setOriginalContent(data.content);
    setPostId(data.post_id);
    setScore(data.detection_score);
    setBreakdown(data.detection_breakdown);
    setStatus(data.status);
    setStage("ready");
    if (!title) {
      const firstLine = data.content.split("\n").find((l) => l.trim()) ?? "";
      setTitle(firstLine.slice(0, 80));
    }
  }

  function onSave() {
    if (!postId) return;
    setError(null);
    setStage("saving");
    startTransition(async () => {
      const result = await saveDraft(postId, content);
      if (!result.ok) {
        setError(result.error);
        setStage("error");
        return;
      }
      setOriginalContent(content);
      setStage("saved");
    });
  }

  async function onPublish() {
    if (!postId) return;
    setError(null);
    // Save first if dirty — publish what's on screen, not what's in DB.
    if (dirty) {
      setStage("saving");
      const saveResult = await saveDraft(postId, content);
      if (!saveResult.ok) {
        setError(saveResult.error);
        setStage("error");
        return;
      }
      setOriginalContent(content);
    }

    setStage("publishing");
    let res: Response;
    try {
      res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("networkError"));
      setStage("error");
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; url?: string; error?: string; needsReconnect?: boolean }
      | null;

    if (!res.ok || !data?.success) {
      const msg = data?.error ?? `HTTP ${res.status}`;
      const reconnectNote = data?.needsReconnect ? ` · ${t("publishReconnect")}` : "";
      setError(`${msg}${reconnectNote}`);
      setStage("error");
      return;
    }

    setPublishedUrl(data.url ?? null);
    setStage("published");
  }

  const generateLabel =
    stage === "generating"
      ? t("generating")
      : stage === "detecting"
        ? t("checkingDetection")
        : postId
          ? t("regenerate")
          : t("generate");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "var(--writer-left-w) 1fr var(--writer-right-w)",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* LEFT — prompt panel */}
      <aside
        style={{
          borderRight: "1px solid var(--border-subtle)",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <CollapsibleSection
          title={t("brandContext")}
          open={brandContextOpen}
          onToggle={() => setBrandContextOpen((v) => !v)}
          summary={
            hasBrandContext
              ? voiceShort.short !== "—"
                ? voiceShort.short
                : toneTop.shown.join(" · ")
              : t("noBrandContext")
          }
        >
          <BrandSummaryRow
            label={t("rowVoice")}
            value={voiceShort.short}
            title={voiceShort.full ?? undefined}
          />
          {toneTop.shown.length > 0 && (
            <BrandSummaryRow
              label={t("rowTone")}
              value={formatList(toneTop, t("moreSuffix"))}
              title={brandConfig.toneAttributes.join(" · ")}
            />
          )}
          {avoidTop.shown.length > 0 && (
            <BrandSummaryRow
              label={t("rowAvoid")}
              value={formatList(avoidTop, t("moreSuffix"))}
              title={brandConfig.forbiddenWords.join(" · ")}
            />
          )}
          {topicsTop.shown.length > 0 && (
            <BrandSummaryRow
              label={t("rowTopics")}
              value={formatList(topicsTop, t("moreSuffix"))}
              valueColor="var(--info)"
              title={brandConfig.seoKeywords.join(" · ")}
            />
          )}
        </CollapsibleSection>

        <Section
          title={t("prompt")}
          right={
            <span style={mono(11, "var(--ink-faint)")}>
              {mode === "article"
                ? `${sourceText.length} / 30000`
                : `${topic.length} / 1000`}
            </span>
          }
        >
          {/* Mode toggle */}
          <div
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "1fr",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 6,
              padding: 2,
              marginBottom: 10,
            }}
          >
            {(["topic", "article"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={busy}
                  style={{
                    height: 26,
                    background: active ? "var(--raised)" : "transparent",
                    border: 0,
                    color: active ? "var(--ink)" : "var(--ink-muted)",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 4,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {t(m === "topic" ? "modeTopic" : "modeArticle")}
                </button>
              );
            })}
          </div>

          {mode === "article" ? (
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value.slice(0, 30000))}
              disabled={busy}
              rows={10}
              placeholder={t("articlePlaceholder")}
              style={inputBase(true)}
            />
          ) : (
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 1000))}
              disabled={busy}
              rows={5}
              placeholder={t("topicPlaceholder", { brand: brandName })}
              style={inputBase(true)}
            />
          )}
        </Section>

        <Section title={t("channel")}>
          <Segmented
            options={[
              { label: "LinkedIn", value: "linkedin", icon: <LinkedInIcon /> },
              { label: t("channelBlog"), value: "blog", disabled: true },
              { label: "X", value: "x", disabled: true },
            ]}
            value="linkedin"
          />
          <div style={{ marginTop: 14 }}>
            <Caption right={t("lengthApprox")}>{t("length")}</Caption>
            <Segmented
              options={[
                { label: t("lengthShort"), value: "short", disabled: true },
                { label: t("lengthMedium"), value: "medium" },
                { label: t("lengthLong"), value: "long", disabled: true },
              ]}
              value="medium"
            />
          </div>
        </Section>

        <Section>
          <button
            onClick={onGenerate}
            disabled={busy}
            style={primaryButton(busy, 40)}
          >
            {generateLabel}
          </button>
          {error && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--risky-bg)",
                border: "1px solid rgba(194,104,90,0.20)",
                color: "var(--risky)",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <span style={mono(11, "var(--ink-faint)")}>
              Claude Sonnet 4.6
              {breakdown && (
                <>
                  {" · "}
                  Pangram v3
                </>
              )}
            </span>
          </div>
        </Section>
      </aside>

      {/* CENTER — editor */}
      <main
        style={{
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 32px",
            borderBottom: "1px solid var(--border-subtle)",
            height: 56,
            flexShrink: 0,
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("untitledPost")}
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              padding: 0,
              minWidth: 0,
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badge variant="neutral">LINKEDIN</Badge>
            <span style={mono(12, overLimit ? "var(--risky)" : "var(--ink-faint)")}>
              {t("charsCounter", { current: charCount, max: LINKEDIN_MAX })}
            </span>
            {dirty && (
              <span style={mono(12, "var(--borderline)")}>{t("unsaved")}</span>
            )}
          </div>
        </div>

        <Toolbar />

        <div
          style={{
            flex: 1,
            padding: "32px 32px 24px",
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          <div style={{ maxWidth: "var(--editor-max-w)", margin: "0 auto" }}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              placeholder={t("draftPlaceholder")}
              style={{
                width: "100%",
                background: "transparent",
                border: 0,
                outline: "none",
                resize: "vertical",
                fontFamily: "var(--font-sans)",
                fontSize: 16,
                lineHeight: 1.65,
                color: "var(--ink)",
                letterSpacing: "-0.005em",
                minHeight: 400,
              }}
            />
          </div>
        </div>

        <footer
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: "12px 32px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={mono(11, "var(--ink-faint)")}>
              {status === null
                ? t("statusNotSaved")
                : stage === "saving"
                  ? t("statusSaving")
                  : dirty
                    ? t("statusEdited")
                    : t("statusSaved")}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {publishedUrl && stage === "published" && (
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: "var(--pass)",
                  textDecoration: "underline",
                  marginRight: 4,
                }}
              >
                {t("publishedView")}
              </a>
            )}
            {postId && (
              <button
                onClick={onSave}
                disabled={busy || isPending || !dirty}
                style={secondaryButton(busy || isPending || !dirty)}
              >
                {stage === "saved" && !dirty ? t("saved") : t("saveDraft")}
              </button>
            )}
            <button
              onClick={onPublish}
              disabled={!postId || busy || stage === "published"}
              style={primaryButton(!postId || busy || stage === "published", 32)}
            >
              {stage === "publishing"
                ? t("publishing")
                : stage === "published"
                  ? t("published")
                  : t("publish")}
            </button>
          </div>
        </footer>
      </main>

      {/* RIGHT — Detection Pass panel */}
      <aside
        style={{
          borderLeft: "1px solid var(--border-subtle)",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "24px 20px 12px",
            textAlign: "center",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              ...caption(),
              marginBottom: 8,
            }}
          >
            {t("scoreTitle")}
          </div>
          <div style={{ display: "grid", placeItems: "center" }}>
            <DetectionGauge score={score} size="md" />
          </div>
          <div
            style={{
              marginTop: 8,
              ...mono(11, "var(--ink-faint)"),
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {score === null ? t("scoreEmpty") : t("scoreFresh")}
          </div>
        </div>

        <Section
          title={t("perDetector")}
          right={
            <span style={mono(10, "var(--ink-faint)")}>{t("aiProbHint")}</span>
          }
        >
          <DetectorRow
            name="Pangram"
            sub="v3 · weight 1.0"
            score={breakdown ? breakdown.fraction_ai : null}
          />
          <DetectorRow
            name="GPTZero"
            sub={t("notConfigured")}
            score={null}
            faded
          />
          <DetectorRow
            name="Originality.ai"
            sub={t("notConfigured")}
            score={null}
            faded
          />
        </Section>

        {breakdown && (
          <Section title={t("breakdown")}>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-muted)",
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              {breakdown.headline}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
              }}
            >
              <Stat label={t("statAi")} value={breakdown.num_ai_segments} />
              <Stat label={t("statAssisted")} value={breakdown.num_ai_assisted_segments} />
              <Stat label={t("statHuman")} value={breakdown.num_human_segments} />
            </div>
          </Section>
        )}

        <Section
          title={t("flaggedSpans")}
          right={<span style={mono(11, "var(--ink-faint)")}>0</span>}
        >
          <div
            style={{
              ...mono(12, "var(--ink-faint)"),
              padding: "16px 4px",
              textAlign: "center",
              letterSpacing: "0.06em",
            }}
          >
            {t("flaggedSoon")}
          </div>
        </Section>

        <Section
          title={t("runHistory")}
          right={<span style={mono(11, "var(--ink-faint)")}>1</span>}
        >
          {score !== null ? (
            <HistoryRow
              when={t("historyFirst")}
              score={score}
              isLatest
            />
          ) : (
            <div
              style={{
                ...mono(12, "var(--ink-faint)"),
                padding: "12px 4px",
                letterSpacing: "0.06em",
              }}
            >
              {t("noRuns")}
            </div>
          )}
        </Section>

        <Section>
          <button
            disabled
            style={secondaryButton(true, 40)}
            title={t("rehumanizeTooltip")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ marginRight: 6 }}
            >
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {t("rehumanize")}
          </button>
        </Section>
      </aside>
    </div>
  );
}

/* ─── tiny inline primitives, kept here для скорости ───────────────────── */

function Section({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: "18px 20px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {title && (
        <Caption right={right}>{title}</Caption>
      )}
      {children}
    </section>
  );
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  summary,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={caption()}>{title}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--ink-faint)",
          }}
        >
          {!open && summary && (
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-faint)",
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {summary}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)",
            }}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </section>
  );
}

function Caption({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <span style={caption()}>{children}</span>
      {right}
    </div>
  );
}

function BrandSummaryRow({
  label,
  value,
  valueColor,
  title,
}: {
  label: string;
  value: string;
  valueColor?: string;
  title?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0" }}>
      <span
        style={{
          ...mono(11, "var(--ink-faint)"),
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          minWidth: 64,
          paddingTop: 2,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        title={title}
        style={{
          flex: 1,
          fontSize: 13,
          color: valueColor ?? "var(--ink)",
          lineHeight: 1.55,
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
}: {
  options: { label: string; value: T; icon?: React.ReactNode; disabled?: boolean }[];
  value: T;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "1fr",
        gap: 0,
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        padding: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            disabled={opt.disabled}
            style={{
              height: 26,
              background: active ? "var(--raised)" : "transparent",
              border: 0,
              color: active
                ? "var(--ink)"
                : opt.disabled
                  ? "var(--ink-faint)"
                  : "var(--ink-muted)",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              cursor: opt.disabled ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              opacity: opt.disabled ? 0.55 : 1,
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Badge({
  variant,
  children,
}: {
  variant: "neutral" | "pass" | "borderline" | "risky";
  children: React.ReactNode;
}) {
  const styles: Record<string, React.CSSProperties> = {
    neutral: {
      background: "var(--raised)",
      color: "var(--ink-muted)",
      borderColor: "var(--border-subtle)",
    },
    pass: {
      background: "var(--pass-bg)",
      color: "var(--pass)",
      borderColor: "rgba(122,160,121,0.20)",
    },
    borderline: {
      background: "var(--borderline-bg)",
      color: "var(--borderline)",
      borderColor: "rgba(201,166,107,0.20)",
    },
    risky: {
      background: "var(--risky-bg)",
      color: "var(--risky)",
      borderColor: "rgba(194,104,90,0.20)",
    },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px",
        borderRadius: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.02em",
        border: "1px solid",
        ...styles[variant],
      }}
    >
      {children}
    </span>
  );
}

function Toolbar() {
  const t = useTranslations("writer.toolbar");
  const Btn = ({ title }: { title: string }) => (
    <button
      title={title}
      disabled
      style={{
        width: 28,
        height: 28,
        display: "grid",
        placeItems: "center",
        background: "transparent",
        border: 0,
        borderRadius: 4,
        color: "var(--ink-faint)",
        cursor: "not-allowed",
      }}
    >
      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
        {title.slice(0, 1)}
      </span>
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: "6px 24px",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}
    >
      <Btn title={t("heading")} />
      <Btn title={t("bold")} />
      <Btn title={t("italic")} />
      <Btn title={t("quote")} />
      <div
        style={{
          width: 1,
          background: "var(--border-subtle)",
          margin: "6px 8px",
          height: 16,
          alignSelf: "center",
        }}
      />
      <Btn title={t("list")} />
      <Btn title={t("link")} />
      <div style={{ flex: 1 }} />
      <span
        style={{
          ...mono(11, "var(--ink-faint)"),
          alignSelf: "center",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {t("editorSoon")}
      </span>
    </div>
  );
}

function DetectorRow({
  name,
  sub,
  score,
  faded,
}: {
  name: string;
  sub: string;
  score: number | null;
  faded?: boolean;
}) {
  const fraction = score === null ? 0 : Math.max(0, Math.min(1, score));
  const bucket = score === null ? "risky" : scoreBucket(100 * (1 - fraction));
  const color = score === null ? "var(--ink-faint)" : bucketCssVar(bucket);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        opacity: faded ? 0.55 : 1,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
          {name}
        </div>
        <div
          style={{
            ...mono(10, "var(--ink-faint)"),
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 80,
            height: 4,
            background: "var(--raised)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${fraction * 100}%`,
              height: "100%",
              background: color,
              borderRadius: 999,
              transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
        <span
          style={{
            ...mono(12, "var(--ink)"),
            minWidth: 32,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score === null ? "—" : fraction.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function HistoryRow({
  when,
  score,
  isLatest,
}: {
  when: string;
  score: number;
  isLatest?: boolean;
}) {
  const bucket = scoreBucket(score);
  const color = bucketCssVar(bucket);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "12px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 0",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          ...(isLatest ? { boxShadow: "0 0 0 2px var(--bg)" } : {}),
        }}
      />
      <span style={mono(11, "var(--ink-faint)")}>{when}</span>
      <span
        style={{
          ...mono(13, color),
          fontWeight: 500,
        }}
      >
        {score}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div
        style={{
          ...mono(10, "var(--ink-faint)"),
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...mono(15, "var(--ink)"),
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LinkedInIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.4 3H3.6C3.3 3 3 3.3 3 3.6v16.8c0 .3.3.6.6.6h16.8c.3 0 .6-.3.6-.6V3.6c0-.3-.3-.6-.6-.6ZM8.3 18.3H5.6V9.7h2.7v8.6Zm-1.3-9.8a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2Zm11.4 9.8h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3h-2.7V9.7h2.6V11h0a2.8 2.8 0 0 1 2.6-1.4c2.7 0 3.2 1.8 3.2 4.1v4.6Z" />
    </svg>
  );
}

/* ─── style helpers ───────────────────────────────────────────────────── */

function caption(): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--ink-faint)",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  };
}

function mono(size: number, color: string): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: size,
    color,
    letterSpacing: "0.02em",
    fontVariantNumeric: "tabular-nums",
  };
}

function inputBase(isTextarea: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    minHeight: isTextarea ? 88 : undefined,
    padding: isTextarea ? 10 : "0 10px",
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    color: "var(--ink)",
    fontFamily: "inherit",
    fontSize: 13,
    lineHeight: 1.5,
    resize: isTextarea ? "vertical" : "none",
    outline: "none",
  };
}

function primaryButton(disabled: boolean, height: number): React.CSSProperties {
  return {
    width: "100%",
    height,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: height >= 40 ? 14 : 13,
    fontWeight: 500,
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "var(--bg)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "opacity 120ms",
  };
}

function secondaryButton(
  disabled: boolean,
  height: number = 32,
): React.CSSProperties {
  return {
    width: height >= 40 ? "100%" : "auto",
    height,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    color: "var(--ink)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

/* ─── content truncation helpers ──────────────────────────────────────── */

function shortenVoice(voice: string | null): {
  short: string;
  full: string | null;
} {
  if (!voice || !voice.trim()) return { short: "—", full: null };
  const trimmed = voice.trim();
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
  if (firstSentence.length <= 140) {
    return {
      short: firstSentence + (firstSentence === trimmed ? "" : "…"),
      full: trimmed,
    };
  }
  return { short: firstSentence.slice(0, 137).trimEnd() + "…", full: trimmed };
}

function truncateList(
  items: string[],
  max: number,
): { shown: string[]; rest: number } {
  if (items.length <= max) return { shown: items, rest: 0 };
  return { shown: items.slice(0, max), rest: items.length - max };
}

function formatList(
  t: { shown: string[]; rest: number },
  moreSuffix: string,
): string {
  const base = t.shown.join(" · ");
  return t.rest > 0 ? `${base} · ${moreSuffix.replace("{n}", String(t.rest))}` : base;
}
