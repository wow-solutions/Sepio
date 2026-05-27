-- Migration: Phase 1 publishing infrastructure (Lane A)
-- Создаёт инфраструктуру для multi-platform publishing (Telegram / Blog) + image gen + data deletion.
--
-- Источник: /gstack-plan-eng-review 2026-05-22, design doc user-main-design-20260522-204133.md
-- См. wiki/decisions/0019-mvp-scope-platforms-and-industry.md (ADR-0019, Phase 1 scope).
--
-- Покрывает Lane A: brand_platform_connections, publish_attempts, data_deletion_requests,
-- accounts.fal_flux_used_this_period + RPC, posts.status расширение.
--
-- Outside-voice review (2026-05-26) findings, учтённые здесь:
--   B1  posts.status не содержал 'partially_published' (orchestrator его ставит) → ALTER ниже.
--   B3  publish_attempts row-vs-update неоднозначность → выбрана IN-PLACE UPDATE модель
--       (одна строка на (post, platform, target), attempt_number инкрементится на месте).
--       Уникальность через partial-aware unique index с NULLS NOT DISTINCT (PG15+).
--   SF2 data_deletion_requests: FK на accounts, индекс для idempotency-lookup, убран дубль-индекс.
--   SF5 brand_platform_connections.vault_secret_id остаётся nullable (pending-строки легитимно null) —
--       инвариант «telegram ⇒ token есть» проверяется в app-слое, не CHECK (blog HMAC отличается).
--   SF6 updated_at + триггеры на mutable таблицах.
--   Nit platform CHECK на publish_attempts (drift guard vs posts.platform).

-- ════════════════════════════════════════════════════════════════════
-- brand_platform_connections (non-OAuth platforms: Telegram bot, Blog webhook)
-- ════════════════════════════════════════════════════════════════════
-- OAuth bearer-токены остаются в brand_oauth_tokens. Сюда идут статические
-- credentials (Telegram bot token, Blog HMAC secret) — отдельная семантика (CQ1).
-- Зашифрованный секрет хранится в Supabase Vault, здесь только pointer.
create table public.brand_platform_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null check (platform in ('telegram','blog')),
  account_handle text not null,             -- @channel_username (telegram) | blog URL
  vault_secret_id uuid,                     -- bot token (telegram) | HMAC secret (blog); NULL для pending
  metadata jsonb not null default '{}',     -- {chat_id, channel_title, bot_id, bot_username} | {webhook_url, signing_method}
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  status text not null default 'active' check (status in ('active','pending','revoked','error')),
  last_error text,                          -- последнее сообщение об ошибке если status='error'

  unique(brand_id, platform, account_handle) -- CQ2: несколько TG-каналов на бренд
);

create index brand_platform_conn_brand_idx
  on public.brand_platform_connections(brand_id, platform);

comment on table public.brand_platform_connections is
  'Non-OAuth platform connections (Telegram bot tokens, Blog webhooks). Зашифрованные credentials в Vault. Lane C webhook ОБЯЗАН разрешить account_handle через getChat ДО INSERT (chat_id ≠ unique key).';

-- ════════════════════════════════════════════════════════════════════
-- publish_attempts (per-publish per-target audit + retry driver)
-- ════════════════════════════════════════════════════════════════════
-- IN-PLACE UPDATE модель: одна строка на (post, platform, target). Жизненный цикл
-- queued → running → success | retry → running → ... | failed. attempt_number
-- инкрементится на той же строке при каждом retry. Это даёт тривиальный «latest
-- attempt» (строка одна) и единый источник для retry-поллера.
-- target = либо connection_id (Telegram/Blog), либо oauth_token_id (LinkedIn).
create table public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null
    check (platform in ('linkedin','facebook','instagram','x','threads','wordpress','webflow','shopify','telegram','blog','custom')),
  connection_id uuid references public.brand_platform_connections(id) on delete set null,
  oauth_token_id uuid references public.brand_oauth_tokens(id) on delete set null,
  status text not null check (status in ('queued','running','success','retry','failed')),
  error_code text,
  error_message text,
  retry_after_at timestamptz,
  attempt_number integer not null default 1,
  attempted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  external_post_id text,                    -- URL/ID поста на платформе после success
  inngest_event_id text
);

-- Один target на пост → одна строка. NULLS NOT DISTINCT (PG15+) трактует NULL как
-- равные, поэтому два LinkedIn-аттемпта (connection_id=NULL) с тем же oauth_token_id
-- конфликтуют (правильно), а два TG-канала (разные connection_id) — нет (правильно).
create unique index publish_attempts_target_uniq
  on public.publish_attempts(post_id, platform, connection_id, oauth_token_id)
  nulls not distinct;

create index publish_attempts_post_idx
  on public.publish_attempts(post_id);

-- FK-индексы (advisor unindexed_foreign_keys + ускоряют ON DELETE SET NULL каскады).
create index publish_attempts_brand_idx
  on public.publish_attempts(brand_id);
create index publish_attempts_connection_idx
  on public.publish_attempts(connection_id);
create index publish_attempts_oauth_token_idx
  on public.publish_attempts(oauth_token_id);

