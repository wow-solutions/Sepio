import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bumpSourceVersionIfSource } from "./source-version";

function fakeClient(error: { message: string } | null = null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    calls,
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { error };
    },
  };
  return client;
}

describe("bumpSourceVersionIfSource", () => {
  test("no-op when the post is a variant (variant_state !== 'source')", async () => {
    const c = fakeClient();
    await bumpSourceVersionIfSource(c as unknown as SupabaseClient, {
      content_group_id: "g1",
      variant_state: "synced",
    });
    expect(c.calls).toHaveLength(0);
  });

  test("no-op when the post has no content group yet", async () => {
    const c = fakeClient();
    await bumpSourceVersionIfSource(c as unknown as SupabaseClient, {
      content_group_id: null,
      variant_state: "source",
    });
    expect(c.calls).toHaveLength(0);
  });

  test("calls increment_source_version for a group source", async () => {
    const c = fakeClient();
    await bumpSourceVersionIfSource(c as unknown as SupabaseClient, {
      content_group_id: "group-123",
      variant_state: "source",
    });
    expect(c.calls).toEqual([
      { name: "increment_source_version", args: { p_group_id: "group-123" } },
    ]);
  });

  test("a failed bump does not throw (best-effort)", async () => {
    const c = fakeClient({ message: "rls denied" });
    await expect(
      bumpSourceVersionIfSource(c as unknown as SupabaseClient, {
        content_group_id: "group-123",
        variant_state: "source",
      }),
    ).resolves.toBeUndefined();
  });
});
