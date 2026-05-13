-- Migration: 0002 — Row Level Security policies
-- Поскольку у проекта включён "Enable automatic RLS", таблицы УЖЕ имеют RLS enabled.
-- Эта миграция только создаёт policies (правила «кто что может»).
--
-- Принцип: каждый user видит только свои accounts/brands/configs/posts (через account_id ownership chain).
-- См. wiki/decisions/0006-account-brand-model.md для модели.

-- На всякий случай явно включаем RLS (idempotent если trigger уже сделал)
alter table public.accounts enable row level security;
alter table public.brands enable row level security;
alter table public.brand_configs enable row level security;
alter table public.brand_oauth_tokens enable row level security;
alter table public.posts enable row level security;
alter table public.dataforseo_cache enable row level security;
alter table public.audit_log enable row level security;

-- ════════════════════════════════════════════════════════════════════
-- accounts: owners read/update свой account
-- ════════════════════════════════════════════════════════════════════
-- Insert обрабатывается trigger'ом handle_new_user (security definer)
create policy "users can read own account"
  on public.accounts for select
  using (auth.uid() = id);

create policy "users can update own account"
  on public.accounts for update
  using (auth.uid() = id);

-- Delete не разрешаем напрямую — soft-delete через update(deleted_at)

-- ════════════════════════════════════════════════════════════════════
-- brands: owners полный CRUD
-- ════════════════════════════════════════════════════════════════════
create policy "users can crud own brands"
  on public.brands for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- brand_configs: inherit access через brand
-- ════════════════════════════════════════════════════════════════════
create policy "users can crud configs of own brands"
  on public.brand_configs for all
  using (
    brand_id in (select id from public.brands where account_id = auth.uid())
  )
  with check (
    brand_id in (select id from public.brands where account_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════
-- brand_oauth_tokens: inherit access через brand
-- ════════════════════════════════════════════════════════════════════
create policy "users can crud oauth tokens of own brands"
  on public.brand_oauth_tokens for all
  using (
    brand_id in (select id from public.brands where account_id = auth.uid())
  )
  with check (
    brand_id in (select id from public.brands where account_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════
-- posts: inherit access через brand
-- ════════════════════════════════════════════════════════════════════
create policy "users can crud posts of own brands"
  on public.posts for all
  using (
    brand_id in (select id from public.brands where account_id = auth.uid())
  )
  with check (
    brand_id in (select id from public.brands where account_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════
-- dataforseo_cache: service role only (no user policies)
-- ════════════════════════════════════════════════════════════════════
-- RLS enabled, но никаких policies = только service role может читать/писать.
-- Это правильно — кэш используется только pipeline'ом, не клиентом.

-- ════════════════════════════════════════════════════════════════════
-- audit_log: read-only для users (видят свой), write через service role
-- ════════════════════════════════════════════════════════════════════
create policy "users can read own audit log"
  on public.audit_log for select
  using (account_id = auth.uid());

-- INSERT/UPDATE/DELETE для users не разрешены = только service role.
