import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

// Deep-merge locale messages over English so a partially-translated locale (es)
// falls back to English for any missing key instead of throwing. ru.json is
// complete and overrides en wholesale; es.json only needs to override what it
// translates.
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(baseValue as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const en = (await import("../messages/en.json")).default as Messages;
  const messages =
    locale === "en"
      ? en
      : deepMerge(en, (await import(`../messages/${locale}.json`)).default as Messages);

  return { locale, messages };
});
