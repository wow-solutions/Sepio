-- Migration: Sprint 1C — Topic Research helpers
-- Companion to 20260520120000_topic_research_pipeline.sql
--
-- filter_unused_topic_texts RPC — batch anti-repeat query used by cron worker
-- before INSERT topic_candidates. Returns subset of input texts that are NOT
-- similar (pg_trgm) to brand's last N posts.
--
-- Threshold 0.3 calibrated empirically 2026-05-20 (Lane A smoke test):
--   - exact match → similarity 1.0
--   - paraphrase same topic → ~0.31  (filter OUT)
--   - related but different → ~0.05-0.13 (KEEP)
--   - totally unrelated → <0.05 (KEEP)
-- See user-main-design-20260520-192642.md D5 для rationale.

create or replace function public.filter_unused_topic_texts(
  p_brand_id uuid,
  p_candidate_texts text[],
  p_threshold real default 0.3,
  p_history_limit int default 30
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
    from (
      select content_text
      from public.posts
      where brand_id = p_brand_id and content_text is not null
      order by created_at desc
      limit p_history_limit
    ) recent
    where extensions.similarity(recent.content_text, c.text) > p_threshold
  );
$$;

comment on function public.filter_unused_topic_texts is
  'Batch anti-repeat: returns candidate texts NOT similar to brand last N posts. pg_trgm threshold 0.3 default. Sprint 1C Lane C.';

-- Authenticated может вызвать (defense-in-depth: cron uses service-role, но
-- если есть future use case "show similarity check to user", grant нужен).
grant execute on function public.filter_unused_topic_texts(uuid, text[], real, int) to authenticated;
