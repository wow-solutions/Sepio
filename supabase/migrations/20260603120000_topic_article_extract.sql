-- Topic article extract cache (lazy grounding for the "angle of approach" feature).
--
-- The angle picker (retell/comment/contrarian/lesson) writes a post grounded in
-- the SOURCE ARTICLE, not just the 5-10 word topic headline. To read the article
-- we fetch the candidate's verified source_url. Doing that in the cron worker is
-- off the table — the worker already runs near the 300s Vercel cap (one
-- web_search ≈164s). Instead we hydrate LAZILY: the first time a user picks an
-- article-grounded angle for a topic, the app fetches + extracts the article once
-- and caches it here. Subsequent reads (generation, re-pick) are instant and
-- never re-fetch.
--
-- article_extract        — the cached extract {title, excerpt, paragraphs[],
--                          sourceUrl, fetchedAt}; null until hydrated.
-- article_extract_status — null  = not attempted yet (has a url, hydratable)
--                          'success' = fetched + usable text cached
--                          'failed'  = url present but unfetchable (paywall, 404,
--                                      robots, JS-only, no usable text) → the
--                                      angle degrades to topic-gist framing and
--                                      the UI says so honestly.
--                          A web_search candidate with no source_url, or a
--                          dataforseo/voc candidate, simply never gets hydrated
--                          (stays null) — the app treats "no url" as topic-only.

alter table public.topic_candidates
  add column article_extract jsonb,
  add column article_extract_status text
    check (article_extract_status in ('success', 'failed'));

comment on column public.topic_candidates.article_extract is
  'Cached source-article extract for angle grounding {title,excerpt,paragraphs,sourceUrl,fetchedAt}; null until lazily hydrated on first article-angle pick.';
comment on column public.topic_candidates.article_extract_status is
  'null=not attempted, success=usable text cached, failed=url unfetchable (angle degrades to topic gist). See 20260603120000 migration.';

-- Writes go through a SECURITY DEFINER RPC: users have no UPDATE policy on
-- topic_candidates (same as used_at / impressions). The RPC verifies brand
-- ownership via auth.uid() join before caching, so a user can only hydrate their
-- own brands' candidates.
create or replace function public.cache_topic_article(
  p_candidate_id uuid,
  p_extract jsonb,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('success', 'failed') then
    raise exception 'invalid article_extract_status: %', p_status;
  end if;

  update public.topic_candidates tc
  set article_extract = case when p_status = 'success' then p_extract else null end,
      article_extract_status = p_status
  from public.brands b
  where tc.id = p_candidate_id
    and tc.brand_id = b.id
    and b.account_id = auth.uid();
end;
$$;

comment on function public.cache_topic_article is
  'Caches a lazily-fetched source-article extract on a topic candidate. SECURITY DEFINER bypasses the (absent) UPDATE policy but verifies brand ownership via auth.uid() join. Sprint 1C angle grounding (2026-06-03).';

grant execute on function public.cache_topic_article(uuid, jsonb, text) to authenticated;
