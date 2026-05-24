import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "ru"] as const,
  defaultLocale: "en",
  // English at root (/...), Spanish at /es/..., Russian at /ru/...
  // SEO-friendly: no redirect from / to /en, default locale unprefixed.
  // Spanish app UI falls back to English (see i18n/request.ts deep-merge) until
  // es app strings are translated; the marketing landing is fully trilingual.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
