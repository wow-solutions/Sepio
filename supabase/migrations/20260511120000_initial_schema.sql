-- Migration: 0001 — Initial schema
-- Создаёт core таблицы Quoteworthy: accounts, brands, brand_configs, brand_oauth_tokens, posts, dataforseo_cache, audit_log
-- + триггер для автоcоздания account при signup нового user'a в auth.users
--
-- См. wiki/architecture/sprint-0-architecture.md для полного описания.
-- См. wiki/decisions/0006-account-brand-model.md для модели данных (Account → Brands flat).

-- ════════════════════════════════════════════════════════════════════
-- accounts (= users + their account-level data)
-- ════════════════════════════════════════════════════════════════════
-- Связан 1:1 с auth.users (Supabase Auth). Хранит account-level поля
-- которые не относятся к auth (план, billing, usage counters).
create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  display_name text,

  -- Plan info (sync с Lemon Squeezy через webhook в Sprint 1)
  plan_tier text not null default 'trial' check (plan_tier in ('trial','solo','solo_pro','boutique','agency')),
  plan_status text not null default 'active' check (plan_status in ('active','cancelled','past_due','expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  lemonsqueezy_customer_id text,
  lemonsqueezy_subscription_id text,

  -- Usage counters (per-month, reset by cron job в Sprint 1+)
  posts_used_this_period integer not null default 0,
  brands_count integer not null default 0,

  -- Soft delete
  deleted_at timestamptz
);

create index accounts_lemonsqueezy_customer_idx on public.accounts(lemonsqueezy_customer_id);

comment on table public.accounts is 'User accounts (1:1 с auth.users). Содержит plan tier, billing info, usage counters.';

-- ════════════════════════════════════════════════════════════════════
-- brands (clients of the account holder)
-- ════════════════════════════════════════════════════════════════════
-- Один account может иметь до plan.brands_max брендов.
-- Brand = LinkedIn-аккаунт + brand voice config + posts + OAuth tokens.
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  slug text not null,                       -- URL-friendly identifier
  website_url text,
  industry text,                            -- swiped from wizard в Sprint 1
  description text,                         -- 2-3 sentence summary
  primary_language text not null default 'en' check (primary_language in ('en','es','ru','pt','fr')),
  additional_languages text[] not null default '{}',

  -- Onboarding state
  wizard_completed boolean not null default false,
  wizard_step integer not null default 0,

  -- Soft delete
  deleted_at timestamptz,

  unique(account_id, slug)                  -- slug unique within account
);

create index brands_account_idx on public.brands(account_id) where deleted_at is null;

comment on table public.brands is 'Brands managed by an account holder (e.g. AI consultant managing 3-10 clients).';

-- ════════════════════════════════════════════════════════════════════
-- brand_configs (per-brand voice, VOC, SEO guidelines, links map)
-- ════════════════════════════════════════════════════════════════════
-- Заменяет hardcoded context из article-writer/writer.py system prompt.
-- Python pipeline считывает по brand_id перед каждой генерацией.
create table public.brand_configs (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  updated_at timestamptz not null default now(),

  -- Brand voice
  brand_voice text,                         -- Free-text, max 5000 chars (enforced in app layer)
  tone_attributes text[] default '{}',      -- ['professional', 'authoritative', 'warm']
  forbidden_words text[] default '{}',      -- слова которых нельзя использовать
  required_phrases text[] default '{}',     -- слова которые желательно

  -- Customer voice (VOC pain points + desired outcomes)
  voc_pain_points jsonb default '[]'::jsonb, -- [{quote: "...", source: "Twitter"}]
  voc_desired_outcomes jsonb default '[]'::jsonb,
  trigger_events text[] default '{}',

  -- SEO / GEO guidelines
  seo_keywords_primary text[] default '{}',
  seo_keywords_secondary text[] default '{}',
  ai_seo_factors jsonb default '{}'::jsonb, -- Princeton GEO factors config

  -- Internal links map (auto-build over time от published posts)
  internal_links_map jsonb default '[]'::jsonb,

  -- Style guide raw markdown (для AI context)
  style_guide text
);

comment on table public.brand_configs is 'Per-brand AI generation context: voice, VOC, SEO guidelines. Loaded by Python pipeline.';

