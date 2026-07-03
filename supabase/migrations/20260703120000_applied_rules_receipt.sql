-- W2 «видимая петля обучения»: персистентный чек «Sepio применил N правил».
--
-- posts.applied_rules — snapshot валидированных правил, реально ушедших в промпт
-- на момент генерации: [{id, rule_type, scope, label}]. UI рендерит из снапшота,
-- id не резолвит (правило могло быть удалено). Семантика (Codex, null ≠ []):
--   null = «не трекалось» (старые посты, ошибка чтения правил) → чек не показывается;
--   []   = «трекалось, 0 применено» → CTA «Научи Sepio».

alter table public.posts add column applied_rules jsonb;

comment on column public.posts.applied_rules is
  'W2: snapshot of validated brand_rules that entered the generation prompt: [{id, rule_type, scope, label}]. null = not tracked (pre-W2 post or rules read error); [] = tracked, zero applied.';

-- DROP + CREATE (не OR REPLACE): добавление параметра через REPLACE оставило бы
-- второй overload → существующие вызовы стали бы ambiguous (PGRST203). Дропаем
-- текущую 14-арг сигнатуру (20260609130000) и создаём единственную функцию с
-- p_applied_rules jsonb default null — старые вызовы (10-арг LinkedIn, 14-арг
-- blog) резолвятся через default, т.е. старый код работает против новой функции
-- (rollout: миграция накатывается ДО кода; rollback безопасен — default).

drop function if exists public.insert_post_and_mark_candidate(
  uuid, text, text, text, integer, jsonb, text, text, uuid, text, text, text, text, text
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
  p_content_markdown text default null,
  p_applied_rules jsonb default null
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
    research_topic, title, slug, excerpt, content_markdown, applied_rules
  ) values (
    p_brand_id, p_platform, p_language, p_content_text,
    p_detection_score, p_detection_breakdown, p_status, p_source_type,
    p_research_topic, p_title, p_slug, p_excerpt, p_content_markdown, p_applied_rules
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
  'Atomic INSERT posts + UPDATE topic_candidates.used_at. Sprint 1C D12; kitchen slice 1 добавил title/slug/excerpt/content_markdown для блога (platform=hosted); W2 добавил p_applied_rules (snapshot чека обучения). Backwards-compat если candidate_id / article-поля / applied_rules NULL.';

-- Grant — RPC должен быть вызываем юзерами через supabase-js .rpc()
grant execute on function public.insert_post_and_mark_candidate(
  uuid, text, text, text, integer, jsonb, text, text, uuid, text, text, text, text, text, jsonb
) to authenticated;
