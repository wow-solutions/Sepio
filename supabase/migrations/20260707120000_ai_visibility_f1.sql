-- F1 measure loop (AI-visibility slice 3, eng-review 2026-07-07).
-- Runs: one measurement of a brand across AI engines. Answers: one
-- (question, engine) probe. Owner-read via brands; writes are service-role
-- only (no insert/update policies) — same posture as topic_candidates.

create table public.ai_visibility_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  status text not null default 'running' check (status in ('running','complete','failed')),
  degraded boolean not null default false,
  engines text[] not null,
  questions_total integer not null default 0,
  mentioned_count integer not null default 0,
  cost_usd numeric(8,4) not null default 0,
  prompt_version text,
  sent_location text,
  sent_language text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_visibility_runs_brand_idx
  on public.ai_visibility_runs (brand_id, started_at desc);

create table public.ai_visibility_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_visibility_runs(id) on delete cascade,
  question_id text not null,          -- stable id: trend lines join on it across runs
  question text not null,
  engine text not null,
  status text not null default 'pending' check (status in ('pending','ok','failed')),
  error text,
  mention_kind text not null default 'none' check (mention_kind in ('cited','named','none')),
  matched_variant text,
  cited_urls jsonb not null default '[]'::jsonb,
  citation_domains text[] not null default '{}',
  answer_text text,
  cost_usd numeric(8,4),
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index ai_visibility_answers_run_idx on public.ai_visibility_answers (run_id);

alter table public.ai_visibility_runs enable row level security;
alter table public.ai_visibility_answers enable row level security;

create policy "users can read own ai_visibility_runs"
  on public.ai_visibility_runs for select
  using (
    brand_id in (
      select id from public.brands where account_id = (select auth.uid())
    )
  );

create policy "users can read own ai_visibility_answers"
  on public.ai_visibility_answers for select
  using (
    run_id in (
      select r.id from public.ai_visibility_runs r
      join public.brands b on b.id = r.brand_id
      where b.account_id = (select auth.uid())
    )
  );

-- Stable question core (D4 hybrid 8+7): generated once, reused every run.
alter table public.brand_configs
  add column if not exists ai_stable_questions jsonb not null default '[]'::jsonb;

-- New topic source for gap-driven angles (D3).
alter table public.topic_candidates drop constraint topic_candidates_source_check;
alter table public.topic_candidates add constraint topic_candidates_source_check
  check (source in ('web_search','dataforseo','voc_history','ai_gap'));
