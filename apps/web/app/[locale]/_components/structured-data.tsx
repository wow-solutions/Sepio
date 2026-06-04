import { SITE_URL } from "@/lib/seo";

// Organization + WebSite + SoftwareApplication JSON-LD for the landing page.
// No pricing tiers / offers (confidential), no customer names. Rendered as a
// native <script type="application/ld+json"> per Next 16 guidance; the
// .replace below is the mandatory XSS mitigation for embedded JSON.
const GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Sepio",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: ["https://github.com/wow-solutions/Sepio"],
      description:
        "Sepio is the expert-content engine for marketing and content agencies — turning client expertise into multi-platform content optimized for generative engines (GEO).",
    },
    {
      "@type": "WebSite",
      name: "Sepio",
      url: SITE_URL,
    },
    {
      "@type": "SoftwareApplication",
      name: "Sepio",
      description:
        "Expert-content engine for agencies: extract client expertise, then generate multi-platform content in the client's brand voice, optimized for generative engine optimization (GEO) so AI assistants cite it.",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(GRAPH).replace(/</g, "\\u003c"),
      }}
    />
  );
}
