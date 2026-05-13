-- Migration: 0003 — Fix Supabase advisor warnings
-- Применено после initial_schema (0001) и rls_policies (0002).
--
-- Чинит:
-- 1. function_search_path_mutable: set_updated_at без явного search_path
-- 2. anon/authenticated_security_definer_function_executable: handle_new_user был callable через REST
-- 3. unindexed_foreign_keys: audit_log.brand_id, posts.approved_by без индекса
-- 4. auth_rls_initplan: 8 RLS policies использовали auth.uid() без (select ...) обёртки
--
-- Игнорируются (это нормально):
-- - rls_enabled_no_policy для dataforseo_cache (service-only by design)
-- - rls_auto_enable function — Supabase-managed, не наша

-- 1. Fix function_search_path_mutable
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Revoke EXECUTE на handle_new_user
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- 3. Add missing foreign key indexes
create index audit_log_brand_idx on public.audit_log(brand_id);
create index posts_approved_by_idx on public.posts(approved_by);

-- 4. Wrap auth.uid() in (select auth.uid()) — performance optimization для RLS at scale
-- Postgres кэширует значение между строками вместо повторного вычисления

-- accounts
drop policy "users can read own account" on public.accounts;
create policy "users can read own account"
  on public.accounts for select
  using ((select auth.uid()) = id);

drop policy "users can update own account" on public.accounts;
create policy "users can update own account"
  on public.accounts for update
  using ((select auth.uid()) = id);

-- brands
drop policy "users can crud own brands" on public.brands;
create policy "users can crud own brands"
  on public.brands for all
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- brand_configs
drop policy "users can crud configs of own brands" on public.brand_configs;
create policy "users can crud configs of own brands"
  on public.brand_configs for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- brand_oauth_tokens
drop policy "users can crud oauth tokens of own brands" on public.brand_oauth_tokens;
create policy "users can crud oauth tokens of own brands"
  on public.brand_oauth_tokens for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- posts
drop policy "users can crud posts of own brands" on public.posts;
create policy "users can crud posts of own brands"
  on public.posts for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- audit_log
drop policy "users can read own audit log" on public.audit_log;
create policy "users can read own audit log"
  on public.audit_log for select
  using (account_id = (select auth.uid()));
