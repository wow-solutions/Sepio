import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { SITE_URL, localizedUrl } from "@/lib/seo";
import { BlogShell } from "../shell";

type Params = Promise<{ locale: string }>;

const TITLE = "Editorial policy — Sepio";
const DESCRIPTION =
  "How the Sepio blog is written: we answer the question first, source our claims, and are honest about how the work gets made.";

// Public-facing editorial principles. These are deliberately principles, not a
// playbook — what we learned, at the level of the lesson, never a step-by-step
// recipe of our live system. (The internal pre-publish firewall lives in
// lib/_private/blog-firewall.ts.)
const PRINCIPLES: { heading: string; body: string }[] = [
  {
    heading: "We answer the question first",
    body: "Every post leads with a direct answer in its opening lines, then explains and qualifies. If you only read the first paragraph, you should still get the point.",
  },
  {
    heading: "One claim per section, with its source",
    body: "Claims that can be checked carry a source and a date. Where we ran our own test, we say what we measured and when, so you can judge it for yourself.",
  },
  {
    heading: "We are honest about how the work gets made",
    body: "Sepio is an AI content engine. We use AI to draft what you read here, and we say so plainly. A named human author stands behind every post and is accountable for it.",
  },
  {
    heading: "We publish principles, not playbooks",
    body: "We write about what we learned building Sepio — including what failed — at the level of the lesson, not as a step-by-step recipe of our live system. The goal is to be useful, not to be copied.",
  },
  {
    heading: "Corrections are dated and stay visible",
    body: "When we get something wrong, we fix it in place and note when it changed. We would rather show our edits than quietly rewrite history.",
  },
  {
    heading: "No claims we cannot stand behind",
    body: "We do not name tools or tactics for effect, and we do not promise outcomes we have not tested. Trust is the product; a broken claim costs more than a missing one.",
  },
];

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const l = (locale as Locale) ?? "en";
  // en-only content: canonical-only, no hreflang.
  const canonical = localizedUrl("en", "blog/editorial-policy");
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: TITLE,
      description: DESCRIPTION,
      url: localizedUrl(l, "blog/editorial-policy"),
      siteName: "Sepio",
    },
  };
}

function EditorialPolicyJsonLd() {
  const canonical = localizedUrl("en", "blog/editorial-policy");
  const graph = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: TITLE,
    description: DESCRIPTION,
    url: canonical,
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: "Sepio",
      url: SITE_URL,
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export default async function EditorialPolicyPage({
  params,
}: {
  params: Params;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <BlogShell>
      <EditorialPolicyJsonLd />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 24px 96px",
          color: "var(--ink)",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}
        >
          Editorial policy
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--ink-faint)",
            margin: "0 0 40px",
          }}
        >
          {DESCRIPTION}
        </p>

        {PRINCIPLES.map((p) => (
          <section key={p.heading} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 600,
                margin: "0 0 6px",
                letterSpacing: "-0.005em",
              }}
            >
              {p.heading}
            </h2>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: "var(--ink-muted, var(--ink))",
                margin: 0,
              }}
            >
              {p.body}
            </p>
          </section>
        ))}
      </div>
    </BlogShell>
  );
}
