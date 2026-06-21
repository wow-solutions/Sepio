"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SepioMark } from "@/components/shell/sepio-mark";
import { BlogBody } from "@/components/blog/blog-body";
import { adaptFor, type Platform } from "@/lib/format-adapter";
import {
  ANGLES_USING_ARTICLE,
  type AngleId,
} from "@/lib/angles-shared";
import { saveDraft } from "./actions";
import { TopicPicker } from "./_components/topic-picker";
import { AngleDropdown, AngleExpansion } from "./_components/angle-dropdown";
import { EditorialPanel } from "../posts/[id]/editorial-panel";
import { useKitchen } from "@/components/shell/kitchen-context";
import { KitchenCenter, SegToggle, type ViewMode } from "./_components/kitchen-preview";

type PickedTopic = {
  id: string;
  topic_text: string;
};

type GenerateResponse = {
  post_id: string;
  content: string;
  status: "draft" | "pending_approval";
  cache_read_tokens: number;
  grounded: boolean;
  source: { url: string; title: string | null } | null;
  // Present for blog (platform 'hosted'); absent on the LinkedIn path.
  platform?: string;
  title?: string | null;
  excerpt?: string | null;
};

// Output format chosen in the channel selector — drives the next generation.
type OutputFormat = "linkedin" | "blog";

// Source-hydration state for the picked topic + selected article-using angle.
// 'unavailable' covers the logical no-fetch cases: the apply angle, or free-text
// (no picked candidate). 'failed' = fetch attempted but the article wasn't
// retrievable — we stay honest and write from the topic gist.
type SourceState = {
  status: "idle" | "checking" | "success" | "failed" | "unavailable";
  url?: string;
  title?: string | null;
};

