-- Migration: Sprint 1C — Topic Research Pipeline
-- См. ~/.gstack/projects/wow-solutions-Quoteworthy-internal/user-main-design-20260520-192642.md
--
-- D1 — Full 3-source pipeline (web search + DataForSEO + VoC/history); Reddit dropped per D15
-- D4 — Quota-based ranking 2+2+1; impressions_count + last_shown_at для future weighted-sum
-- D5 — pg_trgm anti-repeat по last 30 posts
-- D8 — extend /api/posts/generate с topic_candidate_id
-- D12 — atomic RPC insert_post_and_mark_candidate
-- D13 — single dispatch cron handles cleanup + research
--
-- Schema:
--   1. CREATE EXTENSION pg_trgm
--   2. topic_candidates table + 4 indexes + RLS
--   3. trigram GIN index на posts.content_text для anti-repeat queries
--   4. RPC insert_post_and_mark_candidate

-- ════════════════════════════════════════════════════════════════════
-- 1) pg_trgm extension (anti-repeat trigram match)
-- ════════════════════════════════════════════════════════════════════
create extension if not exists pg_trgm with schema extensions;

-- ════════════════════════════════════════════════════════════════════
-- 2) topic_candidates table
-- ════════════════════════════════════════════════════════════════════
-- Cron собирает 12-15 candidates per brand per day из 3 источников.
-- UI показывает top-5 (quota 2 web + 2 dataforseo + 1 voc_history).
-- Юзер кликает → /api/posts/generate помечает used_at + post_id через RPC.
-- expires_at = +7 days, DELETE в dispatch cron перед research run.
create table public.topic_candidates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,

  -- Содержание темы (что покажем юзеру)
  topic_text text not null,
  source text not null check (source in ('web_search','dataforseo','voc_history')),

  -- Per-source metadata для UI badges и future ranking
  -- web_search: {search_query, source_url, page_age}
  -- dataforseo: {keyword, rise_pct, search_volume, location_code}
  -- voc_history: {pain_point_index, keyword, last_used_at}
  source_metadata jsonb not null default '{}'::jsonb,

  -- Scoring (будет наполняться cron'ом; для MVP quota не использует score, но schema готова)
  score numeric(5,3),
  freshness_score numeric(5,3),

  -- Telemetry для future weighted-sum migration (D4 → option B trigger)
  impressions_count integer not null default 0,
  last_shown_at timestamptz,

  -- Usage
  used_at timestamptz,
  post_id uuid references public.posts(id) on delete set null,

  -- Lifecycle
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  degraded_run boolean not null default false  -- true if cron run produced this with ≥1 source failure
);

comment on table public.topic_candidates is
  'Daily topic candidates per brand. 3 sources (web_search, dataforseo, voc_history). MVP quota 2+2+1. Sprint 1C.';

comment on column public.topic_candidates.impressions_count is
  'Incremented each time candidate appears in user top-5. Baseline for future weighted-sum ranking (D4 option B).';

comment on column public.topic_candidates.degraded_run is
  'TRUE if cron run had ≥1 failed source. Surfaced в brand settings, не в /writer.';

-- ════════════════════════════════════════════════════════════════════
-- Indexes
-- ════════════════════════════════════════════════════════════════════
-- GET /api/brands/[id]/topics: WHERE brand_id=? AND used_at IS NULL ORDER BY ...
create index topic_candidates_brand_used_idx
  on public.topic_candidates(brand_id, used_at);

-- Scorer quota selection: GROUP BY source per brand
create index topic_candidates_brand_source_used_idx
  on public.topic_candidates(brand_id, source, used_at);

-- Cleanup в dispatch cron: DELETE WHERE expires_at < NOW()
create index topic_candidates_expires_idx
  on public.topic_candidates(expires_at);

-- Anti-repeat trigram match (filterRecentlyUsed)
create index topic_candidates_text_trgm_idx
  on public.topic_candidates using gin (topic_text extensions.gin_trgm_ops);

