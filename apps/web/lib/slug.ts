// Shared slugify. lowercase, strip accents, non-alphanumerics -> '-',
// collapse/trim dashes, cap length. Latin-only output: titles in scripts with
// no a-z mapping (e.g. Cyrillic) slugify to "" — the caller decides the
// fallback. Previously duplicated in blog-actions.ts and publishers/hosted.ts.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
