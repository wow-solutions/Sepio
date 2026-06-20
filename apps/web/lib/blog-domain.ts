import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { bareHost, isAppHost } from "@/lib/app-host";

// Resolved mapping for a client blog domain (e.g. blog.24clima.com → a brand).
export type BlogDomain = {
  brandId: string;
  brandName: string | null; // for first-party branding (brands has no anon RLS)
  primaryLocale: string; // brand's primary_language — served at the domain root
  locales: string[]; // additional_languages — served under /<locale>/...
};

// host → brand, via the public SECURITY DEFINER resolver (returns ACTIVE rows
// only). Wrapped in React cache() so multiple lookups in one request (page +
// generateMetadata + sitemap) hit the DB once. Returns null for app hosts and
// for any host with no active blog domain → caller renders notFound().
export const resolveBlogDomain = cache(
  async (host: string | null | undefined): Promise<BlogDomain | null> => {
    const h = bareHost(host);
    if (!h || isAppHost(h)) return null;

    const supabase = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase.rpc("resolve_blog_domain", {
      p_host: h,
    });
    if (error || !data) return null;
    const rows = data as Array<{
      brand_id: string;
      brand_name: string | null;
      primary_locale: string;
      locales: string[];
    }>;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      brandId: row.brand_id,
      brandName: row.brand_name,
      primaryLocale: row.primary_locale,
      locales: row.locales ?? [],
    };
  },
);

// Reverse lookup: does this brand publish to a client blog domain? Used by the
// sepio.app /p/<brandId> pages to noindex the duplicate once the brand has its
// own domain. Goes through the SECURITY DEFINER RPC (the table is owner-only
// RLS, so anon crawlers can't read it directly). Returns the active domain host
// or null. Cached per request.
export const activeBlogDomainForBrand = cache(
  async (brandId: string): Promise<string | null> => {
    const supabase = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase.rpc("blog_domain_for_brand", {
      p_brand_id: brandId,
    });
    if (error) return null;
    return (data as string | null) ?? null;
  },
);
