import { firstLine, normalizeWhitespace, truncate } from "./text-utils";
import type { BlogPost, FormatAdapter, SourcePost } from "./types";

const TITLE_MAX = 60; // title tag
const META_MAX = 160; // meta description
const META_MIN = 120;
const TOC_WORDS = 1000;

/**
 * Blog / SEO article. Mostly metadata derivation + passthrough: deep
 * restructuring (query-style H2/H3, TL;DR generation) is LLM territory and
 * deferred to Phase 2, so here we derive title/meta, guarantee one H1, and
 * warn about structure rather than guessing.
 */
export const blogAdapter: FormatAdapter<BlogPost> = {
  platform: "blog",
  adapt(post: SourcePost): BlogPost {
    const warnings: string[] = [];
    const body = normalizeWhitespace(post.text);

    const rawTitle = firstLine(body).replace(/^#{1,6}\s+/, "");
    const title = rawTitle.length > TITLE_MAX ? truncate(rawTitle, TITLE_MAX) : rawTitle;
    if (rawTitle.length > TITLE_MAX) warnings.push(`Title shortened to ≤${TITLE_MAX} chars for the title tag.`);

    // Guarantee exactly one H1.
    let bodyMarkdown = body;
    if (!/^#\s+/.test(body)) {
      bodyMarkdown = `# ${title}\n\n${body}`;
      warnings.push("Added an H1 from the first line (Phase 2 LLM can restructure headings).");
    }

    // Meta description: body prose without heading lines, 150–160 target.
    const prose = body
      .replace(/^#{1,6}\s+.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    const metaDescription = truncate(prose, META_MAX);
    if (prose.length < META_MIN) {
      warnings.push(`Meta description is short (<${META_MIN} chars); 150–160 is ideal.`);
    }

    // Structure warnings (restructuring deferred to Phase 2).
    if (!/^#{2,3}\s+/m.test(bodyMarkdown)) {
      warnings.push("No H2/H3 subheadings — search favors query-style section headings.");
    }
    const words = body.split(/\s+/).filter(Boolean).length;
    if (words > TOC_WORDS) warnings.push(`~${words} words — add a table of contents (>${TOC_WORDS} words).`);
    if (post.imageUrl) warnings.push("Image present — set descriptive alt text + an ~1200×630 OG image on publish.");

    return { platform: "blog", title, metaDescription, bodyMarkdown, warnings };
  },
};
