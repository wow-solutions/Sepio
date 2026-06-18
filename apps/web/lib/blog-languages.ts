// Languages a blog article is generated in.
//
// The blog format fans out across ALL of a brand's languages (primary +
// additional); every OTHER format (LinkedIn, Telegram, carousels) stays
// primary-only. Each generated language becomes its own hosted `posts` row;
// the rows share a slug so they land as locale-siblings of one article on the
// hosted blog (brand_blog_posts is keyed by (brand_id, slug, locale)).
//
// Returns the primary first, then each additional language once. The primary is
// removed from the additional set, and empties / duplicates are dropped, so the
// caller can loop the result directly and generate one post per entry.
export function resolveBlogLanguages(
  primary: string,
  additional: readonly string[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const lang = raw.trim();
    if (!lang || seen.has(lang)) return;
    seen.add(lang);
    out.push(lang);
  };
  push(primary);
  for (const l of additional ?? []) push(l);
  return out;
}
