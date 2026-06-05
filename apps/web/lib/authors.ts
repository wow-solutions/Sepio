// Static author registry for the blog. One author for now (the founder).
//
// E-E-A-T: a real, named author with verifiable credentials is the strongest
// trust signal for both Google ranking and LLM citation. Posts reference an
// author by `author_slug` (a column on blog_posts); this file is the single
// source of truth for that author's identity, bio, and external profiles.
// No DB table — one author, zero churn. Add entries here when more authors join.

export type Author = {
  slug: string;
  name: string;
  role: string;
  // 2–4 factual sentences. No invented credentials, no numbers we can't stand behind.
  bio: string;
  // External profiles for Person JSON-LD `sameAs`.
  sameAs: string[];
};

const AUTHORS: Record<string, Author> = {
  "grigoriy-baranchuk": {
    slug: "grigoriy-baranchuk",
    name: "Grigoriy Baranchuk",
    role: "Founder, Sepio",
    bio: "Grigoriy Baranchuk is the founder of Sepio. He runs 24Clima, a B2B HVAC/R company in Panama, where the problem Sepio solves — turning deep operator expertise into content that customers and AI assistants actually trust — started as his own. He builds Sepio in public and writes here about generative engine optimization, expert-content systems, and what holds up when you ship them against real detectors and real buyers.",
    sameAs: ["https://www.linkedin.com/in/greg-baranchuk"],
  },
};

export function getAuthor(slug: string): Author | null {
  return AUTHORS[slug] ?? null;
}

export function allAuthorSlugs(): string[] {
  return Object.keys(AUTHORS);
}
