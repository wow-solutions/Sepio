"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteSecret } from "@/lib/vault";

export async function disconnectLinkedIn(brandId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // RLS-checked ownership read
  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) throw new Error("Brand not found");

  // Use service role for the token row (RLS may block direct delete depending
  // on policy; we already verified ownership above).
  const service = createServiceRoleClient();
  const { data: token } = await service
    .from("brand_oauth_tokens")
    .select("id, vault_secret_id")
    .eq("brand_id", brandId)
    .eq("platform", "linkedin")
    .maybeSingle();

  if (!token) {
    revalidatePath(`/brands/${brandId}`);
    return;
  }

  if (token.vault_secret_id) {
    await deleteSecret(token.vault_secret_id).catch((err) => {
      console.error("Failed to delete vault secret (continuing):", err);
    });
  }

  await service.from("brand_oauth_tokens").delete().eq("id", token.id);
  revalidatePath(`/brands/${brandId}`);
}
