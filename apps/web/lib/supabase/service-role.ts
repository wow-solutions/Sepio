import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY.
// Bypasses RLS — use ONLY in server actions / API routes where the policy
// blocks the legitimate user-scoped write (e.g. detection_dataset insert,
// ADR-0014 D5).
//
// Never import from a client component. Importing into a client bundle would
// leak the key — this guard throws if it ever runs in a browser.

export function createServiceRoleClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "service-role client called from client bundle — server only",
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
