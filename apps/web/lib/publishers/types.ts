// Publisher adapter contract (Posting Pipeline, Task 1 / Phase 3+5).
//
// A dispatcher routes a generated `posts` row to a destination by platform.
// Each destination implements `PublishAdapter`. The dispatcher resolves
// adapter-specific config (brand slug, vault secret id, …) and hands the
// adapter a `PublishContext`; the adapter returns a `PublishOutcome`.
//
// `PublishablePost` is a self-contained projection of the `posts` row. The
// article columns (title/slug/excerpt/content_markdown/cover_image_alt) were
// added in migration 20260609120000; database.types.ts may not include all of
// them yet, so this interface defines its own shape rather than re-deriving
// from the generated Row type.

export interface PublishablePost {
  id: string;
  brand_id: string;
  platform: string;
  language: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  content_text: string | null;
  content_markdown: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
}

export type PublishOutcome =
  | { ok: true; externalId: string; externalUrl: string }
  | { ok: false; status: number; message: string; needsReconnect?: boolean };

export interface PublishContext {
  post: PublishablePost;
  brandId: string;
  // adapter-specific config resolved by the caller (e.g. brand slug, vault secret id)
  config: Record<string, unknown>;
  // Test seams (omitted in production → real fetch / DNS). Adapters that fetch a
  // user-controlled URL pass these to safeFetch so the publish path is unit-testable.
  fetchImpl?: typeof fetch;
  lookup?: (hostname: string) => Promise<{ address: string }[]>;
}

export interface PublishAdapter {
  platform: string;
  publish(ctx: PublishContext): Promise<PublishOutcome>;
}
