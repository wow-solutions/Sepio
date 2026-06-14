import type { SupabaseClient } from "@supabase/supabase-js";

// After a SOURCE article is edited, bump its content group's source_version so
// existing channel variants go stale (isVariantFresh compares their
// generated_from_source_version against the group's) and get regenerated on the
// next fan-out — instead of the kitchen serving variants that don't reflect the
// edit. No-op for posts that aren't a group source (variants, or sources with no
// variants generated yet — no content_group_id).
//
// Best-effort: a failed bump must not fail the user's save. We log and move on;
// the next edit retries the bump.
export async function bumpSourceVersionIfSource(
  supabase: SupabaseClient,
  post: { content_group_id: string | null; variant_state: string | null },
): Promise<void> {
  if (!post.content_group_id || post.variant_state !== "source") return;
  const { error } = await supabase.rpc("increment_source_version", {
    p_group_id: post.content_group_id,
  });
  if (error) {
    console.error("increment_source_version failed:", error.message);
  }
}
