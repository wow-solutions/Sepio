import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

// CQ-1 (plan-eng-review 2026-05-13): single helper for `?brand=<uuid>` resolution.
// All brand-scoped pages (writer, posts, settings) call this.
//
// Behaviour:
//   - no user                       → redirect /login
//   - no `brand` param              → redirect /dashboard
//   - malformed uuid                → notFound (404)
//   - brand not owned (RLS empty)   → notFound (404)
//   - brand soft-deleted            → notFound (404)
//
// Returns the brand row + the authenticated user id, so callers can use both
// without re-fetching.

export type Brand = Tables<"brands">;

export type BrandContext = {
  brand: Brand;
  userId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = { [key: string]: string | string[] | undefined };

function readBrandParam(params: SearchParams): string | null {
  const raw = params.brand;
  if (typeof raw !== "string") return null;
  return raw.trim() || null;
}

export async function getBrandFromRequest(
  searchParams: SearchParams,
): Promise<BrandContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const brandId = readBrandParam(searchParams);
  if (!brandId) redirect("/dashboard");
  if (!UUID_RE.test(brandId)) notFound();

  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!brand) notFound();

  return { brand, userId: user.id };
}
