// Pure text helpers shared by the platform adapters. No I/O, no platform logic.

const BOLD_UPPER = 0x1d5d4; // 𝗔  Mathematical Sans-Serif Bold Capital A
const BOLD_LOWER = 0x1d5ee; // 𝗮  Mathematical Sans-Serif Bold Small A
const BOLD_DIGIT = 0x1d7ec; // 𝟬  Mathematical Sans-Serif Bold Digit Zero

/**
 * Map ASCII letters/digits to unicode sans-serif bold glyphs. Non-ASCII
 * (Cyrillic, accented Latin, punctuation, emoji) passes through unchanged —
 * those just stay non-bold rather than breaking.
 */
export function toUnicodeBold(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x41 && cp <= 0x5a) out += String.fromCodePoint(BOLD_UPPER + (cp - 0x41));
    else if (cp >= 0x61 && cp <= 0x7a) out += String.fromCodePoint(BOLD_LOWER + (cp - 0x61));
    else if (cp >= 0x30 && cp <= 0x39) out += String.fromCodePoint(BOLD_DIGIT + (cp - 0x30));
    else out += ch;
  }
  return out;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** Count emoji (Extended_Pictographic codepoints). */
export function countEmoji(input: string): number {
  return (input.match(EMOJI_RE) ?? []).length;
}

/** Escape the three HTML-significant characters for Telegram HTML parse mode. */
export function htmlEscape(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Collapse 3+ consecutive blank lines to one, strip trailing spaces, trim ends. */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const URL_RE = /https?:\/\/[^\s)]+/g;

/** All http(s) URLs found in the text. */
export function extractUrls(input: string): string[] {
  return input.match(URL_RE) ?? [];
}

/** Remove http(s) URLs and tidy the leftover whitespace. */
export function stripUrls(input: string): string {
  return input.replace(URL_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n");
}

/**
 * LinkedIn has no markdown: convert markdown bold (double-asterisk or
 * double-underscore) to unicode-bold glyphs, drop heading markers and code
 * ticks, and flatten [text](url) to its text. Italic markers are left as-is
 * (no clean unicode italic for mixed scripts).
 */
export function markdownToPlain(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1") // [text](url) → text
    .replace(/(\*\*|__)(.+?)\1/g, (_m, _d, inner) => toUnicodeBold(inner)) // bold → unicode
    .replace(/^#{1,6}\s+/gm, "") // # heading markers
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1"); // `code` ticks
}

/** First non-empty line of the text. */
export function firstLine(input: string): string {
  const lines = input.split("\n");
  for (const l of lines) if (l.trim()) return l.trim();
  return "";
}

/** Normalize hashtags (strip leading '#', drop blanks), cap to `max`, join with spaces. */
export function formatHashtags(tags: string[] | undefined, max: number): string {
  if (!tags?.length) return "";
  return tags
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, max)
    .map((t) => `#${t}`)
    .join(" ");
}

/** Truncate to `max` chars on a word boundary where possible, adding an ellipsis. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const slice = input.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}
