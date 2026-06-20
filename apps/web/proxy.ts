import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";
import { isAppHost } from "@/lib/app-host";
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

  // Client blog domains (blog.client.com) are served by the multi-tenant
  // /sites renderer, not the localized app. Decide by host alone here (the
  // proxy must not do data fetching — Next 16 proxy guidance); the actual
  // host→brand resolution happens in the /sites server component (cached).
  // NOTE: the folder is app/sites (NOT app/_sites — a leading underscore is a
  // Next private folder, excluded from routing). robots.txt / sitemap.xml /
  // feed.xml are excluded by `matcher` below, so they reach their host-aware
  // route handlers directly on the client domain.
  if (!isAppHost(request.headers.get("host"))) {
    const url = request.nextUrl.clone();
    // Root "/" → "/sites" (NOT "/sites/": a trailing slash would 308-redirect
    // and miss the optional catch-all). "/slug" → "/sites/slug".
    url.pathname = pathname === "/" ? "/sites" : `/sites${pathname}`;
    return NextResponse.rewrite(url);
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
    // static files. sitemap.xml/robots.txt/feed.xml must reach their app/ route
    // handlers, not be swallowed by intl locale routing (would 404).
    "/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|feed\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
