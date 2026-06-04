// Shared, PUBLIC angle identifiers for the "angle of approach" picker.
//
// SAFE to import from client components — this file contains NO prompt text.
// The moat prompt templates live in `lib/_private/angles.ts` (server-only); a
// client component must never import that, or the templates ship in the browser
// bundle. The writer UI imports the ids/labels-keys from here; the generate
// route imports the builder from _private.

export const ANGLE_IDS = [
  "retell",
  "comment",
  "apply",
  "contrarian",
  "lesson",
] as const;

export type AngleId = (typeof ANGLE_IDS)[number];

// Angles that benefit from the source article body. The generate route fetches
// the candidate's source_url server-side for these (when present); `apply`
// works from the topic gist alone, so it skips the fetch (keeps latency down).
export const ANGLES_USING_ARTICLE: ReadonlySet<AngleId> = new Set<AngleId>([
  "retell",
  "comment",
  "contrarian",
  "lesson",
]);

// Comment angle is the only one with an extra input branch (founder spec:
// "list then branching"). Like / dislike — no "neutral" (it produces bland
// output and the founder framed it as нравится/не нравится).
export type StanceSentiment = "like" | "dislike";
export type Stance = { sentiment: StanceSentiment; note: string };
