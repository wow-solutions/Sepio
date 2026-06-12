"use server";

import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { bodyUpdateForPlatform, maxBodyChars } from "@/lib/post-body";

// Save edits to a post. Status unchanged. Detection score is NOT re-checked
// here — the right-rail score may go stale until the user re-generates or
// (Sprint 2) hits a Re-check button.
//
// Platform-aware column (kitchen, via lib/post-body): a blog article (platform
// 'hosted') stores its body in content_markdown — the canonical column the
// hosted publisher reads. If an edited blog saved to content_text instead,
// publish would ship the STALE original. So hosted edits write content_markdown
// (+ the title field); LinkedIn and the rest keep content_text.

export type SavePostResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveDraft(
  postId: string,
  content: string,
  title?: string | null,
): Promise<SavePostResult> {
  if (!postId) return { ok: false, error: "Missing post id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Read platform + status: platform picks the body column/cap, status guards
  // against editing a published post. RLS scopes this to the user's own posts.
  const { data: post, error: readErr } = await supabase
    .from("posts")
    .select("platform, status")
    .eq("id", postId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!post) return { ok: false, error: "Post not found" };
  if (post.status === "published") {
    return { ok: false, error: "Cannot edit a published post" };
  }

  if (content.length > maxBodyChars(post.platform)) {
    return { ok: false, error: "Content too long" };
  }

  const now = new Date().toISOString();
  // title is not in the generated Update type yet (T-types lag), so assemble an
  // untyped patch and cast on the way into the typed builder.
  const patch: Record<string, unknown> = {
    ...bodyUpdateForPlatform(post.platform, content),
    updated_at: now,
  };
  if (post.platform === "hosted" && typeof title === "string") {
    patch.title = title.trim() || null;
  }

  // .neq guard (defense-in-depth): if the post was published between the read
  // and here (another tab/user), the update touches 0 rows instead of mutating
  // a live post.
  const { error } = await supabase
    .from("posts")
    .update(patch as TablesUpdate<"posts">)
    .eq("id", postId)
    .neq("status", "published");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
