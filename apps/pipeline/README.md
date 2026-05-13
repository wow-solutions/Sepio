# `apps/pipeline` — Quoteworthy Python pipeline

> FastAPI service wrapping the reused article-writer pipeline.
> **Skeleton only at Sprint 0 task #7.** Implementation lands in
> tasks #13 (FastAPI wrapper) and #14 (article-writer reuse).

FastAPI endpoints (planned): `POST /research`, `POST /generate`, `POST /image`, `GET /health`. Invoked via Inngest events from the Next.js app (`packages/shared-types/inngest-events.ts` is the contract source of truth).

## Layout (planned)

```
apps/pipeline/
├── pipeline/                  # reused from article-writer
│   ├── research.py
│   ├── writer.py
│   ├── humanizer.py
│   ├── infographics.py
│   ├── claude_client.py
│   ├── dataforseo_client.py
│   └── linkedin_adapter.py
├── api/                       # FastAPI HTTP layer (new)
│   ├── main.py
│   ├── routers/
│   ├── deps.py
│   └── schemas.py
├── tests/
├── pyproject.toml
└── Dockerfile
```

Local dev (later): `uv run --directory apps/pipeline uvicorn api.main:app --reload`
