-- ════════════════════════════════════════════════════════════════════
-- Kitchen slice 1 — blog article generated FROM a top-5 research card.
-- ════════════════════════════════════════════════════════════════════
-- Teach insert_post_and_mark_candidate to write the article columns
-- (title/slug/excerpt/content_markdown) so a blog post generated from a
-- topic_candidate inserts atomically WITH the candidate-mark — the same
-- single transaction the LinkedIn path already relies on (D12). The columns
-- exist already: content_markdown from the initial schema, title/slug/excerpt
-- from 20260609120000_posting_pipeline.
--
-- DROP + CREATE (not OR REPLACE): appending params via REPLACE would leave a
-- second overload, and the existing 10-named-arg LinkedIn call would then be
-- ambiguous between the two signatures. Dropping the old one first guarantees a
-- single function; the new article params default NULL so the unchanged 10-arg
-- LinkedIn call still resolves (extras fill from defaults).

drop function if exists public.insert_post_and_mark_candidate(
  uuid, text, text, text, integer, jsonb, text, text, uuid, text
);

create function public.insert_post_and_mark_candidate(
  p_brand_id uuid,
  p_platform text,
  p_language text,
  p_content_text text,
  p_detection_score integer,
  p_detection_breakdown jsonb,
  p_status text,
  p_source_type text,
  p_candidate_id uuid default null,
  p_research_topic text default null,
  p_title text default null,
  p_slug text default null,
  p_excerpt text default null,
  p_content_markdown text default null
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
  -- INSERT post (RLS на posts проверит что юзер owns brand_id). Article-поля
  -- NULL для соц-постов; для блога content_text NULL + content_markdown задан.
  insert into public.posts (
    brand_id, platform, language, content_text,
    detection_score, detection_breakdown, status, source_type,
    research_topic, title, slug, excerpt, content_markdown
  ) values (
    p_brand_id, p_platform, p_language, p_content_text,
    p_detection_score, p_detection_breakdown, p_status, p_source_type,
    p_research_topic, p_title, p_slug, p_excerpt, p_content_markdown
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
  'Atomic INSERT posts + UPDATE topic_candidates.used_at. Sprint 1C D12; kitchen slice 1 добавил title/slug/excerpt/content_markdown для блога (platform=hosted). Backwards-compat если candidate_id и article-поля NULL.';

-- Grant — RPC должен быть вызываем юзерами через supabase-js .rpc()
grant execute on function public.insert_post_and_mark_candidate(
  uuid, text, text, text, integer, jsonb, text, text, uuid, text, text, text, text, text
) to authenticated;
