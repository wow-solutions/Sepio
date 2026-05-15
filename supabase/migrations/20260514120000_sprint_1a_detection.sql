-- Migration: Sprint 1A — Detection Pass Engine schema extensions
-- См. wiki/decisions/0014-sprint-1a-migrations.md (ADR-0014)
--
-- D1: brand_configs.approval_mode enum ('manual'|'auto')
-- D2: brand_configs.voice_samples jsonb (F4 voice fingerprint cold-start)
-- D3: posts.detection_score int 0-100
-- D4: posts.detection_breakdown jsonb (Pangram response)
-- D5: detection_dataset table (append-only, account cascade, post set null)
-- D6: retention default-on, toggle deferred к Sprint 1B

-- ════════════════════════════════════════════════════════════════════
-- D1 — brand_configs.approval_mode
-- ════════════════════════════════════════════════════════════════════
alter table public.brand_configs
  add column approval_mode text not null default 'manual'
  check (approval_mode in ('manual','auto'));

comment on column public.brand_configs.approval_mode is
  'manual = post → pending_approval; auto = post → draft. hybrid отложен до Sprint 2 humanizer.';

-- ════════════════════════════════════════════════════════════════════
-- D2 — brand_configs.voice_samples
-- ════════════════════════════════════════════════════════════════════
-- Optional wizard step F4: «paste 3-5 LinkedIn posts that sound like your brand».
-- Shape: [{text: "...", source: "linkedin"|"manual", added_at: ISO8601}]
alter table public.brand_configs
  add column voice_samples jsonb not null default '[]'::jsonb;

comment on column public.brand_configs.voice_samples is
  'Array of 3-5 human-written samples per brand. Read-as-batch для prompt cache в Sprint 2/3.';

-- ════════════════════════════════════════════════════════════════════
-- D3 — posts.detection_score
-- ════════════════════════════════════════════════════════════════════
-- Real Pangram value, derived: round(fraction_human * 100).
-- Nullable — пост может не иметь score (draft до generate, или Pangram fail).
alter table public.posts
  add column detection_score integer
  check (detection_score is null or (detection_score between 0 and 100));

comment on column public.posts.detection_score is
  'Pangram fraction_human × 100. 87 = 87% human-detected. NULL = ещё не проверен.';

-- ════════════════════════════════════════════════════════════════════
-- D4 — posts.detection_breakdown
-- ════════════════════════════════════════════════════════════════════
alter table public.posts
  add column detection_breakdown jsonb;

comment on column public.posts.detection_breakdown is
  'Полный Pangram response: {headline, prediction, fraction_*, num_*_segments, windows[]}.';

-- ════════════════════════════════════════════════════════════════════
-- D5 — detection_dataset table (append-only лог всех Pangram-проверок)
-- ════════════════════════════════════════════════════════════════════
-- Назначение: Sprint 3+ self-replica fallback классификатор (ADR-0015 TBD)
--             + Sprint 2 humanizer training baseline.
-- account_id cascade = GDPR Art 17 (delete account → удаляется текст полностью)
-- post_id set null = per-post удаление сохраняет training data
create table public.detection_dataset (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  text text not null,
  score integer not null check (score between 0 and 100),
  source text not null check (source in ('generated','humanized','user_paste','external')),
  pangram_breakdown jsonb,
  created_at timestamptz not null default now()
);

create index detection_dataset_account_idx
  on public.detection_dataset(account_id, created_at desc);

comment on table public.detection_dataset is
  'Append-only лог текстов прогнанных через Pangram. ADR-0014 D5. Retention default-on, opt-out в Sprint 1B.';

-- ════════════════════════════════════════════════════════════════════
-- RLS — detection_dataset
-- ════════════════════════════════════════════════════════════════════
alter table public.detection_dataset enable row level security;

-- Users могут читать свои rows (для будущего «my dataset» UI / debugging).
-- Insert/update/delete — только service role (server actions / Inngest handlers).
create policy "users can read own detection dataset"
  on public.detection_dataset for select
  using ((select auth.uid()) = account_id);
