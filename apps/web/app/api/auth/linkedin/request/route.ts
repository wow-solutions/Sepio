import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, encodeState, LinkedInOAuthError } from "@/lib/linkedin-oauth";

// GET /api/auth/linkedin/request?brand_id=<uuid>
//
// Start of LinkedIn OAuth flow (ADR-0017 D6, deliverable 9.2).
//
// 1. Auth check (must be signed in to Sepio)
// 2. Verify brand_id belongs to this user (RLS-scoped read)
// 3. Build HMAC-signed state (encodes brand_id + timestamp; stateless —
//    no cookie needed, signature itself proves authenticity)
// 4. Redirect user to LinkedIn authorize URL with state

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brand_id");

  if (!brandId) {
    return NextResponse.json({ error: "brand_id query param required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // RLS ensures user only sees own brands.
  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  let authorizeUrl: string;
  try {
    const state = encodeState(brandId);
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    const msg = err instanceof LinkedInOAuthError ? err.message : "LinkedIn config missing";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.redirect(authorizeUrl);
}
