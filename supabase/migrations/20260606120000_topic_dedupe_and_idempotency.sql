-- Migration: topic-suggest repair — dedupe + idempotent insert
-- Companion to 20260520120000_topic_research_pipeline.sql (+ _helpers).
--
-- Fixes two production defects in the "Темы на сегодня" pipeline:
--   1. Exact cross-run duplicates (same topic inserted twice in two same-day
--      runs) — anti-repeat only compared candidates vs POSTS, never vs the
--      existing unused pool, and there was no DB-level uniqueness guard.
--   2. The insert path could not be made idempotent from supabase-js: a partial
--      unique index predicate (`where used_at is null`) cannot be expressed via
--      PostgREST onConflict, so dedupe must happen inside an SQL function.
--
-- Three pieces:
--   A) topic_norm generated column = deterministic dedupe key.
--   B) partial unique index (brand_id, topic_norm) WHERE used_at IS NULL.
--   C) two SQL functions: filter_new_against_pool (best-effort near-dup
--      pre-filter vs the live pool) + insert_topic_candidates_dedup (the
--      idempotent batch insert the worker calls instead of a raw .insert).

-- ── A) Normalized dedupe key ──────────────────────────────────────────────
-- Mirrors the in-memory normalizeTopicKey(): lowercase, collapse internal
-- whitespace, trim, strip trailing punctuation — so the DB guard and the TS
-- pre-filter agree on what "the same topic" is (e.g. "SaaS guide." == "saas
-- guide" == "saas  guide"). All functions used are immutable (required for a
-- generated column).
alter table public.topic_candidates
  add column if not exists topic_norm text
  generated always as (
    regexp_replace(
      lower(regexp_replace(btrim(topic_text), '\s+', ' ', 'g')),
      '[.,;:!?…]+$',
      ''
    )
  ) stored;

-- ── A2) Pre-dedupe existing rows ──────────────────────────────────────────
-- Production already contains the cross-run duplicates this migration prevents
-- going forward. The partial unique index below would FAIL to build while those
-- exist, aborting the whole migration. Collapse existing unused duplicates to
-- one row per (brand_id, topic_norm) first, keeping the freshest (then the
-- highest-scored, then an arbitrary ctid tie-break).
delete from public.topic_candidates t
using public.topic_candidates k
where t.used_at is null
  and k.used_at is null
  and t.brand_id = k.brand_id
  and t.topic_norm = k.topic_norm
  and (
    t.created_at < k.created_at
    or (t.created_at = k.created_at and coalesce(t.score, -1) < coalesce(k.score, -1))
    or (t.created_at = k.created_at and coalesce(t.score, -1) = coalesce(k.score, -1) and t.ctid > k.ctid)
  );

-- ── B) Idempotency guard ──────────────────────────────────────────────────
-- One LIVE (unused) candidate per brand+norm. Partial on used_at IS NULL so a
-- topic that was used in the past doesn't block suggesting a fresh one later.
create unique index if not exists topic_candidates_brand_norm_unused_uidx
  on public.topic_candidates (brand_id, topic_norm)
  where used_at is null;

-- ── C1) Cross-pool anti-dup (best-effort pre-filter) ──────────────────────
-- Mirrors filter_unused_topic_texts but compares against the brand's UNUSED,
-- unexpired topic_candidates instead of posts. Reuses the existing
-- topic_candidates_text_trgm_idx GIN index. The real guarantee is the unique
-- index above; this just avoids spending downstream work (source verification)
-- on near-dups that the index would reject anyway.
create or replace function public.filter_new_against_pool(
  p_brand_id uuid,
  p_candidate_texts text[],
  p_threshold real default 0.3
)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(c.text order by c.idx), '{}')
  from unnest(p_candidate_texts) with ordinality as c(text, idx)
  where not exists (
    select 1
    from public.topic_candidates tc
    where tc.brand_id = p_brand_id
      and tc.used_at is null
      and tc.expires_at > now()
      and extensions.similarity(tc.topic_text, c.text) > p_threshold
  );
$$;

comment on function public.filter_new_against_pool is
  'Cross-pool anti-dup: candidate texts NOT pg_trgm-similar (>0.3) to brand unused/unexpired topic_candidates. Companion to filter_unused_topic_texts (which compares vs posts).';

grant execute on function public.filter_new_against_pool(uuid, text[], real) to authenticated;

-- ── C2) Idempotent batch insert ───────────────────────────────────────────
-- Replaces the worker's raw .insert(). Inserts a jsonb array of candidate rows
-- with `ON CONFLICT (brand_id, topic_norm) WHERE used_at IS NULL DO NOTHING` —
-- the partial-index predicate is spelled out here because supabase-js cannot.
-- DO NOTHING also collapses any exact-norm duplicates within the same batch.
-- Returns the count of rows actually inserted (newly added, dups skipped).
create or replace function public.insert_topic_candidates_dedup(
  p_brand_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into public.topic_candidates
    (brand_id, topic_text, source, source_metadata, score, degraded_run)
  select
    p_brand_id,
    (r->>'topic_text'),
    (r->>'source'),
    coalesce(r->'source_metadata', '{}'::jsonb),
    nullif(r->>'score', '')::numeric,
    coalesce((r->>'degraded_run')::boolean, false)
  from jsonb_array_elements(p_rows) as r
  on conflict (brand_id, topic_norm) where used_at is null
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.insert_topic_candidates_dedup is
  'Idempotent batch insert for cron worker. ON CONFLICT (brand_id, topic_norm) WHERE used_at IS NULL DO NOTHING — partial-index dedupe that supabase-js cannot express. Returns inserted row count.';

-- Cron worker runs under service-role; grant both roles for defense-in-depth.
grant execute on function public.insert_topic_candidates_dedup(uuid, jsonb) to service_role;
grant execute on function public.insert_topic_candidates_dedup(uuid, jsonb) to authenticated;
