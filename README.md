# Sepio

> Auditable content automation. Built so AI search engines want to quote you — and so you can verify your secrets are handled safely.

---

## Why open?

Sepio will hold your OAuth tokens and API keys — for LinkedIn, your website, and the services we use to research and publish on your behalf. **You shouldn't have to trust us; you should be able to verify us.**

This repo is the open part of the system: authentication, session handling, OAuth flows, Supabase Vault wrappers, row-level security policies, webhook signature checks — every code path that touches a customer secret is here for anyone to read.

Found a vulnerability? Open an issue or email the maintainer below. Responsible disclosure welcome.

The proprietary parts — the content generation logic, the AI Search Optimization scoring, the analytics integrations — live in a separate codebase and ship only via the hosted product. The split exists so we can be transparent about the *trust* surface without giving away the *product* surface.

## Status: 🚧 Pre-alpha

Active development — Sprint 0 (foundation: monorepo, auth, CI, security wrappers). Code lands incrementally. Watch ⭐ for updates.

## What this is

A content automation tool for B2B marketing: research a topic, draft a piece, generate an image, publish to LinkedIn (more channels coming). The differentiator is **AI Search Optimization (GEO)** — each piece is structured to be cite-worthy by ChatGPT, Perplexity, and Google AI Overviews, drawing on the [Princeton GEO study](https://arxiv.org/abs/2311.09735) factors: statistics with sources, expert quotes, direct answers, authoritative citations.

## Stack

- **Frontend:** Next.js 16 (App Router) on Vercel
- **Backend:** Python (FastAPI)
- **Data:** Supabase (Postgres + RLS + Auth + Vault)
- **AI:** Anthropic Claude (Sonnet 4.6 + Haiku 4.5), with prompt caching
- **SEO data:** DataForSEO
- **Images:** SVG generator + fal.ai (Flux Pro)
- **Jobs:** Inngest
- **Billing:** Lemon Squeezy
- **CI:** GitHub Actions

## Repo layout

```
apps/
  web/         — Next.js dashboard (auth, session, dashboard scaffolding)
  pipeline/    — Python service (FastAPI routing, OAuth handlers, security middleware)
packages/
  shared-types/  — Type contracts shared between web and pipeline
supabase/
  migrations/  — Postgres schema + RLS policies
.github/
  workflows/   — CI (typecheck + lint)
docs/          — Privacy, terms, conceptual references
```

What you **won't** find here: the content generation prompts, the GEO scoring algorithm, the analytics integrations, the per-tenant configuration UI. Those are the parts that make Sepio worth paying for; they live in the hosted product.

## Security audit

Trust-critical code paths to look at first:

- `apps/web/lib/supabase/` — Supabase client wrappers (session, cookies, server vs. client boundary)
- `apps/web/app/auth/`, `app/login/`, `app/signup/` — auth flows
- `apps/web/proxy.ts` — session refresh middleware
- `supabase/migrations/` — RLS policies (multi-tenant isolation)
- `apps/pipeline/api/` — OAuth callback handlers, webhook signature verification (lands in Sprint 0)

Open an issue if you find anything unsound. Bug bounty terms will be published once the hosted product accepts its first paying customer.

## Self-host

The open code is browsable but not a complete self-host bundle — the hosted product features stay out of this repo by design. If you want to self-host the security-critical layer plus your own content logic, that's supported in principle; full docs land after Sprint 0.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Contact

- Maintainer: [Grigoriy Baranchuk](https://github.com/GrigoriyBaranchuk) — email in [docs/privacy.md](docs/privacy.md)
- Privacy: [docs/privacy.md](docs/privacy.md)
- Terms: [docs/terms.md](docs/terms.md)
