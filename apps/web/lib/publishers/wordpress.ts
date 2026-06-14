// WordPress publisher (platform 'wordpress').
//
// Publishes a generated article to a self-hosted / WP.com site via the WP REST
// API using an Application Password (Basic auth). The credential is stored in
// Supabase Vault; the dispatcher passes its `vaultSecretId` via config.
//
// Auth: WordPress Application Passwords -> HTTP Basic with the user's login
// name and the generated app password. Endpoint: POST /wp-json/wp/v2/posts.

import { z } from "zod";
import { readSecret, VaultError } from "@/lib/vault";
import { assertPublicHttpUrl, safeFetch } from "@/lib/ssrf-guard";
import type { PublishAdapter, PublishContext, PublishOutcome } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

// Credential shape stored in Vault for a WordPress connection.
export const WordPressCredentialSchema = z.object({
  site_url: z.string().url(),
  username: z.string().min(1),
  app_password: z.string().min(1),
});

export type WordPressCredential = z.infer<typeof WordPressCredentialSchema>;

function basicAuthHeader(cred: WordPressCredential): string {
  // WP app passwords are typically shown with spaces; WordPress accepts them
  // verbatim in the Basic credential, so don't strip them.
  const token = Buffer.from(`${cred.username}:${cred.app_password}`).toString("base64");
  return `Basic ${token}`;
}

function restBase(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

export const wordPressAdapter: PublishAdapter = {
  platform: "wordpress",

  async publish(ctx: PublishContext): Promise<PublishOutcome> {
    const { post, config } = ctx;

    // Title is required by the WP REST API for a usable post.
    if (!post.title || !post.title.trim()) {
      return { ok: false, status: 400, message: "Article title required" };
    }

    const vaultSecretId = config.vaultSecretId;
    if (typeof vaultSecretId !== "string" || !vaultSecretId) {
      return {
        ok: false,
        status: 401,
        message: "WordPress is not connected for this brand",
        needsReconnect: true,
      };
    }

    // Read + validate the credential from Vault.
    let cred: WordPressCredential;
    try {
      const raw = await readSecret<unknown>(vaultSecretId);
      if (raw === null) {
        return {
          ok: false,
          status: 401,
          message: "WordPress credential not found — reconnect required",
          needsReconnect: true,
        };
      }
      const parsed = WordPressCredentialSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          status: 401,
          message: "WordPress credential is malformed — reconnect required",
          needsReconnect: true,
        };
      }
      cred = parsed.data;
    } catch (err) {
      const message = err instanceof VaultError ? err.message : "Failed to read WordPress credential";
      return { ok: false, status: 500, message };
    }

    // WordPress expects HTML in `content`. The repo only ships a React markdown
    // renderer (react-markdown), not a string markdown->HTML function, so we
    // send the markdown body as-is. WP stores it but won't render Markdown
    // syntax in the classic editor.
    // TODO: add a markdown->HTML step (e.g. remark/rehype to string) before
    // sending content to WordPress.
    const content = post.content_markdown ?? post.content_text ?? "";

    const body: Record<string, unknown> = {
      title: post.title,
      content,
      status: "publish",
    };
    if (post.excerpt) body.excerpt = post.excerpt;
    if (post.slug) body.slug = post.slug;

    // SSRF guard: the site_url comes from Vault but was user-supplied — re-verify
    // it points at a public host before fetching. safeFetch re-validates too, but
    // this gives a clearer "reconnect" error than a generic SsrfError throw.
    try {
      await assertPublicHttpUrl(cred.site_url, { lookup: ctx.lookup });
    } catch {
      return {
        ok: false,
        status: 400,
        message: "WordPress site URL is not a public address",
        needsReconnect: true,
      };
    }

    const url = `${restBase(cred.site_url)}/wp-json/wp/v2/posts`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await safeFetch(
        url,
        {
          method: "POST",
          headers: {
            Authorization: basicAuthHeader(cred),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        { fetchImpl: ctx.fetchImpl, lookup: ctx.lookup },
      );
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "WordPress request timed out"
          : err instanceof Error
            ? err.message
            : "Network error reaching WordPress";
      return { ok: false, status: 0, message };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 201) {
      const json = (await res.json().catch(() => null)) as
        | { id?: number | string; link?: string }
        | null;
      if (!json || json.id === undefined || json.id === null) {
        return {
          ok: false,
          status: 502,
          message: "WordPress returned 201 without a post id",
        };
      }
      return {
        ok: true,
        externalId: String(json.id),
        externalUrl: typeof json.link === "string" ? json.link : restBase(cred.site_url),
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: "WordPress rejected the credential — reconnect required",
        needsReconnect: true,
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        message:
          "WordPress REST API not found at this site (the /wp-json endpoint may be disabled)",
      };
    }

    if (res.status >= 500) {
      return {
        ok: false,
        status: res.status,
        message: `WordPress server error (${res.status}) — retry later`,
      };
    }

    // Unhandled status. The raw WP body can carry internal paths / stack traces /
    // plugin versions, so log it server-side but never forward it to the client.
    const detail = await res.text().catch(() => "");
    if (detail) {
      console.error(`WordPress publish failed (${res.status}): ${detail.slice(0, 500)}`);
    }
    return {
      ok: false,
      status: res.status,
      message: `WordPress rejected the request (status ${res.status})`,
    };
  },
};

// Best-effort credential check used by the connect flow to fail fast before
// storing the credential. GET /wp-json/wp/v2/users/me with Basic auth: a 200
// means the app password authenticates. Returns false on any non-2xx/error.
export async function validateWordPressCredential(
  cred: WordPressCredential,
  options?: { fetchImpl?: typeof fetch; lookup?: (hostname: string) => Promise<{ address: string }[]> },
): Promise<boolean> {
  const url = `${restBase(cred.site_url)}/wp-json/wp/v2/users/me`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // safeFetch validates the user-supplied site URL (public host) before the GET.
    const res = await safeFetch(
      url,
      { method: "GET", headers: { Authorization: basicAuthHeader(cred) }, signal: controller.signal },
      { fetchImpl: options?.fetchImpl, lookup: options?.lookup },
    );
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
