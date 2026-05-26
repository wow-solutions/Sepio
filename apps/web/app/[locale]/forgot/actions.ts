"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Sends a one-time recovery link. The link points at /auth/confirm (PKCE
// exchange) which then redirects to /reset where the user sets a new password.
// We always report success so the form can't be used to probe which emails
// have accounts.
export async function requestReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/forgot");

  const supabase = await createClient();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset`,
  });

  redirect("/forgot?sent=1");
}
