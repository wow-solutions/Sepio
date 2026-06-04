import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders post markdown the same way as the legal pages: react-markdown builds
// a React tree (no dangerouslySetInnerHTML, no rehype-raw — raw HTML stays
// inert, XSS-safe). remarkGfm enables GFM tables (critical for GEO).
export function BlogBody({ source }: { source: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>;
}
