-- Migration: Client Brain foundation (Phase 1 moat — T2)
-- См. wiki/decisions/0022-repositioning-expert-content-engine.md (ADR-0022, R1)
--     + raw/repositioning/2026-05-29-phase1-eng-plan.md §C1 (gitignored).
--
-- Ров доказан спайком T1 (median A=10 vs B=7): дельта — в Специфичности /
-- Отстройке / Whitespace, НЕ в голосе. Эта миграция кладёт фундамент под две
-- системы, которые дают дельту: structured expertise capture (Client Brain) и
-- competitive whitespace (Market Brain table-shell).
--
-- Состав:
--   1. brand_configs += services / locations / pricing / forbidden_claims (jsonb,
--      low-churn, читаются вместе) + voice_fingerprint (jsonb null, объявлен здесь
--      один раз, пишется позже C2/T13 Voice Fingerprint Lite).
--   2. proof_items — реальная дочерняя таблица (Fact-ось будет JOIN'ить, рост
--      безграничен → таблица, не jsonb).
--   3. market_competitors — table-shell (Wave M / Market Brain заполнит). Создаём
--      сейчас, чтобы Wave-3 не делал ре-миграцию. source нарочно узкий
--      ('agency_manual') — Phase-2 SERP/Places станет ADD-миграцией.
--
-- ЖЁСТКОЕ ПРАВИЛО: forbidden_claims (ЮРИДИЧЕСКОЕ — заявления, которые нельзя
-- делать) — ОТДЕЛЬНО от forbidden_words (анти-слоп стоп-слова). Разные колонки,
-- разные UI, разные оси Quality Gate (Risk vs Generic). Никогда не смешивать.

-- ════════════════════════════════════════════════════════════════════
-- 1 — brand_configs: Client Brain structured fields
-- ════════════════════════════════════════════════════════════════════
alter table public.brand_configs
  add column services         jsonb not null default '[]'::jsonb,
  add column locations        jsonb not null default '[]'::jsonb,
  add column pricing          jsonb not null default '[]'::jsonb,
  add column forbidden_claims jsonb not null default '[]'::jsonb,
  add column voice_fingerprint jsonb;

comment on column public.brand_configs.services is
  'Client Brain: список услуг бренда [{name, description?}]. Заземляет генерацию (Специфичность-ось).';
comment on column public.brand_configs.locations is
  'Client Brain: гео обслуживания ["Phoenix, AZ", ...]. Заземляет локальную конкретику.';
comment on column public.brand_configs.pricing is
  'Client Brain: ориентиры цен/окупаемости [{label, detail?}]. Конкретика, которой нет у голого ИИ.';
comment on column public.brand_configs.forbidden_claims is
  'ЮРИДИЧЕСКОЕ: заявления которые бренд НЕ должен делать (напр. "guaranteed results"). '
  'НЕ путать с forbidden_words (анти-слоп токены). Ось Risk Quality Gate.';
comment on column public.brand_configs.voice_fingerprint is
  'Voice Fingerprint Lite (C2/T13): типизированный JSON голоса. NULL пока не построен. '
  'Объявлен здесь один раз; пишется в Phase-1 Lite-задаче после bake-off GO/NO-GO.';

-- ════════════════════════════════════════════════════════════════════
-- 2 — proof_items (дискретные доказуемые заявления; Fact-ось JOIN'ит)
-- ════════════════════════════════════════════════════════════════════
-- Реальная таблица, НЕ jsonb: список растёт безгранично, Quality Gates (Fact-ось)
-- будут SELECT WHERE brand_id=? чтобы заземлить/флагнуть заявления поста.
-- verifiable + source — это и есть половина ровa (доказуемая конкретика),
-- НЕ пассивная база знаний.
create table public.proof_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null
    check (kind in ('certification','case_study','metric','testimonial','source_fact')),
  body text not null,                       -- дискретное заявление; app-cap ~2000 симв (schema.ts)
  source text,                              -- URL / ссылка-аттестация
  asset_url text,                           -- приватный Storage asset (сертификат и т.п.)
  verifiable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proof_items_brand_idx on public.proof_items(brand_id);

create trigger proof_items_set_updated_at before update on public.proof_items
  for each row execute function public.set_updated_at();

comment on table public.proof_items is
  'Дискретные доказуемые заявления бренда (сертификаты/кейсы/метрики/отзывы/факты). '
  'Fact-ось Quality Gate JOIN''ит по brand_id чтобы заземлить генерацию. ADR-0022 ров.';

-- ════════════════════════════════════════════════════════════════════
-- 3 — market_competitors (table-shell; Wave M / Market Brain заполнит)
-- ════════════════════════════════════════════════════════════════════
-- Создаём сейчас, чтобы Wave-3 не делал ре-миграцию. source узкий нарочно:
-- Phase-1 = только URL от агентства + индемнити (eng-plan форк #3); авто-дискавери
-- (SERP/Places) станет ADD-миграцией с расширением CHECK, не рефактором.
create table public.market_competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source text not null default 'agency_manual'
    check (source in ('agency_manual')),
  url text not null,
  domain text not null,
  status text not null default 'approved'
    check (status in ('approved','disabled')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  unique(brand_id, domain)                  -- лидирующий brand_id покрывает FK-индекс
);

-- added_by FK не покрыт unique(brand_id, domain) → индекс отдельно (advisor unindexed_fk).
create index market_competitors_added_by_idx on public.market_competitors(added_by);

comment on table public.market_competitors is
  'Конкуренты бренда для Market Brain (отстройка/whitespace). Phase-1: URL от агентства '
  '(source=agency_manual). Phase-2 SERP/Places расширит CHECK аддитивно. ADR-0022 ров.';

-- ════════════════════════════════════════════════════════════════════
-- RLS — ownership chain через brands.account_id (Model A, flat)
-- ════════════════════════════════════════════════════════════════════
-- auth.uid() обёрнут в (select ...) — auth_rls_initplan optimization (как в
-- phase1_publishing_infra). Owners полный CRUD через свои бренды.
alter table public.proof_items enable row level security;
alter table public.market_competitors enable row level security;

create policy "users can crud proof items of own brands"
  on public.proof_items for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

create policy "users can crud market competitors of own brands"
  on public.market_competitors for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );
