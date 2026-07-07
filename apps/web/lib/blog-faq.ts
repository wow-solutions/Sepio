// Pure parser: pull an FAQPage-ready Q&A list out of an article's markdown
// body. The generation prompt asks the model for a "short FAQ near the end",
// written as a normal markdown section (## heading + ### questions) in
// whatever language the article is written in — so matching is by heading
// pattern, not a fixed locale.

export type FaqPair = { question: string; answer: string };

const FAQ_HEADING_PATTERNS = [
  /\bfaqs?\b/i,
  /frequently asked/i,
  /preguntas frecuentes/i,
  /часто задаваемые/i,
  /вопросы и ответы/i,
];

function isFaqHeading(text: string): boolean {
  return FAQ_HEADING_PATTERNS.some((re) => re.test(text));
}

// Strip inline markdown so JSON-LD text fields are clean plain text: images
// are dropped entirely, links keep their label, emphasis/code markers are
// removed, and line breaks collapse to single spaces.
function toPlainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/_([^_]*)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Questions as ### sub-headings; the answer is the text up to the next ###.
function parseH3Pairs(sectionLines: string[]): FaqPair[] {
  const h3Indices: number[] = [];
  for (let i = 0; i < sectionLines.length; i++) {
    if (/^###\s+/.test(sectionLines[i])) h3Indices.push(i);
  }

  const pairs: FaqPair[] = [];
  for (let i = 0; i < h3Indices.length; i++) {
    const qi = h3Indices[i];
    const question = toPlainText(sectionLines[qi].replace(/^###\s+/, ""));
    const answerEnd =
      i + 1 < h3Indices.length ? h3Indices[i + 1] : sectionLines.length;
    const answer = toPlainText(sectionLines.slice(qi + 1, answerEnd).join("\n"));
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

// Questions as bold paragraph leads — the shape the generator actually emits:
//   **¿Cuánto cuesta...?**
//   El precio varía según...
// One paragraph per Q&A: the bold run is the question, the paragraph's
// remainder is the answer.
function parseBoldPairs(sectionLines: string[]): FaqPair[] {
  const paragraphs = sectionLines
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pairs: FaqPair[] = [];
  for (const para of paragraphs) {
    const m = para.match(/^\*\*(.+?)\*\*\s*([\s\S]+)$/);
    if (!m) continue;
    const question = toPlainText(m[1]);
    const answer = toPlainText(m[2]);
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

// Find the LAST H2 (## ...) whose heading text matches an FAQ pattern, then
// extract Q&A pairs from it — questions written either as ### sub-headings or
// as bold paragraph leads (what the generation prompt actually produces).
// Never throws — a markdown body that doesn't parse as expected just yields
// []. A single pair is treated as noise (e.g. a stray "### Question"
// elsewhere mis-detected), so at least 2 pairs are required.
export function parseFaqSection(markdown: string): FaqPair[] {
  try {
    const lines = markdown.split("\n");

    const h2Indices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) h2Indices.push(i);
    }

    let faqStart = -1;
    let faqEnd = lines.length;
    for (let i = h2Indices.length - 1; i >= 0; i--) {
      const idx = h2Indices[i];
      const heading = lines[idx].replace(/^##\s+/, "");
      if (isFaqHeading(heading)) {
        faqStart = idx;
        const next = h2Indices.find((h) => h > idx);
        faqEnd = next !== undefined ? next : lines.length;
        break;
      }
    }
    if (faqStart === -1) return [];

    const sectionLines = lines.slice(faqStart + 1, faqEnd);
    let pairs = parseH3Pairs(sectionLines);
    if (pairs.length < 2) pairs = parseBoldPairs(sectionLines);

    return pairs.length >= 2 ? pairs : [];
  } catch {
    return [];
  }
}
