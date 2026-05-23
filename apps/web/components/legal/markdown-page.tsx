import { promises as fs } from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownPageProps = {
  file: "privacy.md" | "terms.md";
};

export async function MarkdownPage({ file }: MarkdownPageProps) {
  const source = await fs.readFile(
    path.join(process.cwd(), "content", "legal", file),
    "utf8",
  );

  return (
    <article
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 24px 96px",
        color: "var(--ink)",
        fontSize: 15,
        lineHeight: 1.7,
      }}
      className="legal-prose"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </article>
  );
}
