-- Migration: Sprint 1C — topic_candidates impressions tracking RPC
-- Companion to 20260520120000_topic_research_pipeline.sql
--
-- increment_topic_impressions: batch UPDATE impressions_count + last_shown_at
-- when candidates are returned to UI via GET /api/brands/[id]/topics.
--
-- SECURITY DEFINER bypasses topic_candidates RLS (which has no UPDATE policy
-- for authenticated — service-role only). Internal ownership check protects
-- against cross-account writes: only updates rows where brand_id belongs to
-- caller's account.

create or replace function public.increment_topic_impressions(
  p_candidate_ids uuid[]
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.topic_candidates
  set
    impressions_count = impressions_count + 1,
    last_shown_at = now()
  where id = any(p_candidate_ids)
    and brand_id in (
      select id from public.brands
      where account_id = (select auth.uid())
        and deleted_at is null
    );
$$;

comment on function public.increment_topic_impressions is
  'Atomic batch +1 impressions_count + last_shown_at = now(). SECURITY DEFINER bypasses RLS (no UPDATE policy on topic_candidates) but verifies brand ownership via auth.uid() join. Sprint 1C Lane E.';

-- Revoke from public/anon, grant only to authenticated users.
-- Service-role обходит permissions anyway, so no explicit grant needed.
revoke execute on function public.increment_topic_impressions(uuid[]) from public;
grant execute on function public.increment_topic_impressions(uuid[]) to authenticated;
