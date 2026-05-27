import { countEmoji, formatHashtags, htmlEscape, normalizeWhitespace, truncate } from "./text-utils";
import type { FormatAdapter, SourcePost, TelegramPost } from "./types";

const CAPTION_LIMIT = 1024; // photo caption
const MESSAGE_LIMIT = 4096; // standalone message
const MAX_HASHTAGS = 3;

/**
 * Telegram channel post via Bot API. We use HTML parse mode (chosen over
 * MarkdownV2 to avoid its escaping minefield: `_*[]()~\`>#+-=|{}.!`).
 * Length limits apply to the VISIBLE text (entities are metadata), so we cap
 * the plain content first, then format — that also keeps HTML tags balanced.
 */
export const telegramAdapter: FormatAdapter<TelegramPost> = {
  platform: "telegram",
  adapt(post: SourcePost): TelegramPost {
    const warnings: string[] = [];
    const asCaption = Boolean(post.imageUrl);
    const limit = asCaption ? CAPTION_LIMIT : MESSAGE_LIMIT;

    let visible = normalizeWhitespace(post.text);

    // Hashtags act as in-channel filters; cap to 3, append.
    if (post.hashtags && post.hashtags.length > MAX_HASHTAGS) {
      warnings.push(`Trimmed hashtags to ${MAX_HASHTAGS}.`);
    }
    const tags = formatHashtags(post.hashtags, MAX_HASHTAGS);
    if (tags) visible = `${visible}\n\n${tags}`;

    // Cap visible length (splitting into multiple posts is a Lane C client concern).
    if (visible.length > limit) {
      warnings.push(
        `Text ${visible.length} > ${limit} chars (${asCaption ? "photo caption" : "message"}); truncated — consider splitting.`,
      );
      visible = truncate(visible, limit);
    }

    const emoji = countEmoji(visible);
    if (emoji > 8) warnings.push(`${emoji} emoji — keep them purposeful, not a flood.`);

    // Format last: HTML-escape, then bold the first non-empty line as the headline.
    let headlineDone = false;
    const text = htmlEscape(visible)
      .split("\n")
      .map((line) => {
        if (!headlineDone && line.trim()) {
          headlineDone = true;
          return `<b>${line}</b>`;
        }
        return line;
      })
      .join("\n");

    return {
      platform: "telegram",
      text,
      parseMode: "HTML",
      disableWebPagePreview: !asCaption,
      asCaption,
      warnings,
    };
  },
};