-- ════════════════════════════════════════════════════════════════════
-- Trigram index на posts.content_text — anti-repeat query side
-- ════════════════════════════════════════════════════════════════════
-- filterRecentlyUsed сравнивает candidate.topic_text vs последних 30 posts.content_text.
-- Без этого index pg_trgm similarity query был бы full-scan.
create index posts_content_text_trgm_idx
  on public.posts using gin (content_text extensions.gin_trgm_ops)
  where content_text is not null;

-- ════════════════════════════════════════════════════════════════════
-- RLS — topic_candidates
-- ════════════════════════════════════════════════════════════════════
-- Pattern mirrors detection_dataset (D5 из ADR-0014):
-- - Users могут SELECT свои rows (через brand_id → brands.account_id)
-- - INSERT/UPDATE/DELETE — только service-role (cron, RPC)
alter table public.topic_candidates enable row level security;

create policy "users can read own topic_candidates"
  on public.topic_candidates for select
  using (
    brand_id in (
      select id from public.brands where account_id = (select auth.uid())
    )
  );

-- Нет INSERT/UPDATE/DELETE policies для authenticated/anon — RLS блокирует.
-- Service-role client bypass RLS automatically (per Supabase docs).

-- ════════════════════════════════════════════════════════════════════
-- 3) RPC insert_post_and_mark_candidate (D12 atomic transaction)
-- ════════════════════════════════════════════════════════════════════
-- Called by /api/posts/generate when user picks from topic-picker.
-- Atomically inserts new post row AND marks candidate as used.
-- Если candidate_id null — работает как обычный INSERT posts (backwards compat).
--
-- Security: SECURITY INVOKER → RLS на posts и topic_candidates действуют
-- от имени вызывающего юзера. Юзер может INSERT в posts только своих брендов
-- (existing RLS), и не может UPDATE topic_candidates (нет policy для UPDATE).
--
-- Решение: UPDATE topic_candidates делаем через SECURITY DEFINER part —
-- проверяем что candidate.brand_id == post.brand_id и brand принадлежит юзеру.
create or replace function public.insert_post_and_mark_candidate(
  p_brand_id uuid,
  p_platform text,
  p_language text,
  p_content_text text,
  p_detection_score integer,
  p_detection_breakdown jsonb,
  p_status text,
  p_source_type text,
  p_candidate_id uuid default null,
  p_research_topic text default null
)
returns public.posts
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_post public.posts;
  v_candidate public.topic_candidates;
begin
  -- INSERT post (RLS на posts проверит что юзер owns brand_id)
  insert into public.posts (
    brand_id, platform, language, content_text,
    detection_score, detection_breakdown, status, source_type,
    research_topic
  ) values (
    p_brand_id, p_platform, p_language, p_content_text,
    p_detection_score, p_detection_breakdown, p_status, p_source_type,
    p_research_topic
  )
  returning * into v_new_post;

  -- Mark candidate as used (если был указан)
  if p_candidate_id is not null then
    -- Verify candidate belongs to same brand (defense-in-depth)
    select * into v_candidate
      from public.topic_candidates
      where id = p_candidate_id;

    if v_candidate.id is null then
      raise exception 'topic_candidate not found: %', p_candidate_id
        using errcode = 'P0002';
    end if;

    if v_candidate.brand_id != p_brand_id then
      raise exception 'topic_candidate brand mismatch: % vs %', v_candidate.brand_id, p_brand_id
        using errcode = 'P0001';
    end if;

    update public.topic_candidates
      set used_at = now(), post_id = v_new_post.id
      where id = p_candidate_id;
  end if;

  return v_new_post;
end;
$$;

comment on function public.insert_post_and_mark_candidate is
  'Atomic INSERT posts + UPDATE topic_candidates.used_at. Sprint 1C D12. Backwards-compat если candidate_id NULL.';

-- Grant — RPC должен быть вызываем юзерами через supabase-js .rpc()
grant execute on function public.insert_post_and_mark_candidate(
  uuid, text, text, text, integer, jsonb, text, text, uuid, text
) to authenticated;