-- Retry-поллер выбирает строки «пора повторить». status уже сужен в WHERE,
-- поэтому retry_after_at ведущий — корректно для range-скана due-строк.
create index publish_attempts_retry_idx
  on public.publish_attempts(retry_after_at, status)
  where status in ('queued','retry');

comment on table public.publish_attempts is
  'Audit log per-publish per-target. IN-PLACE модель: одна строка на (post,platform,target), retry на месте. Записи через service role (orchestrator/poller); users только читают (RLS ниже).';

-- ════════════════════════════════════════════════════════════════════
-- data_deletion_requests (Meta/TikTok data-deletion callback persistence)
-- ════════════════════════════════════════════════════════════════════
-- Нужно для подачи Meta/TikTok App Review (callback URL — обязательное поле формы).
-- Idempotency по (source_platform, app_scoped_user_id): повтор re-confirm'ит,
-- а не удаляет дважды (Meta signed_request не несёт nonce/timestamp).
create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique,   -- unique уже создаёт индекс (дубль-индекс убран)
  source_platform text not null check (source_platform in ('meta','tiktok')),
  app_scoped_user_id text not null,         -- platform-specific user ID из подписанного payload
  internal_user_id uuid references public.accounts(id) on delete set null, -- наш user если резолвится
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed'))
);

create index ddr_platform_user_idx
  on public.data_deletion_requests(source_platform, app_scoped_user_id);

-- FK-индекс на internal_user_id (advisor unindexed_foreign_keys + ON DELETE SET NULL).
create index ddr_internal_user_idx
  on public.data_deletion_requests(internal_user_id);

comment on table public.data_deletion_requests is
  'Meta/TikTok data-deletion callback log + статус-страница. Service-role only (RLS без policies). Idempotent по (source_platform, app_scoped_user_id).';

-- ════════════════════════════════════════════════════════════════════
-- accounts.fal_flux_used_this_period + atomic increment RPC (Lane E)
-- ════════════════════════════════════════════════════════════════════
-- Per-period счётчик fal.ai генераций (cost ceiling). Лимит per-plan живёт в
-- app-конфиге (lib/billing/plans.ts) и передаётся в RPC параметром — БД не дублирует
-- pricing-таблицу. РЕСЕТ: монтируется к тому же месячному cron'у что и
-- posts_used_this_period (Sprint 1B billing); иначе счётчик «течёт» бесконечно. TODO.
alter table public.accounts
  add column if not exists fal_flux_used_this_period integer not null default 0;

-- Атомарный check-and-increment: true если был под лимитом (инкремент сделан),
-- false если на/над лимитом (инкремент НЕ сделан). UPDATE ... WHERE — одна транзакция,
-- безопасно при конкурентных вызовах.
create function public.increment_fal_flux_atomic(p_account_id uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.accounts
     set fal_flux_used_this_period = fal_flux_used_this_period + 1
   where id = p_account_id
     and fal_flux_used_this_period < p_limit;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function public.increment_fal_flux_atomic(uuid, integer) is
  'Атомарный check-and-increment fal.ai usage. Возвращает true если под лимитом (инкремент применён), false если лимит достигнут. Лимит передаётся из app plan-конфига.';

-- Только service role зовёт RPC (cost-ceiling — серверная логика, не клиентская).
-- Revoke и от public тоже (иначе callable через REST — см. fix_advisor_warnings.sql).
revoke execute on function public.increment_fal_flux_atomic(uuid, integer) from anon, authenticated, public;

-- ════════════════════════════════════════════════════════════════════
-- posts.status: добавить 'partially_published' (orchestrator terminal state)
-- ════════════════════════════════════════════════════════════════════
-- Fan-out publish: часть платформ успешна, часть — нет → 'partially_published'.
-- Без этого UPDATE упал бы на check-constraint (outside-voice B1).
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('draft','pending_approval','scheduled','publishing','published','partially_published','failed','cancelled'));

-- ════════════════════════════════════════════════════════════════════
-- updated_at триггеры (mirror существующих таблиц)
-- ════════════════════════════════════════════════════════════════════
create trigger brand_platform_connections_set_updated_at before update on public.brand_platform_connections
  for each row execute function public.set_updated_at();

create trigger publish_attempts_set_updated_at before update on public.publish_attempts
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- RLS policies
-- ════════════════════════════════════════════════════════════════════
alter table public.brand_platform_connections enable row level security;
alter table public.publish_attempts enable row level security;
alter table public.data_deletion_requests enable row level security;

-- brand_platform_connections: owners полный CRUD через ownership chain (как brand_oauth_tokens).
-- auth.uid() обёрнут в (select ...) — auth_rls_initplan optimization (см. fix_advisor_warnings.sql).
create policy "users can crud platform connections of own brands"
  on public.brand_platform_connections for all
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- publish_attempts: users только ЧИТАЮТ свои (UI per-channel status).
-- Запись (insert/update/retry) — только service role (orchestrator/poller). Mirror audit_log.
create policy "users can read publish attempts of own brands"
  on public.publish_attempts for select
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- data_deletion_requests: service-role only (no policies). Статус-страница читает
-- по confirmation_code через service-role route — не под authed RLS (иначе утечка чужих кодов).