type HydrateResponse = {
  status: "success" | "failed" | "unavailable";
  source: { url: string; title: string | null } | null;
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

// An existing post loaded into the writer for editing (kitchen slice 2). When
// present, the writer is in EDIT mode: generation controls are hidden, the
// platform is locked, and the Editorial Memory panel attaches below the editor.
// `body` is the platform-correct body (content_markdown for hosted, else text),
// resolved server-side via getPostBody.
export type InitialPost = {
  id: string;
  platform: string;
  language: string;
  status: string;
  title: string;
  excerpt: string;
  body: string;
  externalUrl: string | null;
};

type Props = {
  brandId: string;
  brandName: string;
  brandConfig: {
    brandVoice: string | null;
    toneAttributes: string[];
    forbiddenWords: string[];
    seoKeywords: string[];
  };
  // null = fresh-generation (create) mode. The parent keys this component by
  // post id, so switching between create/edit fully remounts (clean state).
  // When a content group is opened, this is the BLOG SOURCE (the main editor
  // always edits the source; the rail/center handle the opened channel variant).
  initialPost?: InitialPost | null;
  // True when an existing content group was opened. The KitchenProvider is then
  // born hydrated (source + variants + active), so the writer must NOT re-register
  // the source (that would reset the hydrated variants).
  hasGroup?: boolean;
  // Gates the Editorial Memory panel in edit mode (same beta lock as /posts/[id]).
  betaAccess?: boolean;
};

export function WriterClient({
  brandId,
  brandName,
  brandConfig,
  initialPost = null,
  hasGroup = false,
  betaAccess = false,
}: Props) {
  const t = useTranslations("writer");
  // Locale-aware number formatting via next-intl (same locale on server +
  // client) — bare Number.toLocaleString() picks the JS runtime default locale,
  // which differs server↔client and triggers a hydration mismatch.
  const format = useFormatter();
  // Edit mode = an existing post was loaded. Derived from the prop (stable for
  // the mounted instance thanks to the key={postId} remount in page.tsx).
  const isEditing = initialPost != null;
  const isPublishedPost = initialPost?.status === "published";
  const [mode, setMode] = useState<"topic" | "article">("topic");
  // Channel/format selector — 'linkedin' (default) or 'blog' (long-form → hosted).
  // The writer always produces the blog article — the foundation of the content
  // kitchen (everything else fans out from it). Channel selection lives in the
  // rail, so there's no in-writer format switch.
  //
  // DORMANT (R-06): `outputFormat` is pinned to "blog", so every `!selectorIsBlog`
  // branch below (article-mode hydration, LinkedIn-from-article generation, the
  // article tab) is currently unreachable. It is kept on purpose — the in-writer
  // social/article path returns when direct social authoring ships (tracked with
  // the cross-link work, R-01). Do NOT treat the `!selectorIsBlog` code as live.
  const outputFormat: OutputFormat = "blog";
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");
  // State seeds from initialPost in edit mode (component is remounted per post
  // id, so these initializers run once with the right post loaded).
  const [title, setTitle] = useState(initialPost?.title ?? "");
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt ?? "");
  const [content, setContent] = useState(initialPost?.body ?? "");
  const [originalContent, setOriginalContent] = useState(initialPost?.body ?? "");
  // Baseline title for dirty-tracking a blog (editing only the title must still
  // mark the draft dirty so publish saves it). Unused for LinkedIn.
  const [originalTitle, setOriginalTitle] = useState(initialPost?.title ?? "");
  const [postId, setPostId] = useState<string | null>(initialPost?.id ?? null);
  // Platform of the post CURRENTLY in the editor (set at generate from the API
  // response, or seeded from a loaded post). Drives the editor badge, char
  // limit, save column, and preview — distinct from `outputFormat`, which only
  // chooses the NEXT generation.
  const [postPlatform, setPostPlatform] = useState<string | null>(
    initialPost?.platform ?? null,
  );
  const [status, setStatus] = useState<"draft" | "pending_approval" | null>(
    initialPost?.status === "draft" || initialPost?.status === "pending_approval"
      ? initialPost.status
      : null,
  );
  const [stage, setStage] = useState<Stage>(initialPost ? "ready" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [brandContextOpen, setBrandContextOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(
    initialPost?.status === "published" ? initialPost.externalUrl : null,
  );
  // Snapshot of content before last humanize — drives the Undo button.
  const [humanizeSnapshot, setHumanizeSnapshot] = useState<string | null>(null);
  // Topic picker state — sprint 1C Lane F.
  const [pickedTopic, setPickedTopic] = useState<PickedTopic | null>(null);
  // Angle-of-approach (topic mode only). null = no angle, existing behavior.
  const [angle, setAngle] = useState<AngleId | null>(null);
  // Stance branch — only meaningful when angle === "comment".
  const [stance, setStance] = useState({
    sentiment: "like" as "like" | "dislike",
    note: "",
  });
  // Source hydration for the picked topic + article-using angle. Drives the
  // source-status line (card / typed-path) and pre-caches the extract server-side.
  const [sourceState, setSourceState] = useState<SourceState>({
    status: "idle",
  });
  // Grounding of the CURRENT draft — captured at generate time so the editor
  // header chip reflects the post on screen, not the live angle selection.
  const [draftGrounding, setDraftGrounding] = useState<{
    grounded: boolean;
    source: { url: string; title: string | null } | null;
  } | null>(null);
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

  // The post in the editor is a blog article. Blog content has no LinkedIn
  // length cap; the badge/counter/preview/save all switch on this.
  const editorIsBlog = postPlatform === "hosted";
  // The selector is set to blog → the NEXT generation is a blog (gates the
  // topic/article toggle, since blog is topic-only for now).
  const selectorIsBlog = outputFormat === "blog";
  const charCount = content.length;
  const overLimit = !editorIsBlog && charCount > LINKEDIN_MAX;
  const busy =
    stage === "generating" ||
    stage === "humanizing" ||
    stage === "saving" ||
    stage === "publishing";
  const dirty =
    postId !== null &&
    (content !== originalContent || (editorIsBlog && title !== originalTitle));
  // Locked-published = the post is published, so it's read-only. Covers BOTH a
  // post loaded in published state AND one just published in this session (stage)
  // — otherwise the editor would stay writable right after a publish.
  const lockedPublished = isPublishedPost || stage === "published";

  // ── Content kitchen ────────────────────────────────────────────────────────
  // A blog (the source article) in the editor registers as the kitchen source, so
  // the channel rail activates (toggle destinations + preview/generate per-channel
  // variants from this article). Cleared when the post isn't an editable blog.
  const {
    setPresent: kitchenSetPresent,
    setSource: kitchenSetSource,
    syncBase: kitchenSyncBase,
    source: kitchenSource,
    active: kitchenActive,
    markVariantsStale: kitchenMarkVariantsStale,
  } = useKitchen();
  // Kitchen/blog mode = the writer will produce a blog (the foundation) or is
  // editing one. The rail channel selector is interactive only then — not while
  // writing a plain LinkedIn post (Codex: one source of truth, no two selectors).
  const inKitchenMode = selectorIsBlog || postPlatform === "hosted";
  useEffect(() => {
    kitchenSetPresent(inKitchenMode);
    return () => kitchenSetPresent(false);
  }, [inKitchenMode, kitchenSetPresent]);
  const isBlogSource =
    postPlatform === "hosted" && postId !== null && !lockedPublished;
  useEffect(() => {
    // When a content group was opened, the provider is already hydrated (source +
    // variants + active). Re-registering here would reset the variants, so skip
    // the registration — but syncBase below still keeps the blog body fresh.
    if (isBlogSource && postId && !hasGroup) {
      kitchenSetSource(
        { postId, brandId, language: initialPost?.language ?? "en" },
        content,
      );
      return () => kitchenSetSource(null, "");
    }
    // content is intentionally read at registration only; syncBase keeps it fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlogSource, postId, brandId, hasGroup, kitchenSetSource]);
  useEffect(() => {
    if (isBlogSource) kitchenSyncBase(content);
  }, [content, isBlogSource, kitchenSyncBase]);
  // Preview/Edit view mode for the kitchen center (shared by the blog + every
  // channel variant). Default Edit; clicking a DIFFERENT channel flips to Preview
  // (so a click shows how it looks). The initial mount stays in Edit.
  const [kitchenViewMode, setKitchenViewMode] = useState<ViewMode>("edit");
  const kitchenActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (kitchenActiveRef.current === null) {
      kitchenActiveRef.current = kitchenActive;
      return;
    }
    if (kitchenActiveRef.current !== kitchenActive) {
      kitchenActiveRef.current = kitchenActive;
      setKitchenViewMode("preview");
    }
  }, [kitchenActive]);
  // Preview/Edit toggle shows for any loaded post with content (blog or social).
  // (Only the TITLE field below is blog-only — social posts have no title.)
  const blogHasContent = !!postId && content.trim().length > 0;
  const blogPreview = blogHasContent && kitchenViewMode === "preview";
  // Social-post center preview renders the same platform-native card as the
  // right rail. The non-blog editor is LinkedIn-shaped, so any non-telegram
  // platform maps to the LinkedIn card.
  const previewPlatform: Platform =
    postPlatform === "telegram" ? "telegram" : "linkedin";
  const socialAdapted = useMemo(
    () => adaptFor(previewPlatform, { text: content }),
    [previewPlatform, content],
  );
  // Generation requires real input: a topic (picked card or typed hint) in topic
  // mode, or a long-enough source in article mode. The empty-topic "surprise me"
  // path is gated off until topic automation lands (Григорий 2026-06-03) — an
  // angle on an empty topic produces a useless "send me the gist" meta-reply.
  // Blog is topic-only, so the article (source-adapt) path applies to LinkedIn.
  const canGenerate =
    mode === "article" && !selectorIsBlog
      ? sourceText.trim().length >= 50
      : pickedTopic !== null || topic.trim().length > 0;

  // Source hydration — when the user picks an article-using angle AND a topic
  // candidate, pre-fetch + cache the source article so generation is grounded
  // and instant. Keyed on (pickedTopic, angle); a request key guards against
  // duplicate inflight calls and stale responses (selection changed mid-flight).
  const hydrateKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // Only article-using angles in LinkedIn topic mode need a source (blog
    // ignores angles entirely).
    const usesArticle =
      !selectorIsBlog &&
      mode === "topic" &&
      angle !== null &&
      ANGLES_USING_ARTICLE.has(angle);

    if (!usesArticle || !pickedTopic) {
      // apply angle, no angle, or free-text → logically source-free, no fetch.
      hydrateKeyRef.current = null;
      setSourceState({
        status: angle === null ? "idle" : "unavailable",
      });
      return;
    }

    const key = `${pickedTopic.id}::${angle}`;
    hydrateKeyRef.current = key;
    setSourceState({ status: "checking" });

    let cancelled = false;
    (async () => {
      let res: Response;
      try {
        res = await fetch(
          `/api/topics/${pickedTopic.id}/hydrate-source`,
          { method: "POST" },
        );
      } catch {
        if (cancelled || hydrateKeyRef.current !== key) return;
        setSourceState({ status: "failed" });
        return;
      }
      if (cancelled || hydrateKeyRef.current !== key) return;
      if (!res.ok) {
        setSourceState({ status: "failed" });
        return;
      }
      const data = (await res.json().catch(() => null)) as HydrateResponse | null;
      if (cancelled || hydrateKeyRef.current !== key) return;
      if (!data) {
        setSourceState({ status: "failed" });
        return;
      }
      setSourceState({
        status: data.status,
        url: data.source?.url,
        title: data.source?.title ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, angle, pickedTopic, selectorIsBlog]);

  async function onGenerate() {
    setError(null);
    setStage("generating");
    setPostId(null);
    setStatus(null);

    const payload: {
      brand_id: string;
      format?: "linkedin_post" | "blog";
      topic_hint?: string;
      source_text?: string;
      topic_candidate_id?: string;
      angle?: AngleId;
      stance?: { sentiment: "like" | "dislike"; note: string };
    } = {
      brand_id: brandId,
    };
    // Blog (kitchen): topic-only long-form → platform 'hosted'. No source_text
    // adapt, no angle/stance. The topic comes from a picked card or free text.
    if (selectorIsBlog) {
      payload.format = "blog";
      if (pickedTopic) {
        payload.topic_candidate_id = pickedTopic.id;
      } else {
        payload.topic_hint = topic.trim() || undefined;
      }
    } else if (mode === "article") {
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

    // Angle-of-approach — applies in topic mode to BOTH LinkedIn and blog (the
    // angle reframes the long-form article server-side). Comment angle requires a
    // stance note; guard before the fetch, mirroring the articleTooShort guard.
    if (mode === "topic" && angle) {
      if (angle === "comment" && stance.note.trim().length === 0) {
        setError(t("angle.commentNoteRequired"));
        setStage("error");
        return;
      }
      payload.angle = angle;
      if (angle === "comment") {
        payload.stance = { sentiment: stance.sentiment, note: stance.note.trim() };
      }
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
    const platform = data.platform ?? "linkedin";
    const isBlog = platform === "hosted";
    // Did the editor's post format change with this generation? (postPlatform
    // here is still the PREVIOUS post — setPostPlatform below applies next render.)
    const switchedFormat = (postPlatform === "hosted") !== isBlog;
    setContent(data.content);
    setOriginalContent(data.content);
    setPostId(data.post_id);
    setPostPlatform(platform);
    setStatus(data.status);
    setExcerpt(data.excerpt ?? "");
    setStage("ready");
    // Capture grounding for the editor-header chip — only when an angle drove
    // this draft (non-angle drafts, incl. blog, have no source provenance).
    setDraftGrounding(
      !isBlog && mode === "topic" && angle
        ? { grounded: data.grounded, source: data.source }
        : null,
    );
    // Blog returns a real title — use it (overwrite, since regenerating a blog
    // should refresh the title). LinkedIn has no real title field: fill from the
    // first line when the box is empty OR when we just switched away from a blog
    // (so a stale blog title doesn't bleed into a LinkedIn draft). `title` here
    // is the previous render's value, hence the switchedFormat guard.
    if (isBlog && data.title) {
      setTitle(data.title);
      setOriginalTitle(data.title);
    } else if (!isBlog && (switchedFormat || !title)) {
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
      const result = await saveDraft(postId, content, editorIsBlog ? title : undefined);
      if (!result.ok) {
        setError(result.error);
        setStage("error");
        return;
      }
      // Saving the SOURCE invalidates every channel variant (the server bumps
      // source_version on ANY source save — body OR title — so match it here, or
      // the in-session rail would stay 'fresh' while a reopen shows them 'stale').
      // Flag them so the rail/center prompt a regenerate.
      if (isBlogSource) kitchenMarkVariantsStale();
      setOriginalContent(content);
      if (editorIsBlog) setOriginalTitle(title);
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

  // Picking an angle from a topic card. Selecting an angle also selects that
  // card (deselecting others). Picking "No angle" (a === null) clears the angle
  // but keeps the card selected — the user stays on that topic.
  function handlePickAngle(a: AngleId | null, topic: PickedTopic) {
    if (pickedTopic?.id !== topic.id) handleTopicSelect(topic);
    setAngle(a);
  }

  async function onPublish() {
    if (!postId) return;
    setError(null);
    // Save first if dirty — publish what's on screen, not what's in DB.
    if (dirty) {
      setStage("saving");
      const saveResult = await saveDraft(postId, content, editorIsBlog ? title : undefined);
      if (!saveResult.ok) {
        setError(saveResult.error);
        setStage("error");
        return;
      }
      // Same source-save invalidation as onSave (the dirty save bumped source_version).
      if (isBlogSource) kitchenMarkVariantsStale();
      setOriginalContent(content);
      if (editorIsBlog) setOriginalTitle(title);
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

  const baseGenerateLabel =
    stage === "generating"
      ? t("generating")
      : postId
        ? t("regenerate")
        : t("generate");
  // Append the active angle's short label when one is selected (topic mode) —
  // but not while generating, where the status label is already long.
  const generateLabel =
    stage !== "generating" && mode === "topic" && angle
      ? `${baseGenerateLabel} · ${t(`angle.${angle}.label`)}`
      : baseGenerateLabel;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* LEFT — generation rail. Hidden in edit mode: editing an existing post
          is not generation, so the topic/angle/channel/generate controls don't
          apply (Codex: edit mode locks platform + disables regenerate). */}
      {!isEditing && (
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
          angle={angle}
          onPickAngle={(a, tp) =>
            handlePickAngle(a, { id: tp.id, topic_text: tp.topic_text })
          }
          stance={stance}
          onStanceChange={setStance}
          sourceState={sourceState}
        />

        <Section
          title={t("prompt")}
          right={
            <div
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              {mode === "topic" && (
                <AngleDropdown angle={angle} onPick={setAngle} disabled={busy} />
              )}
              <span style={mono(11, "var(--ink-faint)")}>
                {mode === "article"
                  ? `${sourceText.length} / 30000`
                  : `${topic.length} / 1000`}
              </span>
            </div>
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
              // Blog is topic-only — the article (source-adapt) tab is for
              // LinkedIn. Disable it while Blog is the selected channel.
              const disabled = busy || (selectorIsBlog && m === "article");
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={disabled}
                  style={{
                    height: 26,
                    background: active ? "var(--raised)" : "transparent",
                    border: 0,
                    color: active
                      ? "var(--ink)"
                      : disabled
                        ? "var(--ink-faint)"
                        : "var(--ink-muted)",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 4,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled && !active ? 0.55 : 1,
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

          {/* Typed-topic angle expansion — equivalent of the card expansion
              for a user typing their own topic (no picked candidate). */}
          {mode === "topic" && !pickedTopic && angle !== null && (
            <div style={{ marginTop: 12 }}>
              <AngleExpansion
                angle={angle}
                sourceState={sourceState}
                stance={stance}
                onStanceChange={setStance}
                disabled={busy}
              />
            </div>
          )}
        </Section>

        {/* Channel selection moved to the rail (the content kitchen). Length
            stays. The writer always produces the blog article (the foundation);
            the rail picks fan-out destinations. */}
        <Section title={t("length")} right={t("lengthApprox")}>
          <Segmented
            options={[
              { label: t("lengthShort"), value: "short", disabled: true },
              { label: t("lengthMedium"), value: "medium" },
              { label: t("lengthLong"), value: "long", disabled: true },
            ]}
            value="medium"
          />
        </Section>

        <Section>
          <button
            onClick={onGenerate}
            disabled={busy || !canGenerate}
            style={primaryButton(busy || !canGenerate, 40)}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {generateLabel}
            </span>
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
      )}

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
        {/* Kitchen: a non-blog channel takes over the center — the article as it
            looks on that channel, with the Preview/Edit toggle. The blog itself
            keeps the normal editor below. */}
        {kitchenSource && kitchenActive !== "hosted" ? (
          <KitchenCenter mode={kitchenViewMode} onModeChange={setKitchenViewMode} betaAccess={betaAccess} sourceTitle={title} />
        ) : (
          <>
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
          {blogHasContent && (
            <SegToggle
              mode={kitchenViewMode}
              onChange={setKitchenViewMode}
              previewLabel={t("kitchen.preview")}
              editLabel={t("kitchen.edit")}
            />
          )}
          {editorIsBlog ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={lockedPublished || blogPreview}
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
          ) : (
            // Social posts have no title — keep a spacer so the badge/counter
            // stay pinned right.
            <span style={{ flex: 1 }} />
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badge variant="neutral">{editorIsBlog ? "BLOG" : "LINKEDIN"}</Badge>
            {draftGrounding && <GroundingChip grounding={draftGrounding} />}
            <span style={mono(12, overLimit ? "var(--risky)" : "var(--ink-faint)")}>
              {editorIsBlog
                ? format.number(charCount)
                : t("charsCounter", { current: charCount, max: LINKEDIN_MAX })}
            </span>
            {dirty && (
              <span style={mono(12, "var(--borderline)")}>{t("unsaved")}</span>
            )}
          </div>
        </div>

        {!blogPreview && <Toolbar />}

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
          ) : blogPreview ? (
            editorIsBlog ? (
              // Blog Preview: the polished "published article" card — same look
              // as the right-rail preview (BlogPreviewCard), sized for the center.
              <div style={{ maxWidth: "var(--editor-max-w)", margin: "0 auto" }}>
                <BlogPreviewCard
                  size="lg"
                  title={title}
                  meta={excerpt}
                  body={content}
                />
              </div>
            ) : (
              // Social post preview: the platform-native card — same polished
              // look as the right-rail preview, centered at native feed width.
              <div style={{ maxWidth: 560, margin: "0 auto" }}>
                {socialAdapted.platform === "telegram" ? (
                  <TelegramPreviewCard
                    brandName={brandName}
                    html={socialAdapted.text}
                    asCaption={socialAdapted.asCaption}
                  />
                ) : socialAdapted.platform === "linkedin" ? (
                  <LinkedInPreviewCard
                    brandName={brandName}
                    text={socialAdapted.text}
                    firstComment={socialAdapted.firstComment}
                  />
                ) : (
                  <article className="writer-blog-preview">
                    <BlogBody source={content} />
                  </article>
                )}
              </div>
            )
          ) : (
            // Writing surface: a subtle card (not floating text) so it's obvious
            // this is the editable field. Read-only when the post is published.
            <div
              style={{
                maxWidth: "var(--editor-max-w)",
                margin: "0 auto",
                background: lockedPublished ? "transparent" : "var(--surface)",
                border: lockedPublished
                  ? "1px solid transparent"
                  : "1px solid var(--border-subtle)",
                borderRadius: 10,
                padding: "20px 24px",
                cursor: lockedPublished ? "default" : "text",
              }}
            >
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={lockedPublished}
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
                  color: lockedPublished ? "var(--ink-muted)" : "var(--ink)",
                  letterSpacing: "-0.005em",
                  minHeight: 400,
                }}
              />
            </div>
          )}

          {/* Editorial Memory — shows for any persisted post (freshly generated
              OR opened), beta-gated, not on a published post, not in Preview.
              postId is set only after the generate API saved the post, so the
              refine route always has a real DB row to diff against. Disabled
              while the editor is dirty: refine diffs against the SAVED body, so
              applying a rewrite over unsaved edits would clobber them. Applying
              pushes the new body back via onApplied (the writer owns the live
              editor). */}
          {betaAccess && !lockedPublished && postId && (
            // Hide in Preview, do NOT unmount: the panel holds its own state
            // (typed instruction, rewrite proposal, proposed rule). Unmounting
            // on the Preview toggle destroyed in-progress "Teach Sepio" work;
            // display:none keeps it mounted so a peek at the preview is safe.
            <div
              style={{
                maxWidth: "var(--editor-max-w)",
                margin: "8px auto 0",
                display: blogPreview ? "none" : "block",
              }}
            >
              <EditorialPanel
                postId={postId}
                brandId={brandId}
                currentContent={content}
                disabled={dirty}
                disabledHint={t("editorialDirtyHint")}
                onApplied={(newBody) => {
                  setContent(newBody);
                  setOriginalContent(newBody);
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
              {lockedPublished
                ? t("published")
                : status === null
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
            {publishedUrl && lockedPublished && (
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
            {postId && !lockedPublished && (
              <button
                onClick={onHumanize}
                disabled={busy || !content.trim()}
                style={secondaryButton(busy || !content.trim())}
                title={t("rehumanizeTooltip")}
              >
                {stage === "humanizing" ? t("humanizing") : t("rehumanize")}
              </button>
            )}
            {postId && !lockedPublished && (
              <button
                onClick={onSave}
                disabled={busy || isPending || !dirty}
                style={secondaryButton(busy || isPending || !dirty)}
              >
                {stage === "saved" && !dirty ? t("saved") : t("saveDraft")}
              </button>
            )}
            {/* Hidden once lockedPublished (incl. just-published this session),
                so the stage==="published" label/disabled are unreachable here —
                the published link above takes over. */}
            {!lockedPublished && (
            <button
              onClick={onPublish}
              disabled={!postId || busy}
              style={primaryButton(!postId || busy, 32)}
            >
              {stage === "publishing" ? t("publishing") : t("publish")}
              <PublishMark stage={stage} />
            </button>
            )}
          </div>
        </footer>
          </>
        )}
      </main>

      {/* RIGHT — live LinkedIn preview (collapsible to the right edge) */}
      {previewOpen ? (
        <LivePreview
          brandName={brandName}
          content={content}
          isBlog={editorIsBlog}
          blogTitle={title}
          blogExcerpt={excerpt}
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

// Editor-header provenance chip for the current draft. Grounded → links the
// source domain; otherwise (angle used but no source) a muted "from the topic".
function GroundingChip({
  grounding,
}: {
  grounding: {
    grounded: boolean;
    source: { url: string; title: string | null } | null;
  };
}) {
  const t = useTranslations("writer");
  if (grounding.grounded && grounding.source?.url) {
    const url = grounding.source.url;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...mono(11, "var(--info)"), textDecoration: "none" }}
      >
        {t("groundedFrom", { domain: hostOf(url) })} ↗
      </a>
    );
  }
  return (
    <span style={mono(11, "var(--ink-faint)")}>{t("groundedTopicOnly")}</span>
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
  onChange,
}: {
  options: { label: string; value: T; icon?: React.ReactNode; disabled?: boolean }[];
  value: T;
  onChange?: (value: T) => void;
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
            type="button"
            disabled={opt.disabled}
            onClick={
              onChange && !opt.disabled ? () => onChange(opt.value) : undefined
            }
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

// Bare host for a source URL, e.g. "https://www.x.com/a" -> "x.com". Falls back
// to the raw string if the URL can't be parsed.
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
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
    overflow: "hidden",
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
  isBlog,
  blogTitle,
  blogExcerpt,
  onClose,
}: {
  brandName: string;
  content: string;
  isBlog: boolean;
  blogTitle: string;
  blogExcerpt: string;
  onClose: () => void;
}) {
  const t = useTranslations("writer");
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const hasContent = content.trim().length > 0;
  // Live platforms run the format adapter; the rest stay "soon" (Phase 2).
  const livePlatforms: Platform[] = ["linkedin", "telegram", "blog"];
  const soonTabs = ["Instagram", "TikTok", "Threads"];
  const platformLabel: Record<Platform, string> = {
    linkedin: "LinkedIn",
    telegram: "Telegram",
    blog: "Blog",
  };
  // A blog article carries its own title + excerpt fields, so render them
  // directly — the rule-based blog adapter would fabricate an H1 from the first
  // body line, which conflicts with the real title.
  const adapted = useMemo(
    () => adaptFor(platform, { text: content }),
    [platform, content],
  );
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
        {isBlog ? (
          // The post IS a blog article — a single, fixed destination. No
          // cross-platform tabs (a LinkedIn preview of a 2000-word article is
          // meaningless).
          <PreviewTab label={platformLabel.blog} active />
        ) : (
          <>
            {livePlatforms.map((p) => (
              <PreviewTab
                key={p}
                label={platformLabel[p]}
                active={p === platform}
                onClick={() => setPlatform(p)}
              />
            ))}
            {soonTabs.map((p) => (
              <PreviewTab key={p} label={p} soon={t("previewSoon")} />
            ))}
          </>
        )}
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
          isBlog ? (
            <BlogPreviewCard title={blogTitle} meta={blogExcerpt} body={content} />
          ) : (
            <>
              {adapted.platform === "linkedin" && (
                <LinkedInPreviewCard
                  brandName={brandName}
                  text={adapted.text}
                  firstComment={adapted.firstComment}
                />
              )}
              {adapted.platform === "telegram" && (
                <TelegramPreviewCard
                  brandName={brandName}
                  html={adapted.text}
                  asCaption={adapted.asCaption}
                />
              )}
              {adapted.platform === "blog" && (
                <BlogPreviewCard
                  title={adapted.title}
                  meta={adapted.metaDescription}
                  body={adapted.bodyMarkdown}
                />
              )}
              <PreviewWarnings warnings={adapted.warnings} />
            </>
          )
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
  onClick,
}: {
  label: string;
  active?: boolean;
  soon?: string;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
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
    cursor: onClick ? "pointer" : "default",
  };
  const inner = (
    <>
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
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style}>
        {inner}
      </button>
    );
  }
  return <span style={style}>{inner}</span>;
}

// Faithful LinkedIn post card — light surface, native LinkedIn styling. Per
// the brand lock, light surfaces are allowed for embedded social previews.
function LinkedInPreviewCard({
  brandName,
  text,
  firstComment,
}: {
  brandName: string;
  text: string;
  firstComment: string | null;
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
        {text}
      </div>
      {firstComment && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid #e5e5e5",
            fontSize: 11,
            color: "#5a5a5a",
            overflowWrap: "anywhere",
          }}
        >
          <span style={{ color: "#0a66c2", fontWeight: 600 }}>↳ first comment</span>{" "}
          {firstComment}
        </div>
      )}
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

// Telegram channel post. The adapter emits HTML parse-mode text (first line
// bolded, rest HTML-escaped) — safe to render directly since the adapter
// escapes all user content and only adds <b> tags it controls.
function TelegramPreviewCard({
  brandName,
  html,
  asCaption,
}: {
  brandName: string;
  html: string;
  asCaption: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#0a0a0a",
        borderRadius: 12,
        padding: 16,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.5)",
        marginTop: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#229ED9",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          ✈
        </div>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: "#0a0a0a" }}>{brandName}</div>
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "#0a0a0a",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div style={{ marginTop: 10, fontSize: 10.5, color: "#8a8a8a" }}>
        {asCaption ? "photo caption · HTML" : "channel message · HTML"}
      </div>
    </div>
  );
}

// Blog article preview: white "published article" card — title, meta line, body.
// `size="lg"` (used in the center preview) scales the card up for a wide column
// and gives the markdown real article typography (see .blog-preview-body-lg in
// globals.css); the default `sm` keeps the compact right-rail look unchanged.
function BlogPreviewCard({
  title,
  meta,
  body,
  size = "sm",
}: {
  title: string;
  meta: string;
  body: string;
  size?: "sm" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div
      style={{
        background: "#fff",
        color: "#0a0a0a",
        borderRadius: lg ? 16 : 12,
        padding: lg ? "44px 48px" : 18,
        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.5)",
        marginTop: 8,
      }}
    >
      <h3
        style={{
          margin: lg ? "0 0 10px" : "0 0 6px",
          fontFamily: "Georgia, serif",
          fontSize: lg ? 30 : 18,
          fontWeight: 700,
          lineHeight: lg ? 1.18 : 1.25,
          letterSpacing: lg ? "-0.01em" : undefined,
          color: "#0a0a0a",
        }}
      >
        {title || "Untitled"}
      </h3>
      <div
        style={{
          fontSize: lg ? 12.5 : 11,
          color: "#6a6a6a",
          marginBottom: lg ? 24 : 12,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        meta · {meta || "—"}
      </div>
      <div
        className={lg ? "blog-preview-body-lg" : "writer-blog-preview"}
        style={{
          fontSize: lg ? 16.5 : 13,
          lineHeight: lg ? 1.72 : 1.6,
          color: lg ? "#222" : "#1a1a1a",
          overflowWrap: "anywhere",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Render markdown the SAME way the published /p/ page does (react-markdown
            + remark-gfm) so the preview shows real headings/tables/rules instead
            of raw `##` and `|` pipes. */}
        <BlogBody source={body} />
      </div>
    </div>
  );
}

// Adapter notes — what the rule-based adapter changed or flagged for this
// platform (links moved, hashtags trimmed, length over budget, etc.).
function PreviewWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        margin: "14px 0 0",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {warnings.map((w, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 8,
            fontSize: 11,
            lineHeight: 1.4,
            color: "var(--ink-faint)",
            fontFamily: "var(--font-sans)",
          }}
        >
          <span aria-hidden style={{ color: "#b07b50", flexShrink: 0 }}>
            ⚠
          </span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
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
