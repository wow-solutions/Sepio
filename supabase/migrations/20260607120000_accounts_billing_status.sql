-- Track A — Lemon Squeezy billing groundwork.
-- (1) plan_status CHECK не покрывал реальные состояния LS-подписки: paused и
--     unpaid. Без них syncSubscription упёрся бы в CHECK и упал. Дропаем старый
--     constraint, ставим расширенный. Маппинг LS→plan_status:
--       on_trial/active → active · past_due → past_due · unpaid → unpaid
--       paused → paused · cancelled → cancelled (доступ до ends_at) · expired → expired
-- (2) lemonsqueezy_updated_at — метка времени из payload подписки (attributes.updated_at).
--     Защита от перепутанного порядка вебхуков: применяем событие только если оно
--     не старше уже сохранённого (LS не гарантирует порядок и шлёт повторы).
-- Идемпотентно. Запись в эти колонки — только service-role (см. 20260604 lockdown;
-- grant authenticated остаётся (display_name) — новые колонки под него не попадают).

alter table public.accounts
  drop constraint if exists accounts_plan_status_check;

alter table public.accounts
  add constraint accounts_plan_status_check
  check (plan_status in ('active','cancelled','past_due','expired','paused','unpaid'));

alter table public.accounts
  add column if not exists lemonsqueezy_updated_at timestamptz;

-- (2b) plan_tier gains 'early' — the single early-access SKU ($29) on sale now.
--      The full agency ladder (starter/growth/agency/scale) will be added when
--      functionality is complete; the legacy solo/solo_pro/boutique/agency keys
--      are kept for now and cleaned up at that rename.
alter table public.accounts
  drop constraint if exists accounts_plan_tier_check;
alter table public.accounts
  add constraint accounts_plan_tier_check
  check (plan_tier in ('trial','solo','solo_pro','boutique','agency','early'));

-- (3) Atomic, ordering-guarded subscription sync. A read-then-write in app code
--     races: two concurrent webhooks can both read the old updated_at and the
--     stale one can land last. Push the guard into the UPDATE's WHERE so Postgres
--     row-locks serialise it and re-evaluate the guard against committed state.
--     Returns 'applied' | 'stale' | 'not_found'. service_role only (the webhook).
create or replace function public.apply_ls_subscription(
  p_account_id uuid,
  p_plan_tier text,
  p_plan_status text,
  p_period_end timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_updated_at timestamptz
)
returns text
language plpgsql
as $$
begin
  if not exists (select 1 from public.accounts where id = p_account_id) then
    return 'not_found';
  end if;

  update public.accounts set
    plan_tier = p_plan_tier,
    plan_status = p_plan_status,
    current_period_end = p_period_end,
    lemonsqueezy_customer_id = p_customer_id,
    lemonsqueezy_subscription_id = p_subscription_id,
    lemonsqueezy_updated_at = p_updated_at
  where id = p_account_id
    -- ordering guard: only apply a strictly newer event (timestamptz compare)
    and (lemonsqueezy_updated_at is null or lemonsqueezy_updated_at < p_updated_at)
    -- never let a late event for an OLD subscription mutate a newer one — UNLESS
    -- the stored one is expired (dead). checkout.ts only starts a fresh checkout
    -- from 'expired', so a new subscription_created legitimately replaces it; for
    -- any live status, a different subscription_id is a stale cross-sub event.
    and (lemonsqueezy_subscription_id is null
         or lemonsqueezy_subscription_id = p_subscription_id
         or plan_status = 'expired');

  if found then
    return 'applied';
  end if;
  return 'stale';
end;
$$;

revoke execute on function public.apply_ls_subscription(uuid,text,text,timestamptz,text,text,timestamptz) from public;
grant execute on function public.apply_ls_subscription(uuid,text,text,timestamptz,text,text,timestamptz) to service_role;
