import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generatePost, adaptToLinkedIn, ClaudeError } from "@/lib/claude";
import {
  checkText,
  deriveDetectionScore,
  PangramError,
  type PangramResponse,
} from "@/lib/pangram";

// POST /api/posts/generate
//
// Flow (design doc 2026-05-13 §Data flow, ADR-0014):
//   1. Auth check
//   2. Validate {brand_id, topic_hint?}
//   3. Fetch brand + brand_configs (RLS enforces ownership)
//   4. Claude generates draft
//   5. Pangram check on draft — CQ-2: on fail, return 503, do NOT save
//   6. Insert post (status from approval_mode: manual → pending_approval, auto → draft)
//   7. Insert detection_dataset row via service-role (RLS blocks user direct insert)

// Either topic_hint (generate from prompt) or source_text (adapt longer
// article into a LinkedIn post). Exactly one should be provided; if both,
// source_text wins.
const RequestSchema = z.object({
  brand_id: z.string().uuid(),
  topic_hint: z.string().max(500).optional(),
  source_text: z.string().min(50).max(30_000).optional(),
});

type ErrorBody = { error: string; stage?: "generate" | "detection" | "save" };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

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
  const { brand_id, topic_hint, source_text } = parsed.data;

  // Fetch brand + config (RLS prevents reading another user's brand).
  const { data: brand } = await supabase
    .from("brands")
    .select("id, account_id, primary_language")
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

  let claude;
  try {
    claude = source_text
      ? await adaptToLinkedIn(config, brand.primary_language, source_text)
      : await generatePost(config, brand.primary_language, topic_hint);
  } catch (err) {
    const msg = err instanceof ClaudeError ? err.message : "Generate failed";
    const status = err instanceof ClaudeError && err.status === 401 ? 500 : 502;
    return jsonError({ error: msg, stage: "generate" }, status);
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
      source_type: "manual",
    })
    .select("id")
    .single();

  if (postErr || !post) {
    return jsonError(
      { error: postErr?.message ?? "Failed to save post", stage: "save" },
      500,
    );
  }

  // Dataset insert via service-role. Non-fatal: a failed dataset write — or
  // missing SUPABASE_SERVICE_ROLE_KEY env — must not break the user-visible
  // flow. Sentry will pick this up once wired.
  try {
    const service = createServiceRoleClient();
    const { error: dsErr } = await service.from("detection_dataset").insert({
      account_id: brand.account_id,
      post_id: post.id,
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

  return Response.json({
    post_id: post.id,
    content: claude.text,
    detection_score: detectionScore,
    detection_breakdown: pangram,
    status: initialStatus,
    cache_read_tokens: claude.usage.cache_read_input_tokens,
  });
}
