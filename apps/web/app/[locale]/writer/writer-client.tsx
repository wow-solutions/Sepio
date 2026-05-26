"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { SepioMark } from "@/components/shell/sepio-mark";
import { saveDraft } from "./actions";
import { TopicPicker } from "./_components/topic-picker";

type PickedTopic = {
  id: string;
  topic_text: string;
};

type GenerateResponse = {
  post_id: string;
  content: string;
  status: "draft" | "pending_approval";
  cache_read_tokens: number;
};

type Stage =
  | "idle"
  | "generating"
  | "ready"
  | "humanizing"
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
  const [status, setStatus] = useState<"draft" | "pending_approval" | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [brandContextOpen, setBrandContextOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  // Snapshot of content before last humanize — drives the Undo button.
  const [humanizeSnapshot, setHumanizeSnapshot] = useState<string | null>(null);
  // Topic picker state — sprint 1C Lane F.
  const [pickedTopic, setPickedTopic] = useState<PickedTopic | null>(null);
  // Increment to trigger TopicPicker re-fetch (e.g. after generate consumes a card).
  const [topicsRefreshKey, setTopicsRefreshKey] = useState(0);
  // Right preview panel can collapse to the right edge.
  const [previewOpen, setPreviewOpen] = useState(true);

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
    stage === "humanizing" ||
    stage === "saving" ||
    stage === "publishing";
  const dirty = postId !== null && content !== originalContent;

  async function onGenerate() {
    setError(null);
    setStage("generating");
    setPostId(null);
    setStatus(null);

    const payload: {
      brand_id: string;
      topic_hint?: string;
      source_text?: string;
      topic_candidate_id?: string;
    } = {
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
    } else if (pickedTopic) {
      // Picker selected — backend uses topic_text from candidate, marks used_at
      // atomically via insert_post_and_mark_candidate RPC.
      payload.topic_candidate_id = pickedTopic.id;
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

    const data = (await res.json()) as GenerateResponse;
    setContent(data.content);
    setOriginalContent(data.content);
    setPostId(data.post_id);
    setStatus(data.status);
    setStage("ready");
    if (!title) {
      const firstLine = data.content.split("\n").find((l) => l.trim()) ?? "";
      setTitle(firstLine.slice(0, 80));
    }
    // If the post was generated from a topic candidate, the backend marked it
    // used_at — refresh picker so the consumed card disappears and the next
    // pool candidate becomes visible. Clear local selection too.
    if (pickedTopic) {
      setPickedTopic(null);
      setTopicsRefreshKey((k) => k + 1);
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

  async function onHumanize() {
    if (!content.trim()) return;
    setError(null);
    const snapshot = content;
    setStage("humanizing");

    let res: Response;
    try {
      res = await fetch("/api/posts/humanize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: content, brand_id: brandId }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("networkError"));
      setStage("error");
      return;
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: unknown }
        | null;
      const errText =
        data && typeof data.error === "string" && data.error
          ? data.error
          : `HTTP ${res.status}`;
      setError(errText);
      setStage("error");
      return;
    }

    const data = (await res.json()) as { text: string };
    // Commit only on success: snapshot stored, content swapped.
    setHumanizeSnapshot(snapshot);
    setContent(data.text);
    setStage("ready");
  }

  function onUndoHumanize() {
    if (humanizeSnapshot === null) return;
    setContent(humanizeSnapshot);
    setHumanizeSnapshot(null);
  }

  // Topic picker selection. Picking auto-fills the prompt textarea (transparency
  // — юзер видит что отправляется в Claude). Deselecting (passing null) leaves
  // the textarea content alone — user may want to keep editing it.
  function handleTopicSelect(topic: PickedTopic | null) {
    setPickedTopic(topic);
    if (topic) {
      setTopic(topic.topic_text);
      // Make sure mode is "topic" — picking a card в article-mode would be weird.
      if (mode !== "topic") setMode("topic");
    }
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
      : postId
        ? t("regenerate")
        : t("generate");

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* LEFT — prompt / article settings panel (fixed, does not collapse) */}
      <aside
        style={{
          width: "var(--writer-left-w)",
          flexShrink: 0,
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
              value={formatList(toneTop, t.raw("moreSuffix") as string)}
              title={brandConfig.toneAttributes.join(" · ")}
            />
          )}
          {avoidTop.shown.length > 0 && (
            <BrandSummaryRow
              label={t("rowAvoid")}
              value={formatList(avoidTop, t.raw("moreSuffix") as string)}
              title={brandConfig.forbiddenWords.join(" · ")}
            />
          )}
          {topicsTop.shown.length > 0 && (
            <BrandSummaryRow
              label={t("rowTopics")}
              value={formatList(topicsTop, t.raw("moreSuffix") as string)}
              valueColor="var(--info)"
              title={brandConfig.seoKeywords.join(" · ")}
            />
          )}
        </CollapsibleSection>

        <TopicPicker
          brandId={brandId}
          selectedId={pickedTopic?.id ?? null}
          onSelect={(t) =>
            handleTopicSelect(
              t ? { id: t.id, topic_text: t.topic_text } : null,
            )
          }
          refreshKey={topicsRefreshKey}
          disabled={busy}
        />

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
              onChange={(e) => {
                setTopic(e.target.value.slice(0, 1000));
                // User editing после picking → их текст выигрывает; deselect
                // картu so backend uses topic_hint, не candidate_id.
                if (pickedTopic) setPickedTopic(null);
              }}
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
            </span>
          </div>
        </Section>
      </aside>

      {/* CENTER — editor (the main workspace; more context will live here) */}
      <main
        style={{
          flex: 1,
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
          {!postId && !content.trim() ? (
            <EmptyComposer />
          ) : (
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
          )}
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
          <div
            style={{
              display: "flex",
              gap: 8,
              rowGap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {publishedUrl && stage === "published" && (
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  height: 32,
                  padding: "0 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 9999,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: "var(--ink)",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                {t("publishedView")} ↗
              </a>
            )}
            {humanizeSnapshot !== null && (
              <button
                onClick={onUndoHumanize}
                disabled={busy}
                style={secondaryButton(busy)}
                title={t("undoTooltip")}
              >
                {t("undo")}
              </button>
            )}
            {postId && (
              <button
                onClick={onHumanize}
                disabled={busy || !content.trim()}
                style={secondaryButton(busy || !content.trim())}
                title={t("rehumanizeTooltip")}
              >
                {stage === "humanizing" ? t("humanizing") : t("rehumanize")}
              </button>
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
              <PublishMark stage={stage} />
            </button>
          </div>
        </footer>
      </main>

      {/* RIGHT — live LinkedIn preview (collapsible to the right edge) */}
      {previewOpen ? (
        <LivePreview
          brandName={brandName}
          content={content}
          onClose={() => setPreviewOpen(false)}
        />
      ) : (
        <PreviewReopen onOpen={() => setPreviewOpen(true)} />
      )}
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
    padding: "0 16px",
    whiteSpace: "nowrap",
    borderRadius: 9999,
    fontSize: height >= 40 ? 14 : 13,
    fontWeight: 500,
    border: "1px solid var(--sepio-sepia)",
    background: "var(--sepio-sepia)",
    color: "var(--sepio-cream)",
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
    padding: "0 16px",
    whiteSpace: "nowrap",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid var(--border-strong)",
    background: "transparent",
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

/* ─── composer empty state + live preview (app handoff 2026-05-24) ──────── */

function Em({ children }: { children: React.ReactNode }) {
  return (
    <em
      style={{
        fontFamily: "var(--font-fraunces), Georgia, serif",
        fontStyle: "italic",
        fontWeight: 400,
        color: "var(--sepio-sepia-bright)",
      }}
    >
      {children}
    </em>
  );
}

// Shown in the center when there is no draft yet — the "Start with one idea"
// hero. The actual prompt input lives in the left rail; this points to it.
function EmptyComposer() {
  const t = useTranslations("writer");
  return (
    <div
      style={{
        height: "100%",
        minHeight: 360,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        textAlign: "center",
        padding: 24,
      }}
    >
      <SepioMark size={88} />
      <div style={{ maxWidth: 460 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--brand)",
            marginBottom: 14,
          }}
        >
          {t("emptyEyebrow")}
        </div>
        <h2
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontVariationSettings: '"opsz" 96',
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.02,
            letterSpacing: "-0.028em",
            color: "var(--ink)",
            margin: "0 0 14px",
          }}
        >
          {t.rich("emptyTitle", { em: (c) => <Em>{c}</Em> })}
        </h2>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--ink-muted)",
            margin: 0,
          }}
        >
          {t("emptyBody")}
        </p>
      </div>
    </div>
  );
}

function LivePreview({
  brandName,
  content,
  onClose,
}: {
  brandName: string;
  content: string;
  onClose: () => void;
}) {
  const t = useTranslations("writer");
  const hasContent = content.trim().length > 0;
  // Only LinkedIn is wired (ADR-0019); the rest are shown as "soon" tabs.
  const soonTabs = ["Telegram", "Instagram", "TikTok", "Threads", "Blog"];
  return (
    <aside
      style={{
        width: "var(--writer-right-w)",
        flexShrink: 0,
        borderLeft: "1px solid var(--border-subtle)",
        background: "var(--sepio-surface-soft)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div
        style={{
          padding: "16px 20px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={caption()}>{t("previewLabel")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("previewCollapse")}
          title={t("previewCollapse")}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ink-faint)",
            cursor: "pointer",
            padding: 4,
            display: "inline-flex",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "12px 20px 14px",
          overflowX: "auto",
        }}
      >
        <PreviewTab label="LinkedIn" active />
        {soonTabs.map((p) => (
          <PreviewTab key={p} label={p} soon={t("previewSoon")} />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 20px 20px",
          minHeight: 0,
        }}
      >
        {hasContent ? (
          <LinkedInPreviewCard brandName={brandName} content={content} />
        ) : (
          <PreviewPlaceholder text={t("previewEmpty")} />
        )}
      </div>
    </aside>
  );
}

function PreviewTab({
  label,
  active,
  soon,
}: {
  label: string;
  active?: boolean;
  soon?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 9999,
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        fontWeight: 500,
        background: active ? "rgba(176,123,80,0.16)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${active ? "rgba(176,123,80,0.32)" : "var(--border-subtle)"}`,
        color: active ? "var(--ink)" : "var(--ink-faint)",
      }}
    >
      {label}
      {soon && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "0 4px",
            borderRadius: 3,
            background: "rgba(255,255,255,0.06)",
            color: "var(--ink-faint)",
          }}
        >
          {soon}
        </span>
      )}
    </span>
  );
}

// Faithful LinkedIn post card — light surface, native LinkedIn styling. Per
// the brand lock, light surfaces are allowed for embedded social previews.
function LinkedInPreviewCard({
  brandName,
  content,
}: {
  brandName: string;
  content: string;
}) {
  const initial = (brandName.trim()[0] ?? "S").toUpperCase();
  return (
    <div
      style={{
        background: "#fff",
        color: "#0a0a0a",
        borderRadius: 12,
        padding: 18,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.5)",
        marginTop: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#1C1815",
            color: "#B07B50",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontVariationSettings: '"opsz" 36',
            fontWeight: 500,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12.5,
              color: "#0a0a0a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brandName}
          </div>
          <div style={{ fontSize: 10.5, color: "#6a6a6a" }}>now</div>
        </div>
        <span style={{ color: "#6a6a6a", fontSize: 18, lineHeight: 1 }}>···</span>
      </div>
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "#0a0a0a",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {content}
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 11,
          color: "#5a5a5a",
          paddingTop: 10,
          marginTop: 12,
          borderTop: "1px solid #e5e5e5",
        }}
      >
        <span>♡ Like</span>
        <span>Comment</span>
        <span>↗ Share</span>
      </div>
    </div>
  );
}

