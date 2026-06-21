import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  generatePost,
  adaptToLinkedIn,
  generatePostFromUserMessage,
  generateBlogArticle,
  ClaudeError,
} from "@/lib/claude";
import { parseBlogArticleOutput } from "@/lib/_private/blog-article";
import { resolveBlogLanguages } from "@/lib/blog-languages";
import { slugify } from "@/lib/slug";
import { clientBrainContextBlocks } from "@/lib/client-brain/client-brain-context";
import { ANGLE_IDS, ANGLES_USING_ARTICLE } from "@/lib/angles-shared";
import type {
  Json,
  Database,
  TablesInsert,
} from "@/lib/supabase/database.types";
import { buildAngleUserText } from "@/lib/_private/angles";
import {
  fetchArticleExtract,
  deriveSourceUrl,
  type ArticleExtract,
} from "@/lib/_private/article-fetch";
import { differentiationContextBlocks } from "@/lib/market-brain/differentiation-context";
import {
  mergeRuleWords,
  renderVoiceNoteBlocks,
} from "@/lib/brand-rules/rules-context";
import {
  checkText,
  deriveDetectionScore,
  PangramError,
  type PangramResponse,
} from "@/lib/pangram";

// POST /api/posts/generate
//
// Flow (design doc 2026-05-13 §Data flow, ADR-0014 + sprint 1C D8/D12):
//   1. Auth check
//   2. Validate {brand_id, topic_hint?, source_text?, topic_candidate_id?}
//   3. Fetch brand + brand_configs (RLS enforces ownership)
//   4. If topic_candidate_id: fetch candidate (RLS-verified), use topic_text as hint
//   5. Claude generates draft
//   6. Pangram check on draft — CQ-2: on fail, return 503, do NOT save
//   7. Insert post:
//        - If topic_candidate_id: insert_post_and_mark_candidate RPC (atomic D12)
//        - Else: direct insert (existing flow, backwards compat)
//   8. Insert detection_dataset row via service-role (RLS blocks user direct insert)

// Three input modes (mutual precedence: candidate > source_text > topic_hint):
//   - topic_candidate_id: pick from /writer top-5, RPC handles atomicity
//   - source_text: adapt longer article into a LinkedIn post
//   - topic_hint: legacy free-text input
export const RequestSchema = z.object({
  brand_id: z.string().uuid(),
  // Output format (kitchen). 'linkedin_post' (default) keeps the existing
  // behavior; 'blog' generates a long-form article published to platform
  // 'hosted'. Topic-only for now — no source_text/angle/stance.
  format: z.enum(["linkedin_post", "blog"]).default("linkedin_post"),
  topic_hint: z.string().max(500).optional(),
  source_text: z.string().min(50).max(30_000).optional(),
  topic_candidate_id: z.string().uuid().optional(),
  // Angle-of-approach (TOPIC mode only). When present, the route builds an
  // angle-specific user message instead of the default generatePost path.
  angle: z.enum(ANGLE_IDS).optional(),
  // Only meaningful for angle==="comment". Validated against the angle below
  // (Zod can't express the cross-field rule cleanly, so it's checked manually).
  stance: z
    .object({
      sentiment: z.enum(["like", "dislike"]),
      note: z.string().max(500),
    })
    .optional(),
});

type ErrorBody = { error: string; stage?: "generate" | "detection" | "save" };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

// Provider (Anthropic) errors can carry billing/quota internals — e.g. "Your
// credit balance is too low... Plans & Billing" — that must never reach an end
// user. Log the real error for debugging; return a generic, safe message.
const SAFE_GENERATION_ERROR =
  "AI generation is temporarily unavailable. Please try again in a moment.";

function generationErrorResponse(err: unknown): Response {
  if (err instanceof ClaudeError) {
    console.error("[generate] Claude generation failed:", err.status, err.message);
  } else {
    console.error("[generate] generation failed:", err);
  }
  const status = err instanceof ClaudeError && err.status === 401 ? 500 : 502;
  return jsonError({ error: SAFE_GENERATION_ERROR, stage: "generate" }, status);
}

