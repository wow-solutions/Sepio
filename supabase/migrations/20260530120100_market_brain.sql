-- Migration: Market Brain tables (Phase 1 moat — T5)
-- См. wiki/decisions/0022-repositioning-expert-content-engine.md (ADR-0022, R1)
--     + raw/repositioning/2026-05-29-phase1-eng-plan.md §M (gitignored).
--
-- Спайк T1 показал: дельта ровa — в Отстройке / Whitespace, НЕ в голосе. Market
-- Brain вычисляет конкурентный whitespace из РЕАЛЬНЫХ конкурентов бренда. Эта
-- миграция кладёт два недостающих стола (market_competitors уже создан целиком в
-- T2 — «доукомплектовать» из eng-plan = no-op):
--   1. market_differentiation — ЕДИНСТВЕННЫЙ персистентный артефакт = производные
--      фичи (темы / гэпы), НЕ сырой текст конкурента (публичная moat-граница,
--      derived-only, T7). Одна строка на бренд (upsert on conflict brand_id).
--   2. market_scrape_cache — ТРАНЗИЕНТНЫЙ сырой экстракт по домену с жёстким TTL
--      7 дней. Глобальный по домену, общий между брендами, только service-role.
--      Sweep удаляет просроченное (lib/market-brain/scrape-cache.ts).

-- ════════════════════════════════════════════════════════════════════
-- 1 — market_differentiation (derived-only артефакт; одна строка/бренд)
-- ════════════════════════════════════════════════════════════════════
create table public.market_differentiation (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  computed_at timestamptz not null default now(),
  common_themes jsonb not null default '[]'::jsonb,     -- [{theme, prevalence_count}]
  positioning_gaps jsonb not null default '[]'::jsonb,  -- [{angle, rationale}]
  source_domains text[],                                -- домены, легшие в основу
  model text,                                           -- модель differentiation-engine
  prompt_version text,                                  -- версия промпта (воспроизводимость)

  unique(brand_id)                                      -- одна строка/бренд → upsert
);

comment on table public.market_differentiation is
  'Market Brain: производные фичи отстройки (общие темы конкурентов + позиционные '
  'гэпы). DERIVED-ONLY — НИКОГДА не сырой текст конкурента (moat-граница T7). Одна '
  'строка на бренд (upsert). Пишется service-role воркером (T8), читается '
  'владельцем бренда + инъектится в генерацию (lib/claude.ts seam). ADR-0022 ров.';

-- ════════════════════════════════════════════════════════════════════
-- 2 — market_scrape_cache (транзиентный сырой экстракт; TTL 7д; service-role)
-- ════════════════════════════════════════════════════════════════════
-- Глобальный по домену (НЕ per-brand): один конкурент может обслуживать N брендов,
-- скрейпим домен один раз. expires_at — DEFAULT now()+7д (как topic_candidates;
-- generated-column нельзя — timestamptz+interval STABLE, не IMMUTABLE). Re-scrape
-- (upsert on conflict domain) обязан явно обновить fetched_at И expires_at
-- (writer T6/T8 берёт срок из SCRAPE_CACHE_TTL_DAYS).
create table public.market_scrape_cache (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  robots_allowed boolean,
  status_code integer,
  extracted jsonb,                                      -- {title, meta, h1_h3[], paragraphs[]}

  unique(domain)
);

-- Sweep делает DELETE WHERE expires_at < now() — индексируем для дешёвой чистки.
create index market_scrape_cache_expires_idx
  on public.market_scrape_cache(expires_at);

comment on table public.market_scrape_cache is
  'Market Brain: ТРАНЗИЕНТНЫЙ сырой HTML-экстракт конкурента по домену. Жёсткий '
  'TTL 7д (expires_at default). Глобальный по домену, общий между брендами. ТОЛЬКО '
  'service-role (нет пользовательской RLS). Sweep чистит просроченное (T5).';

-- ════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════
-- market_differentiation: машинно-пишется воркером (service-role обходит RLS),
-- читается владельцем → SELECT-only по ownership-chain (как detection_dataset).
-- auth.uid() обёрнут в (select ...) — auth_rls_initplan optimization (конвенция T2).
alter table public.market_differentiation enable row level security;

create policy "users can read market differentiation of own brands"
  on public.market_differentiation for select
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- market_scrape_cache: НЕТ пользовательской RLS. Enable + ноль политик = доступ
-- только у service-role (он обходит RLS). Сырой текст конкурентов наружу не ходит.
alter table public.market_scrape_cache enable row level security;
