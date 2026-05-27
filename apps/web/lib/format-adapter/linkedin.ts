import {
  countEmoji,
  extractUrls,
  firstLine,
  formatHashtags,
  markdownToPlain,
  normalizeWhitespace,
  stripUrls,
} from "./text-utils";
import type { FormatAdapter, LinkedInPost, SourcePost } from "./types";

const HARD_LIMIT = 3000;
const SWEET_MAX = 2500;
const SHORT_MIN = 400;
const PREVIEW_FOLD = 140; // mobile "…more" cutoff
const MAX_EMOJI = 2;
const MAX_HASHTAGS = 3;

/** LinkedIn: plain text only (no markdown), in-body links hurt reach, ≤3 hashtags. */
export const linkedinAdapter: FormatAdapter<LinkedInPost> = {
  platform: "linkedin",
  adapt(post: SourcePost): LinkedInPost {
    const warnings: string[] = [];
    let body = normalizeWhitespace(markdownToPlain(post.text));

    // Body must be link-free; move any link to the first comment.
    const bodyUrls = extractUrls(body);
    if (bodyUrls.length) {
      warnings.push(
        `Moved ${bodyUrls.length} link(s) out of the body (in-body links suppress LinkedIn reach).`,
      );
      body = normalizeWhitespace(stripUrls(body));
    }
    const firstComment = post.ctaUrl?.trim() || bodyUrls[0] || null;

    // Hashtags: cap to 3, append at the end.
    if (post.hashtags && post.hashtags.length > MAX_HASHTAGS) {
      warnings.push(`Trimmed hashtags to ${MAX_HASHTAGS} (≥10 risks a visibility penalty).`);
    }
    const tags = formatHashtags(post.hashtags, MAX_HASHTAGS);
    const text = tags ? `${body}\n\n${tags}` : body;

    // Rule-based can't safely rewrite the hook or re-split sentences — warn instead.
    const emoji = countEmoji(text);
    if (emoji > MAX_EMOJI) {
      warnings.push(`${emoji} emoji — LinkedIn flags emoji walls; aim for ≤${MAX_EMOJI}.`);
    }
    if (text.length > HARD_LIMIT) {
      warnings.push(`${text.length} chars exceeds LinkedIn's ${HARD_LIMIT}-char hard limit.`);
    } else if (text.length > SWEET_MAX) {
      warnings.push(`${text.length} chars is above the ~${SWEET_MAX} sweet spot.`);
    } else if (text.length < SHORT_MIN) {
      warnings.push(`${text.length} chars is short; 1300–2000 tends to perform best.`);
    }
    if (firstLine(body).length > PREVIEW_FOLD) {
      warnings.push(`First line >${PREVIEW_FOLD} chars; the hook may be cut before "…more".`);
    }

    return {
      platform: "linkedin",
      text,
      firstComment,
      imageUrl: post.imageUrl ?? null,
      warnings,
    };
  },
};