function PreviewPlaceholder({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed var(--border-strong)",
        borderRadius: 12,
        marginTop: 8,
      }}
    >
      <div style={{ opacity: 0.4, marginBottom: 14, display: "flex", justifyContent: "center" }}>
        <SepioMark size={40} />
      </div>
      <p
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontStyle: "italic",
          fontVariationSettings: '"opsz" 60',
          fontSize: 16,
          color: "var(--ink-muted)",
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}

// Bare Fork glyph (no tile) in currentColor — for the publish button.
function ForkGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      <circle cx="32" cy="100" r="15" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity="0.9">
        <path d="M 46 100 C 90 100, 100 100, 118 28" />
        <path d="M 46 100 C 100 100, 110 100, 130 64" />
        <path d="M 46 100 L 168 100" />
        <path d="M 46 100 C 100 100, 110 100, 130 136" />
        <path d="M 46 100 C 90 100, 100 100, 118 172" />
      </g>
      <g fill="currentColor">
        <circle cx="122" cy="22" r="12" />
        <circle cx="135" cy="58" r="12" />
        <circle cx="172" cy="100" r="13" />
        <circle cx="135" cy="142" r="12" />
        <circle cx="122" cy="178" r="12" />
      </g>
    </svg>
  );
}

// Publish button trailing mark: a source dot at rest → the Fork while
// publishing (pulses) → the settled Fork once published. Echoes the landing.
function PublishMark({ stage }: { stage: Stage }) {
  if (stage === "publishing") {
    return (
      <span className="publish-mark" style={{ color: "var(--sepio-cream)" }}>
        <ForkGlyph size={16} />
      </span>
    );
  }
  if (stage === "published") {
    return (
      <span style={{ display: "inline-flex", color: "var(--sepio-cream)" }}>
        <ForkGlyph size={16} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "var(--sepio-cream)",
        display: "inline-block",
      }}
    />
  );
}

// Collapsed-preview rail: a thin strip on the right edge to reopen the preview.
function PreviewReopen({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("writer");
  return (
    <aside
      style={{
        width: 44,
        flexShrink: 0,
        borderLeft: "1px solid var(--border-subtle)",
        background: "var(--sepio-surface-soft)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 16,
        gap: 12,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("previewExpand")}
        title={t("previewExpand")}
        style={{
          background: "transparent",
          border: 0,
          color: "var(--ink-muted)",
          cursor: "pointer",
          padding: 4,
          display: "inline-flex",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <span
        style={{
          ...caption(),
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          color: "var(--ink-faint)",
        }}
      >
        {t("previewLabel")}
      </span>
    </aside>
  );
}
