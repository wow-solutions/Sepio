import { SITE_URL, localizedUrl } from "@/lib/seo";
import type { BlogPostListRow, BlogPostRow } from "@/lib/blog";

// Native <script type="application/ld+json"> with the mandatory XSS escape
// (.replace(/</g, "\\u003c")), mirroring app/[locale]/_components/structured-data.tsx.
// undefined values are dropped by JSON.stringify, so optional keys stay clean.

const PUBLISHER = {
  "@type": "Organization",
  name: "Sepio",
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.svg` },
};

// Google guidance: headline <= 110 chars.
function headline(title: string): string {
  return title.length > 110 ? `${title.slice(0, 107)}…` : title;
}

function LdScript({ graph }: { graph: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function BlogPostJsonLd({ post }: { post: BlogPostRow }) {
  const canonical = localizedUrl("en", `blog/${post.slug}`);
  const blogUrl = localizedUrl("en", "blog");
  const home = localizedUrl("en", "");
  const img = post.cover_image_url ?? post.og_image_url ?? undefined;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: headline(post.title),
        description: post.description ?? undefined,
        datePublished: post.published_at ?? undefined,
        dateModified:
          post.material_updated_at ?? post.published_at ?? undefined,
        author: post.author_name
          ? {
              "@type": "Person",
              name: post.author_name,
              ...(post.author_slug
                ? { url: localizedUrl("en", `authors/${post.author_slug}`) }
                : {}),
            }
          : undefined,
        publisher: PUBLISHER,
        image: img ? [img] : undefined,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        inLanguage: "en",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: home },
          { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: canonical,
          },
        ],
      },
    ],
  };

  return <LdScript graph={graph} />;
}

export function BlogIndexJsonLd({ posts }: { posts: BlogPostListRow[] }) {
  const blogUrl = localizedUrl("en", "blog");
  const home = localizedUrl("en", "");

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": blogUrl,
        url: blogUrl,
        name: "Sepio Blog",
        inLanguage: "en",
        publisher: PUBLISHER,
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: headline(p.title),
          url: localizedUrl("en", `blog/${p.slug}`),
          datePublished: p.published_at ?? undefined,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: home },
          { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
        ],
      },
    ],
  };

  return <LdScript graph={graph} />;
}
