# Quoteworthy

> Open-source content automation. Built so AI search engines want to quote you.

---

## Status: 🚧 Pre-alpha

Active development — Sprint 0 (foundations: monorepo, auth, CI). Code lands incrementally; watch ⭐ for updates.

## What this is

Quoteworthy is a content automation pipeline for B2B marketing: research a topic → draft → image → publish to LinkedIn (more channels later).

The differentiator is **AI Search Optimization (GEO)** — each generated piece is structured to be cite-worthy by ChatGPT, Perplexity, and Google AI Overviews. The structural signals come from the [Princeton GEO study](https://arxiv.org/abs/2311.09735) factors: statistics with sources, expert quotes, direct answers, authoritative citations.

## Stack

- **Frontend:** Next.js 16 (App Router) on Vercel
- **Backend:** Python (FastAPI) — wraps a research/write/humanize/image pipeline
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
  web/         — Next.js dashboard
  pipeline/    — Python service (FastAPI) [Sprint 0 in progress]
packages/
  shared-types/  — TypeScript types shared between web and pipeline
supabase/
  migrations/  — Postgres schema (auto-applied via Supabase GitHub Integration)
.github/
  workflows/   — CI (typecheck + lint)
docs/          — privacy, terms, conceptual references
```

## Self-host

Full self-host docs land after Sprint 0. The plan: `docker-compose` brings up Supabase CLI + Inngest dev + the Python pipeline + the Next.js app locally. The code is browsable now but not yet runnable end-to-end as a complete system.

## License

Apache 2.0 — see [LICENSE](LICENSE).

Open-core model: the pipeline core, database schemas, and web app live here under Apache 2.0. Hosted SaaS conveniences (multi-tenant management, billing UI, scheduled publishing, premium image generation) are commercial.

## Contact

- Maintainer: [Grigoriy Baranchuk](https://github.com/GrigoriyBaranchuk)
- Privacy: [docs/privacy.md](docs/privacy.md)
- Terms: [docs/terms.md](docs/terms.md)
