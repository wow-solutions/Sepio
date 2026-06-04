// GET /api/brands/[brandId]/topics — return top-5 unused candidates для /writer UI.
//
// Auth: standard Supabase session. RLS на topic_candidates ограничивает чтение
// своими брендами (через brand_id → brands.account_id).
//
// Side effect: fire-and-forget impressions_count increment via
// increment_topic_impressions RPC. Doesn't block response — stats are
// eventually-consistent (per D4 design decision).

import { after } from "next/server";
import { selectTopN, type Scorable } from "@/lib/_private/topic-scorer";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TopicResponseRow = {
  id: string;
  topic_text: string;
  source: string;
  source_metadata: unknown;
  score: number | null;
  created_at: string;
  // 'success' | 'failed' | null — lets the picker badge already-hydrated topics.
  article_extract_status: string | null;
};

type TopicsResponse = {
  topics: TopicResponseRow[];
  pool_total: number;
};

type ErrorBody = { error: string };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  const { brandId } = await ctx.params;
  if (!UUID_RE.test(brandId)) {
    return jsonError({ error: "Invalid brand_id" }, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError({ error: "Not signed in" }, 401);

  // Fetch unused, unexpired candidates. RLS blocks other brands automatically.
  // Take a generous pool (up to 20) — scorer will pick top-5 with quota.
  const { data: pool, error } = await supabase
    .from("topic_candidates")
    .select(
      "id, topic_text, source, source_metadata, score, created_at, article_extract_status",
    )
    .eq("brand_id", brandId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return jsonError({ error: error.message }, 500);
  }

  // Scorer needs Scorable shape: { source, score }
  const scorable = (pool ?? []).map((p) => p as Scorable & TopicResponseRow);
  const top = selectTopN(scorable);

  // Fire-and-forget impressions update. RPC handles ownership check internally
  // via SECURITY DEFINER + auth.uid() join. Failure non-fatal — stats are
  // eventually-consistent.
  if (top.length > 0) {
    const candidateIds = top.map((t) => t.id);
    after(async () => {
      const { error: rpcErr } = await supabase.rpc(
        "increment_topic_impressions",
        { p_candidate_ids: candidateIds },
      );
      if (rpcErr) {
        console.error(
          "[topics] increment_topic_impressions failed:",
          rpcErr.message,
        );
      }
    });
  }

  const body: TopicsResponse = {
    topics: top.map((t) => ({
      id: t.id,
      topic_text: t.topic_text,
      source: t.source,
      source_metadata: t.source_metadata,
      score: t.score,
      created_at: t.created_at,
      article_extract_status: t.article_extract_status,
    })),
    pool_total: pool?.length ?? 0,
  };

  return Response.json(body);
}
