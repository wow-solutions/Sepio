"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Sets a new password. Requires the recovery session established by the link
// from /auth/confirm. Error tokens (tooShort/mismatch) are mapped to localized
// strings on the page; anything else is shown raw.
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) redirect("/reset?error=tooShort");
  if (password !== confirm) redirect("/reset?error=mismatch");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}
