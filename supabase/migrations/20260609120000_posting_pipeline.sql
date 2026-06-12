-- Migration: Posting Pipeline foundation (Task 1)
-- См. wiki/architecture/posting-pipeline.md (eng-review + 2× Codex consult 2026-06-09).
--
-- Цель: дать Sepio публиковать НАСТОЯЩУЮ статью на блог клиента БЕЗ доступа к коду
-- его сайта. Заменяет отвергнутый «webhook-приёмник на 24clima» (приёмник = код на
-- стороне клиента, чего у реальных клиентов нет).
--
-- Состав:
--   1. posts += article-поля (title/slug/excerpt/cover_image_alt/canonical_url).
--      Модель поста была заточена под LinkedIn-коротыш; без title статью никуда не
--      опубликовать (блокер №1 по Codex).
--   2. brands += advisory-детект платформы сайта + ручной override. Заполняется
--      АСИНХРОННО (не в createBrand): синхронный пробинг = флаки (Cloudflare/WAF/JS).
--   3. brand_blog_posts — НОВАЯ таблица под блог, который хостим МЫ (/p/{brandSlug}/
--      {slug}) = универсальный фоллбэк для ЛЮБОГО сайта (вкл. самоделки). НЕ reuse
--      blog_posts: тот = публичный блог Sepio (admin-only RLS, нет brand_id,
--      глобальная (slug,locale)). Клиентскому нужен brand_id + ownership-RLS.
--
-- ИДЕМПОТЕНТНО (if not exists / drop if exists): применяется руками через SQL Editor
-- и повторно через CI `db push`. См. project_migration_apply_ops.

-- ════════════════════════════════════════════════════════════════════
-- 1 — posts: article-поля (аддитивно, всё nullable — соц-посты их не используют)
-- ════════════════════════════════════════════════════════════════════
alter table public.posts
  add column if not exists title           text,
  add column if not exists slug            text,
  add column if not exists excerpt         text,
  add column if not exists cover_image_alt text,
  add column if not exists canonical_url   text;

comment on column public.posts.title is
  'Заголовок статьи. NULL для соц-постов (LinkedIn и т.п.). Обязателен для блог/WP-публикации.';
comment on column public.posts.slug is
  'URL-friendly slug статьи. NULL для соц-постов. Генерится из title при публикации в блог.';
comment on column public.posts.excerpt is
  'Краткое описание/мета-дескрипшн статьи (SEO). NULL для соц-постов.';

-- 'hosted' = публикация на наш блог /p/{brandId}/{slug} (универсальный фоллбэк).
-- Расширяем CHECK на posts.platform И publish_attempts.platform (drift guard).
alter table public.posts drop constraint if exists posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in ('linkedin','facebook','instagram','x','threads','wordpress','webflow','shopify','custom','hosted'));

alter table public.publish_attempts drop constraint if exists publish_attempts_platform_check;
alter table public.publish_attempts add constraint publish_attempts_platform_check
  check (platform in ('linkedin','facebook','instagram','x','threads','wordpress','webflow','shopify','telegram','blog','custom','hosted'));

-- ════════════════════════════════════════════════════════════════════
-- 2 — brands: advisory-детект платформы сайта + ручной override
-- ════════════════════════════════════════════════════════════════════
-- detect — ПОДСКАЗКА, не истина: всегда есть platform_override. Заполняется async.
alter table public.brands
  add column if not exists detected_platform   text
    check (detected_platform in ('wordpress','shopify','webflow','wix','squarespace','custom')),
  add column if not exists detected_confidence text
    check (detected_confidence in ('high','medium','low')),
  add column if not exists detected_signals    jsonb not null default '[]'::jsonb,
  add column if not exists detected_at         timestamptz,
  add column if not exists platform_override   text
    check (platform_override in ('wordpress','shopify','webflow','wix','squarespace','custom','hosted'));

comment on column public.brands.detected_platform is
  'Авто-детект движка сайта (site-fingerprint.ts, async). Advisory — определяет рекомендуемый '
  'способ публикации. NULL = ещё не сканировали / не определилось.';
comment on column public.brands.platform_override is
  'Ручной выбор юзера, перебивает detected_platform. hosted = публиковать на наш блог /p/.';

-- ════════════════════════════════════════════════════════════════════
-- 3 — brand_blog_posts (хостим МЫ; универсальный фоллбэк публикации)
-- ════════════════════════════════════════════════════════════════════
-- Публичный per-brand блог на /p/{brandSlug}/{slug}. Работает для любого сайта без
-- доступа к коду/ключам/DNS. Отдельно от blog_posts (тот — блог самого Sepio).
create table if not exists public.brand_blog_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_post_id uuid references public.posts(id) on delete set null,  -- откуда опубликовано
  slug text not null,
  locale text not null default 'en' check (locale in ('en','es','ru','pt','fr')),
  title text not null,
  excerpt text,
  body_markdown text,
  cover_image_url text,
  cover_image_alt text,
  status text not null default 'published' check (status in ('draft','published')),
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (brand_id, slug, locale)            -- лидирующий brand_id покрывает FK-индекс
);

-- source_post_id FK не покрыт unique(brand_id,...) → отдельный индекс (advisor unindexed_fk)
create index if not exists brand_blog_posts_source_post_idx
  on public.brand_blog_posts(source_post_id);
-- Публичная лента бренда
create index if not exists brand_blog_posts_public_idx
  on public.brand_blog_posts(brand_id, published_at desc)
  where status = 'published';

drop trigger if exists brand_blog_posts_set_updated_at on public.brand_blog_posts;
create trigger brand_blog_posts_set_updated_at before update on public.brand_blog_posts
  for each row execute function public.set_updated_at();

comment on table public.brand_blog_posts is
  'Хостимый Sepio публичный блог клиента (/p/{brandSlug}/{slug}). Универсальный фоллбэк '
  'публикации для любого сайта без доступа к его коду. НЕ путать с blog_posts (блог Sepio).';

-- ════════════════════════════════════════════════════════════════════
-- 4 — RLS: ownership через brands.account_id + публичное чтение published
-- ════════════════════════════════════════════════════════════════════
alter table public.brand_blog_posts enable row level security;

-- (a) Публичное анонимное чтение опубликованных (рендер /p/ доступен всем)
drop policy if exists "anyone can read published brand blog posts" on public.brand_blog_posts;
create policy "anyone can read published brand blog posts"
  on public.brand_blog_posts for select
  to anon, authenticated
  using (status = 'published');

-- (b) Владельцы бренда — полный CRUD через свой account (вкл. черновики; их прячет (a))
drop policy if exists "users can crud brand blog posts of own brands" on public.brand_blog_posts;
create policy "users can crud brand blog posts of own brands"
  on public.brand_blog_posts for all
  to authenticated
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );
