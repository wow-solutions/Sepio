-- Migration: brand_rules (Editorial Memory — T1)
-- См. дизайн-док ~/.gstack/projects/Content-maker-SaaS/user-main-design-20260530-224112.md
--     (Editorial Memory: self-improving brand rules) + ADR-0022 (ров = expert content engine).
--
-- Каждая подтверждённая правка поста → durable-правило, инъектится во ВСЕ будущие
-- генерации бренда через готовый T4 seam. Это НЕ статистический voice-mirror
-- (ADR-0012/0018 зарублен) — детерминированные guardrails, которые юзер ревьюит до
-- персиста. Структурная таблица (а не free-text блоб) выбрана на eng-review: правила
-- хотят быть queryable-строками со scope, не растущим brand_voice-блобом (P4).
--
-- v1 = ADDITIVE: новые правила тут, при рендере word-type правила сливаются со
-- старыми колонками brand_configs.forbidden_words/required_phrases (dedup по границе
-- слова). Визард НЕ трогаем, данные НЕ мигрируем — объединение хранилищ = TODO #24 (B).

-- ════════════════════════════════════════════════════════════════════
-- brand_rules — выученная редакторская память (одна строка = одно правило)
-- ════════════════════════════════════════════════════════════════════
create table public.brand_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rule_type text not null
    check (rule_type in ('forbidden_word', 'required_phrase', 'voice_note')),
  scope text not null default 'global'
    check (scope in ('opening', 'body', 'global')),
  rule_text text not null,            -- слово/фраза, либо инструкция голоса
  human_label text not null,          -- короткое summary для списка управления
  rationale text,                     -- почему (из экстракции); read-only контекст
  source_post_id uuid references public.posts(id) on delete set null,  -- провенанс
  active boolean not null default true,
  created_at timestamptz not null default now(),

  -- Cl2: opening/body имеет смысл только у voice_note. Секции «Never use these words» /
  -- «Weave in» не знают про зачин/тело → forbidden_word и required_phrase = global.
  -- Дублируется в Zod на чтении (rules-context.ts).
  constraint brand_rules_scope_requires_voice_note
    check (rule_type = 'voice_note' or scope = 'global')
);

-- Read-путь (генерация) и список управления оба фильтруют по brand_id и сортируют по
-- created_at (стабильная сортировка → byte-identical промпт → кеш-инвариант, Codex #4-7).
-- active фильтруется в приложении (cap ~25 правил → набор мал, partial index избыточен).
create index brand_rules_brand_created_idx
  on public.brand_rules(brand_id, created_at);

comment on table public.brand_rules is
  'Editorial Memory: выученные редакторские правила бренда (стиль/зачины/форматирование '
  '+ явные баны слов/фраз). Подтверждённая правка поста → durable-строка, инъектится во '
  'все будущие генерации через T4 seam. Детерминированные guardrails, НЕ voice-mirror '
  '(ADR-0012/0018). v1 additive: слияние с brand_configs-колонками при рендере (TODO #24). '
  'Owner CRUD через brands.account_id. ADR-0022 ров.';

-- ════════════════════════════════════════════════════════════════════
-- RLS — ownership chain через brands.account_id (Model A, flat)
-- ════════════════════════════════════════════════════════════════════
-- auth.uid() обёрнут в (select ...) — auth_rls_initplan optimization (как в
-- client_brain / market_brain). Owner полный CRUD через свои бренды; юзер сам
-- добавляет/тоглит/удаляет правила (в отличие от market_differentiation = SELECT-only).
alter table public.brand_rules enable row level security;

create policy "users can crud brand rules of own brands"
  on public.brand_rules for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );
