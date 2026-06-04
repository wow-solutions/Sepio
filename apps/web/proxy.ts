import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";
import type { Database } from "@/lib/supabase/database.types";

const intlMiddleware = createIntlMiddleware(routing);

// Combined proxy (Next.js 16 convention, replaces middleware.ts):
//   - /api/* routes get Supabase session refresh only (no i18n routing)
//   - All other routes get next-intl locale routing first, then Supabase
//     cookies are written to the intl-routed response (so session stays fresh
//     even when the response is a locale redirect/rewrite)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes are never localized. If an accidental locale prefix slipped in
  // (e.g. an i18n <Link> wrapped an /api/* href), rewrite it back to /api/*
  // so the route handler is actually reached. Then skip i18n entirely —
  // only Supabase session refresh runs for /api/*.
  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/api\/)/, "");
  if (stripped !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.rewrite(url);
  }
  if (pathname.startsWith("/api")) {
    return updateSession(request);
  }

  const intlResponse = intlMiddleware(request);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            intlResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session so server components see the latest auth state.
  await supabase.auth.getUser();

  return intlResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals, favicon, metadata routes (sitemap/robots), and
    // static files. sitemap.xml/robots.txt must reach their app/ route handlers,
    // not be swallowed by intl locale routing (would 404).
    "/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