-- ════════════════════════════════════════════════════════════════════
-- brand_oauth_tokens (encrypted via Supabase Vault — TBD в Sprint 1)
-- ════════════════════════════════════════════════════════════════════
-- Per-brand LinkedIn (and later FB, IG, X) OAuth tokens.
-- vault_secret_id указывает на Supabase Vault secret который содержит
-- зашифрованный JSON {access_token, refresh_token, expires_at}.
-- В Sprint 0 vault_secret_id = nullable (Vault setup в Sprint 1).
create table public.brand_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null check (platform in ('linkedin','facebook','instagram','x','threads','wordpress','webflow','shopify')),
  account_handle text,                      -- @username or page name
  vault_secret_id uuid,                     -- pointer to vault.secrets (NULL в Sprint 0)
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  expires_at timestamptz,                   -- token expiry (если known)
  status text not null default 'active' check (status in ('active','expired','revoked','error')),

  unique(brand_id, platform)                -- один token на platform на brand
);

create index brand_oauth_brand_idx on public.brand_oauth_tokens(brand_id, platform);

comment on table public.brand_oauth_tokens is 'OAuth credentials per brand per platform. Real token хранится в Supabase Vault, здесь только pointer.';

-- ════════════════════════════════════════════════════════════════════
-- posts (generated content)
-- ════════════════════════════════════════════════════════════════════
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Status lifecycle
  status text not null default 'draft' check (status in ('draft','pending_approval','scheduled','publishing','published','failed','cancelled')),

  -- Source / context
  source_type text not null default 'manual' check (source_type in ('manual','auto_research','scheduled_recurring')),
  research_topic text,                      -- topic выбран из DataForSEO research
  research_keywords text[] default '{}',

  -- Content
  platform text not null check (platform in ('linkedin','facebook','instagram','x','threads','wordpress','webflow','shopify','custom')),
  language text not null default 'en',
  content_text text,                        -- main text body
  content_markdown text,                    -- if applicable (sites)
  hashtags text[] default '{}',
  cta_url text,

  -- Images
  cover_image_url text,
  inline_image_urls text[] default '{}',
  image_generation_method text check (image_generation_method in ('svg_template','fal_flux','external_url','none')),

  -- Schedule / publish
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,                    -- LinkedIn post URN, etc.
  external_post_url text,

  -- Approval
  approved_by uuid references public.accounts(id),
  approved_at timestamptz,

  -- Metrics (синхронизированы периодически)
  metrics jsonb default '{}'::jsonb,         -- {impressions: 1234, clicks: 56, ...}
  metrics_updated_at timestamptz
);

create index posts_brand_status_idx on public.posts(brand_id, status);
create index posts_scheduled_for_idx on public.posts(scheduled_for) where status = 'scheduled';

comment on table public.posts is 'Generated content posts. Lifecycle: draft → pending_approval → scheduled → publishing → published.';

-- ════════════════════════════════════════════════════════════════════
-- dataforseo_cache (cost optimization, 7-day TTL)
-- ════════════════════════════════════════════════════════════════════
-- Не зовём DataForSEO повторно за тот же keyword × locale × endpoint.
-- Service-only (no user RLS access).
create table public.dataforseo_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,           -- hash(keyword + locale + endpoint)
  endpoint text not null,                   -- 'serp', 'keywords_for_keywords', etc.
  query_params jsonb not null,
  response_data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index dataforseo_cache_expires_idx on public.dataforseo_cache(expires_at);

comment on table public.dataforseo_cache is 'Cache DataForSEO API responses 7 days. Service-only access (no user RLS).';

-- ════════════════════════════════════════════════════════════════════
-- audit_log (security + debugging, не для analytics)
-- ════════════════════════════════════════════════════════════════════
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  action text not null,                     -- 'oauth.connected', 'post.published', 'plan.upgraded'
  metadata jsonb default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_account_created_idx on public.audit_log(account_id, created_at desc);

comment on table public.audit_log is 'Audit trail для security и debugging. Read-only для users, write через service role.';

-- ════════════════════════════════════════════════════════════════════
-- TRIGGER: автосоздание account при signup
-- ════════════════════════════════════════════════════════════════════
-- Когда новый user signs up через Supabase Auth, автоматически создаётся
-- запись в public.accounts с trial plan и default values.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, display_name, plan_tier, plan_status, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'trial',
    'active',
    now() + interval '14 days'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is 'Создаёт public.accounts row автоматически при signup (auth.users insert). Trial 14 days по умолчанию.';

-- ════════════════════════════════════════════════════════════════════
-- TRIGGER: updated_at автообновление
-- ════════════════════════════════════════════════════════════════════
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

create trigger brand_configs_set_updated_at before update on public.brand_configs
  for each row execute function public.set_updated_at();

create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