// Cached extract shape stored in topic_candidates.article_extract (= ArticleExtract
// plus an ISO fetchedAt). Reading back: cast to this, pass the ArticleExtract
// subset (drop fetchedAt) into the angle builder.
type CachedArticleExtract = ArticleExtract & { fetchedAt: string };

// Blog generation fans out across every brand language (one long-form Sonnet
// call per language). Multi-language brands can run ~3x a single generation, so
// give the route an explicit, deterministic budget instead of the platform
// default. Languages are generated concurrently (see the blog branch), keeping
// real latency near a single generation.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError({ error: "Not signed in" }, 401);

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      400,
    );
  }
  const {
    brand_id,
    format,
    topic_hint,
    source_text,
    topic_candidate_id,
    angle,
    stance,
  } = parsed.data;

  // Blog is topic-only on the SOURCE side: it does not support the
  // LinkedIn-specific source_text adapt. Angle/stance ARE supported — the angle
  // reframes the long-form article; the comment angle carries a stance (validated
  // just below, shared with the LinkedIn path). Fail fast before any DB/Claude.
  if (format === "blog" && source_text) {
    return jsonError(
      { error: "Blog format takes a topic, not source_text" },
      400,
    );
  }

  // Angle/stance cross-field validation (frozen contract). Done before any DB
  // work or Claude call so a malformed request fails fast with 400.
  if (angle === "comment") {
    const note = stance?.note.trim();
    if (!stance || !note) {
      return jsonError({ error: "stance.note is required for the comment angle" }, 400);
    }
    if (note.length > 500) {
      return jsonError({ error: "stance.note must be 500 characters or fewer" }, 400);
    }
  }
  // For non-comment angles, any provided stance is ignored (dropped below).
  const effectiveStance = angle === "comment" ? stance! : null;

  // Fetch brand + config (RLS prevents reading another user's brand).
  const { data: brand } = await supabase
    .from("brands")
    .select("id, account_id, primary_language, additional_languages, name")
    .eq("id", brand_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) return jsonError({ error: "Brand not found" }, 404);

  const { data: config } = await supabase
    .from("brand_configs")
    .select("*")
    .eq("brand_id", brand_id)
    .maybeSingle();
  if (!config) {
    return jsonError({ error: "Brand config missing", stage: "generate" }, 500);
  }

  // If topic_candidate_id provided, resolve to topic_text (used as topic_hint
  // for Claude). RLS verifies user owns this brand's candidates.
  let effectiveTopicHint = topic_hint;
  let resolvedCandidateText: string | null = null;
  // Source URL for the angle article fetch — only a web_search candidate with a
  // valid http(s) source_url qualifies. Free-text topic_hint has none.
  let sourceUrl: string | null = null;
  // Cached article extract for the picked candidate, when present and successful.
  let cachedArticle: ArticleExtract | null = null;
  if (topic_candidate_id) {
    const { data: candidate, error: candidateErr } = await supabase
      .from("topic_candidates")
      .select(
        "id, brand_id, topic_text, source, source_metadata, article_extract, article_extract_status",
      )
      .eq("id", topic_candidate_id)
      .maybeSingle();

    if (candidateErr) {
      return jsonError(
        { error: `Candidate fetch failed: ${candidateErr.message}` },
        500,
      );
    }
    if (!candidate) {
      return jsonError({ error: "topic_candidate_id not found" }, 404);
    }
    if (candidate.brand_id !== brand_id) {
      return jsonError(
        { error: "topic_candidate belongs to different brand" },
        403,
      );
    }
    effectiveTopicHint = candidate.topic_text;
    resolvedCandidateText = candidate.topic_text;
    sourceUrl = deriveSourceUrl(candidate.source, candidate.source_metadata);
    if (
      candidate.article_extract_status === "success" &&
      candidate.article_extract
    ) {
      // Drop the cache-only `fetchedAt` — the angle builder wants a bare
      // ArticleExtract. Pick the fields explicitly (cleaner than an unused rest).
      const c = candidate.article_extract as unknown as CachedArticleExtract;
      cachedArticle = {
        title: c.title,
        excerpt: c.excerpt,
        paragraphs: c.paragraphs,
        sourceUrl: c.sourceUrl,
      };
    }
  }

  // Market Brain (T8): inject the brand's competitive differentiation into the
  // generation prompt via the T4 seam. Read the single derived-only row (RLS
  // owner read). On DB error: log and skip — never hide the breakage (a silent
  // catch would make Market Brain look inactive), but never block generation
  // over it either. Absent row / low-confidence (both arrays empty) → [] → skip.
  const { data: diffRow, error: diffErr } = await supabase
    .from("market_differentiation")
    .select("common_themes, positioning_gaps")
    .eq("brand_id", brand_id)
    .maybeSingle();
  if (diffErr) {
    console.error("market_differentiation read failed:", diffErr.message);
  }
  // Editorial Memory (T6): inject the brand's learned rules via the same T4 seam.
  // Read active rules once, sorted by (created_at, id) for byte-stable prompt
  // assembly (cache invariant, Codex #4-7). DB error → log + skip (never block
  // generation). Word-type rules (forbidden_word/required_phrase) MERGE into the
  // config columns so buildBrandContext emits ONE deduped "Never use"/"Weave in"
  // section (3b) — with no rules + clean config the merge is a no-op, so a brand
  // not using the feature keeps an identical (cache-warm) prompt. voice_note rules
  // have no column, so they inject as their own scope-grouped blocks.
  const { data: ruleRows, error: rulesErr } = await supabase
    .from("brand_rules")
    .select("rule_type, scope, rule_text")
    .eq("brand_id", brand_id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (rulesErr) {
    console.error("brand_rules read failed:", rulesErr.message);
  }
  const rules = rulesErr ? [] : (ruleRows ?? []);
  const mergedWords = mergeRuleWords(
    rules,
    config.forbidden_words ?? [],
    config.required_phrases ?? [],
  );
  const configForGen = {
    ...config,
    forbidden_words: mergedWords.forbidden,
    required_phrases: mergedWords.required,
  };

  // Client Brain (site-grounded facts): the brand's services/locations/pricing
  // live on brand_configs (already in `config`); proof_items is a separate table.
  // Read it owner-scoped; on error log + skip (never block generation) — same
  // discipline as the Market Brain read. Empty facts → block renders "" → nothing
  // injected (cache-warm), so a brand that never studied its site is unaffected.
  const { data: proofRows, error: proofErr } = await supabase
    .from("proof_items")
    .select("kind, body, source, verifiable")
    .eq("brand_id", brand_id);
  if (proofErr) {
    console.error("proof_items read failed:", proofErr.message);
  }

  const extraContext = [
    ...differentiationContextBlocks(diffErr ? null : diffRow),
    ...clientBrainContextBlocks({
      services: config.services,
      locations: config.locations,
      pricing: config.pricing,
      proofItems: proofErr ? [] : (proofRows ?? []),
    }),
    ...renderVoiceNoteBlocks(rules),
  ];

  // ── Blog article branch (kitchen slice 1) ─────────────────────────────────
  // Same engine, brand voice, and moat (Market Brain + Editorial Memory via
  // configForGen + extraContext) as the LinkedIn path below — only the format
  // spec (Sonnet long-form), the parse, and the insert differ. Returns early so
  // the LinkedIn machinery (angles/source-hydration/Pangram/detection_dataset)
  // never runs for a blog. Published later to platform 'hosted'.
  if (format === "blog") {
    const brief = effectiveTopicHint?.trim();
    if (!brief) {
      return jsonError({ error: "A topic is required for a blog article" }, 400);
    }

    const initialStatus =
      config.approval_mode === "auto" ? "draft" : "pending_approval";
    const sourceType: "manual" | "auto_research" = topic_candidate_id
      ? "auto_research"
      : "manual";

    // Blog (and ONLY blog) fans out across every brand language; all other
    // formats stay primary-only. Each language is its own hosted `posts` row;
    // the rows share a slug so they land as locale-siblings of one article on
    // the hosted blog (brand_blog_posts unique (brand_id, slug, locale)).
    const languages = resolveBlogLanguages(
      brand.primary_language,
      brand.additional_languages,
    );
    if (languages.length === 0) {
      return jsonError(
        { error: "Brand has no primary language set", stage: "generate" },
        500,
      );
    }

    type BlogVariant = {
      language: string;
      title: string;
      body: string;
      excerpt: string | null;
      cacheReadTokens: number;
    };

    // Generate one article in a single language. Throws ClaudeError on failure.
    const generateOne = async (language: string): Promise<BlogVariant> => {
      const blog = await generateBlogArticle(
        configForGen,
        language,
        brief,
        { extraContext, angle, stance: effectiveStance },
      );
      const { title: parsedTitle, body, description } =
        parseBlogArticleOutput(blog.text);
      return {
        language,
        // hostedAdapter requires a non-empty title at publish; fall back to the
        // brief if the model skipped the TITLE line. Editable in the writer.
        title: parsedTitle ?? brief.slice(0, 200),
        body,
        excerpt: description,
        cacheReadTokens: blog.usage.cache_read_input_tokens,
      };
    };

    // The PRIMARY language drives the shared slug + the writer response, so it
    // is generated first and its failure is fatal (nothing is saved).
    let primaryVariant: BlogVariant;
    try {
      primaryVariant = await generateOne(languages[0]);
    } catch (err) {
      return generationErrorResponse(err);
    }

    // Shared slug for all language siblings. Empty (e.g. a non-latin primary
    // title) → null: each post then derives its own slug at publish (no sibling
    // link, acceptable fallback for a brand whose primary script has no slug).
    const sharedSlug = slugify(primaryVariant.title) || null;

    // Additional languages are best-effort and independent, so generate them
    // concurrently: total latency is ~max(language), not the sum (a 3-language
    // brand was ~3x a single generation, pushing the Vercel function limit).
    // One bad language must not sink the article — the primary is already in
    // hand, and allSettled keeps each failure isolated.
    const additionalVariants: BlogVariant[] = [];
    const additionalResults = await Promise.allSettled(
      languages.slice(1).map((language) => generateOne(language)),
    );
    additionalResults.forEach((result, i) => {
      if (result.status === "fulfilled") {
        additionalVariants.push(result.value);
        return;
      }
      const language = languages[i + 1];
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      console.error(`[generate] blog language '${language}' failed:`, msg);
    });

    // Insert one hosted post per generated language. Markdown is canonical for a
    // blog; content_text stays null (it's the LinkedIn short-text column). The
    // primary uses the atomic insert+mark-candidate RPC when a candidate drove
    // it (marks the candidate used exactly ONCE); additional languages are plain
    // inserts (no second mark). database.types.ts lags the migration (T-types),
    // so the RPC Args and the posts Insert row are cast to the generated types.
    const insertBlog = async (
      variant: BlogVariant,
      markCandidate: boolean,
    ): Promise<{ id: string } | { error: string }> => {
      if (markCandidate && topic_candidate_id) {
        const rpcArgs = {
          p_brand_id: brand_id,
          p_platform: "hosted",
          p_language: variant.language,
          p_content_text: null,
          p_detection_score: null,
          p_detection_breakdown: null,
          p_status: initialStatus,
          p_source_type: sourceType,
          p_candidate_id: topic_candidate_id,
          p_research_topic: resolvedCandidateText ?? undefined,
          p_title: variant.title,
          p_slug: sharedSlug ?? undefined,
          p_excerpt: variant.excerpt ?? undefined,
          p_content_markdown: variant.body,
        };
        const { data: rpcPost, error: rpcErr } = await supabase.rpc(
          "insert_post_and_mark_candidate",
          rpcArgs as unknown as Database["public"]["Functions"]["insert_post_and_mark_candidate"]["Args"],
        );
        if (rpcErr || !rpcPost) {
          return { error: rpcErr?.message ?? "Failed to save article (RPC)" };
        }
        const row = Array.isArray(rpcPost)
          ? (rpcPost[0] as { id: string } | undefined)
          : (rpcPost as { id: string });
        if (!row?.id) return { error: "RPC returned no post id" };
        return { id: row.id };
      }
      const insertRow = {
        brand_id,
        platform: "hosted",
        language: variant.language,
        content_text: null,
        content_markdown: variant.body,
        title: variant.title,
        slug: sharedSlug,
        excerpt: variant.excerpt,
        status: initialStatus,
        source_type: sourceType,
      };
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert(insertRow as unknown as TablesInsert<"posts">)
        .select("id")
        .single();
      if (postErr || !post) {
        return { error: postErr?.message ?? "Failed to save article" };
      }
      return { id: post.id };
    };

    const primaryInsert = await insertBlog(primaryVariant, true);
    if ("error" in primaryInsert) {
      return jsonError({ error: primaryInsert.error, stage: "save" }, 500);
    }
    const postId = primaryInsert.id;

    // Siblings are best-effort: a failed sibling save is logged, not fatal —
    // the primary article is already saved and usable.
    const siblings: Array<{ language: string; post_id: string }> = [];
    for (const variant of additionalVariants) {
      const ins = await insertBlog(variant, false);
      if ("error" in ins) {
        console.error(
          `[generate] blog sibling '${variant.language}' save failed:`,
          ins.error,
        );
        continue;
      }
      siblings.push({ language: variant.language, post_id: ins.id });
    }

    return Response.json({
      post_id: postId,
      content: primaryVariant.body,
      platform: "hosted",
      title: primaryVariant.title,
      excerpt: primaryVariant.excerpt,
      status: initialStatus,
      language: primaryVariant.language,
      siblings,
      cache_read_tokens: primaryVariant.cacheReadTokens,
      grounded: false,
      source: null,
    });
  }

  // Resolved article for the active angle (null = topic-gist framing). Used both
  // for the prompt and for the grounded/source response fields. Order:
  //   1. cached success extract (no fetch);
  //   2. else live fetch for article-using angles with a URL — best-effort cache
  //      the result (success or failed) so the next pick is instant;
  //   3. else null (apply, or no URL).
  let resolvedArticle: ArticleExtract | null = null;
  if (angle) {
    if (cachedArticle) {
      resolvedArticle = cachedArticle;
    } else if (ANGLES_USING_ARTICLE.has(angle) && sourceUrl) {
      const fetched = await fetchArticleExtract(sourceUrl);
      if (fetched.ok) {
        resolvedArticle = fetched.extract;
        if (topic_candidate_id) {
          const cached: CachedArticleExtract = {
            ...fetched.extract,
            fetchedAt: new Date().toISOString(),
          };
          const { error: cacheErr } = await supabase.rpc(
            "cache_topic_article",
            {
              p_candidate_id: topic_candidate_id,
              p_extract: cached as unknown as Json,
              p_status: "success",
            },
          );
          if (cacheErr) {
            console.error(
              "[generate] cache_topic_article (success) failed:",
              cacheErr.message,
            );
          }
        }
      } else if (topic_candidate_id) {
        const { error: cacheErr } = await supabase.rpc("cache_topic_article", {
          p_candidate_id: topic_candidate_id,
          p_extract: {} as unknown as Json,
          p_status: "failed",
        });
        if (cacheErr) {
          console.error(
            "[generate] cache_topic_article (failed) failed:",
            cacheErr.message,
          );
        }
      }
    }
  }

  let claude;
  try {
    if (angle) {
      const userText = buildAngleUserText(angle, {
        topicText: effectiveTopicHint ?? "",
        sourceUrl,
        article: resolvedArticle,
        stance: effectiveStance,
        brandName: brand.name,
      });
      claude = await generatePostFromUserMessage(
        configForGen,
        brand.primary_language,
        userText,
        { extraContext },
      );
    } else {
      claude = source_text
        ? await adaptToLinkedIn(
            configForGen,
            brand.primary_language,
            source_text,
            { extraContext },
          )
        : await generatePost(
            configForGen,
            brand.primary_language,
            effectiveTopicHint,
            "linkedin_post",
            { extraContext },
          );
    }
  } catch (err) {
    return generationErrorResponse(err);
  }

  let pangram: PangramResponse;
  try {
    pangram = await checkText(claude.text);
  } catch (err) {
    const msg = err instanceof PangramError ? err.message : "Detection failed";
    // CQ-2: 503 + no save. Caller shows retry toast.
    return jsonError({ error: msg, stage: "detection" }, 503);
  }

  const detectionScore = deriveDetectionScore(pangram);
  const initialStatus =
    config.approval_mode === "auto" ? "draft" : "pending_approval";
  // source_type 'auto_research' когда post came из topic_candidate (cron pool);
  // 'manual' for free-text topic_hint or source_text adapt.
  const sourceType: "manual" | "auto_research" = topic_candidate_id
    ? "auto_research"
    : "manual";

  // Two insert paths:
  // - With topic_candidate_id: use atomic RPC (D12) — INSERT posts +
  //   UPDATE topic_candidates.used_at in single transaction. Если update
  //   fails, post rollback'ит (no orphan, no duplicate impressions).
  // - Without candidate: direct insert (existing flow, backwards-compat).
  let postId: string;
  if (topic_candidate_id) {
    const { data: rpcPost, error: rpcErr } = await supabase.rpc(
      "insert_post_and_mark_candidate",
      {
        p_brand_id: brand_id,
        p_platform: "linkedin",
        p_language: brand.primary_language,
        p_content_text: claude.text,
        p_detection_score: detectionScore,
        p_detection_breakdown: pangram,
        p_status: initialStatus,
        p_source_type: sourceType,
        p_candidate_id: topic_candidate_id,
        p_research_topic: resolvedCandidateText ?? undefined,
      },
    );

    if (rpcErr || !rpcPost) {
      return jsonError(
        {
          error: rpcErr?.message ?? "Failed to save post (RPC)",
          stage: "save",
        },
        500,
      );
    }
    // RPC returns posts row (SetofOptions.isOneToOne=true in generated types).
    // supabase-js infers SetOf even with isOneToOne — cast to known shape.
    const row = Array.isArray(rpcPost)
      ? (rpcPost[0] as { id: string } | undefined)
      : (rpcPost as { id: string });
    if (!row?.id) {
      return jsonError(
        { error: "RPC returned no post id", stage: "save" },
        500,
      );
    }
    postId = row.id;
  } else {
    const { data: post, error: postErr } = await supabase
      .from("posts")
      .insert({
        brand_id,
        platform: "linkedin",
        language: brand.primary_language,
        content_text: claude.text,
        detection_score: detectionScore,
        detection_breakdown: pangram,
        status: initialStatus,
        source_type: sourceType,
      })
      .select("id")
      .single();

    if (postErr || !post) {
      return jsonError(
        { error: postErr?.message ?? "Failed to save post", stage: "save" },
        500,
      );
    }
    postId = post.id;
  }

  // Dataset insert via service-role. Non-fatal: a failed dataset write — or
  // missing SUPABASE_SERVICE_ROLE_KEY env — must not break the user-visible
  // flow. Sentry will pick this up once wired.
  try {
    const service = createServiceRoleClient();
    const { error: dsErr } = await service.from("detection_dataset").insert({
      account_id: brand.account_id,
      post_id: postId,
      text: claude.text,
      score: detectionScore,
      source: "generated",
      pangram_breakdown: pangram,
    });
    if (dsErr) {
      console.error("detection_dataset insert failed:", dsErr.message);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("service-role unavailable, skipping dataset write:", msg);
  }

  // Grounding honesty: `grounded` = the draft was written against a real source
  // article (cached or freshly fetched), not just the topic gist. `source`
  // carries the URL + title when a source URL exists (even if the fetch failed,
  // the URL is still meaningful for the "topic only" framing). Non-angle path is
  // always grounded:false / source:null so the client type stays stable.
  return Response.json({
    post_id: postId,
    content: claude.text,
    detection_score: detectionScore,
    detection_breakdown: pangram,
    status: initialStatus,
    cache_read_tokens: claude.usage.cache_read_input_tokens,
    grounded: resolvedArticle !== null,
    source: sourceUrl
      ? { url: sourceUrl, title: resolvedArticle?.title ?? null }
      : null,
  });
}
