// POST /api/topics/[candidateId]/hydrate-source
//
// Warms (caches) the source-article extract for a topic candidate so the writer
// can show grounding state BEFORE generation and the generate route can skip the
// live fetch. Called when the user picks an article-using angle on a candidate.
//
// Auth: standard Supabase session. RLS on topic_candidates hides other brands'
// rows (→ 404). Cache writes go through the cache_topic_article SECURITY DEFINER
// RPC (ownership-checked via auth.uid()), best-effort: an RPC error is logged but
// never fails the response — we still return the computed status.
//
// Response (frozen contract, the writer depends on it exactly):
//   { status: 'success'|'failed'|'unavailable',
//     source: { url: string, title: string | null } | null }
//   - success:     a usable extract exists (cached or freshly fetched)
//   - failed:      a source URL exists but the fetch did not yield an extract
//   - unavailable: no source URL at all (free-text / non-web_search) — no DB write

import {
  fetchArticleExtract,
  deriveSourceUrl,
  type ArticleExtract,
} from "@/lib/_private/article-fetch";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

// Cached extract shape stored in topic_candidates.article_extract.
type CachedArticleExtract = ArticleExtract & { fetchedAt: string };

type HydrateStatus = "success" | "failed" | "unavailable";
type HydrateResponse = {
  status: HydrateStatus;
  source: { url: string; title: string | null } | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ candidateId: string }> },
): Promise<Response> {
  const { candidateId } = await ctx.params;
  if (!UUID_RE.test(candidateId)) {
    return jsonError("Invalid candidateId", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Not signed in", 401);

  // RLS hides other brands' candidates → maybeSingle null → 404.
  const { data: candidate, error: candidateErr } = await supabase
    .from("topic_candidates")
    .select(
      "id, brand_id, source, source_metadata, article_extract, article_extract_status",
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateErr) {
    return jsonError(`Candidate fetch failed: ${candidateErr.message}`, 500);
  }
  if (!candidate) {
    return jsonError("Topic candidate not found", 404);
  }

  // Cache hit (success): return the stored extract's url + title, no fetch.
  if (
    candidate.article_extract_status === "success" &&
    candidate.article_extract
  ) {
    const extract =
      candidate.article_extract as unknown as CachedArticleExtract;
    const body: HydrateResponse = {
      status: "success",
      source: { url: extract.sourceUrl, title: extract.title },
    };
    return Response.json(body);
  }

  // Cache hit (failed): a prior attempt failed. Surface the derived URL (if any)
  // so the writer can still link the source under the "topic only" framing.
  if (candidate.article_extract_status === "failed") {
    const url = deriveSourceUrl(candidate.source, candidate.source_metadata);
    const body: HydrateResponse = {
      status: "failed",
      source: url ? { url, title: null } : null,
    };
    return Response.json(body);
  }

  // Not attempted yet — derive the source URL.
  const sourceUrl = deriveSourceUrl(candidate.source, candidate.source_metadata);
  if (!sourceUrl) {
    // No real article link (free-text / non-web_search). Nothing to cache.
    const body: HydrateResponse = { status: "unavailable", source: null };
    return Response.json(body);
  }

  // Live fetch + best-effort cache (success or failed). RPC failure is logged but
  // never fatal — the computed status is still returned.
  const fetched = await fetchArticleExtract(sourceUrl);
  if (fetched.ok) {
    const cached: CachedArticleExtract = {
      ...fetched.extract,
      fetchedAt: new Date().toISOString(),
    };
    const { error: cacheErr } = await supabase.rpc("cache_topic_article", {
      p_candidate_id: candidate.id,
      p_extract: cached as unknown as Json,
      p_status: "success",
    });
    if (cacheErr) {
      console.error(
        "[hydrate-source] cache_topic_article (success) failed:",
        cacheErr.message,
      );
    }
    const body: HydrateResponse = {
      status: "success",
      source: { url: fetched.extract.sourceUrl, title: fetched.extract.title },
    };
    return Response.json(body);
  }

  const { error: cacheErr } = await supabase.rpc("cache_topic_article", {
    p_candidate_id: candidate.id,
    p_extract: {} as unknown as Json,
    p_status: "failed",
  });
  if (cacheErr) {
    console.error(
      "[hydrate-source] cache_topic_article (failed) failed:",
      cacheErr.message,
    );
  }
  const body: HydrateResponse = {
    status: "failed",
    source: { url: sourceUrl, title: null },
  };
  return Response.json(body);
}
