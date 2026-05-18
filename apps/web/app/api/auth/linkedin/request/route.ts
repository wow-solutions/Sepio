import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, encodeState, LinkedInOAuthError } from "@/lib/linkedin-oauth";

// GET /api/auth/linkedin/request?brand_id=<uuid>
//
// Start of LinkedIn OAuth flow (ADR-0017 D6, deliverable 9.2).
//
// 1. Auth check (must be signed in to Quoteworthy)
// 2. Verify brand_id belongs to this user (RLS-scoped read)
// 3. Generate random nonce, set httpOnly cookie (CSRF check on /callback)
// 4. Encode state = base64url{ nonce, brand_id }
// 5. Redirect user to LinkedIn authorize URL with state

const NONCE_COOKIE = "linkedin_oauth_nonce";
const NONCE_TTL_SECONDS = 600; // 10 minutes

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

  // 32 bytes → 64 hex chars. More than enough entropy.
  const nonce = randomBytes(32).toString("hex");
  const state = encodeState(nonce, brandId);

  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    const msg = err instanceof LinkedInOAuthError ? err.message : "LinkedIn config missing";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NONCE_TTL_SECONDS,
    path: "/",
  });

  return NextResponse.redirect(authorizeUrl);
}
