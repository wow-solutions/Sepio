"use server";

import { createClient } from "@/lib/supabase/server";

// Save edits to a post's content_text. Status unchanged. Detection score is
// NOT re-checked here — the right-rail score may go stale until the user
// re-generates or (Sprint 2) hits a Re-check button.

export type SavePostResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveDraft(
  postId: string,
  content: string,
): Promise<SavePostResult> {
  if (!postId) return { ok: false, error: "Missing post id" };
  if (content.length > 10_000) {
    return { ok: false, error: "Content too long (10k char limit)" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("posts")
    .update({ content_text: content, updated_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
