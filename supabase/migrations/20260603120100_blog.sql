-- Migration: blog_posts (публичный build-in-public блог) + accounts.is_blog_admin
-- Раздел sepio.app/blog. Посты живут в БД, рендер публичный. Доступ к редактору —
-- ТОЛЬКО владелец: отдельный флаг is_blog_admin (НЕ beta_access — блог публичный,
-- risk выше, beta держат тест-юзеры). Григорий ставит флаг руками в Supabase.
-- en-only на старте, но уникальность (slug, locale) — под будущие переводы.
-- См. план blog-plan (recon→synthesize). Сабж PR1 из 5.
--
-- ИДЕМПОТЕНТНО (if not exists / drop if exists): применяется руками через SQL Editor
-- СЕЙЧАС и повторно через CI `db push` при мерже — оба без ошибок. Снимает зависимость
-- от ручной правки трекера (см. project_migration_apply_ops: pooler/IPv6/пароль).
--
-- ВНИМАНИЕ: политика (a) — ПЕРВАЯ в проекте `to anon` (таблица открыта на чтение
-- неаутентифицированным, т.к. блог публичный). Черновики анонимам невидимы
-- (status-фильтр). Проверить до мержа: anon видит только published.

-- 1. Owner-only admin-флаг (отдельно от beta_access)
alter table public.accounts
  add column if not exists is_blog_admin boolean not null default false;

comment on column public.accounts.is_blog_admin is
  'Право публиковать в публичный блог (/blog/admin). Отдельно от beta_access '
  '(блог публичный, risk выше). Default false; ставится руками (Supabase) владельцу.';

-- 2. Таблица постов блога
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  locale text not null default 'en' check (locale in ('en', 'es', 'ru')),
  title text not null,
  description text,
  body text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  material_updated_at timestamptz,
  author_id uuid references public.accounts(id) on delete set null,
  author_name text,
  author_slug text,
  cover_image_url text,
  og_title text,
  og_description text,
  og_image_url text,
  firewall_ack_by uuid references public.accounts(id) on delete set null,
  firewall_ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, locale)
);

comment on table public.blog_posts is
  'Публичные посты блога sepio.app (build-in-public + SEO/GEO). Чтение — анонимное '
  'для status=published; запись — только accounts.is_blog_admin. en-only на старте, '
  '(slug, locale) под будущие переводы.';
comment on column public.blog_posts.body is 'Markdown-исходник поста.';
comment on column public.blog_posts.material_updated_at is
  'Ставится ТОЛЬКО при «материальном обновлении» (GEO) → dateModified + sitemap '
  'lastmod. На тривиальных правках НЕ бампается.';
comment on column public.blog_posts.firewall_ack_at is
  'Аудит: когда подтверждён pre-publish firewall-чеклист (WHAT-not-HOW).';

-- 3. Индексы (partial-index для публичной ленты; FK-индексы под unindexed_foreign_keys advisor)
create index if not exists blog_posts_published_idx
  on public.blog_posts (locale, published_at desc)
  where status = 'published';
create index if not exists blog_posts_author_idx on public.blog_posts (author_id);
create index if not exists blog_posts_firewall_ack_idx on public.blog_posts (firewall_ack_by);

-- 4. updated_at-триггер (reuse общей функции; drop+create для идемпотентности)
drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- 5. RLS
alter table public.blog_posts enable row level security;

-- (a) Публичное анонимное чтение опубликованных постов (первая `to anon` в проекте)
drop policy if exists "anyone can read published blog posts" on public.blog_posts;
create policy "anyone can read published blog posts"
  on public.blog_posts for select
  to anon, authenticated
  using (status = 'published');

-- (b) Blog-админы управляют всеми постами (вкл. свои черновики — публике их прячет (a)).
-- Permissive-политики комбинируются по OR: админ видит и published (через a), и черновики (через b).
drop policy if exists "blog admins manage posts" on public.blog_posts;
create policy "blog admins manage posts"
  on public.blog_posts for all
  to authenticated
  using (
    exists (
      select 1 from public.accounts a
      where a.id = (select auth.uid()) and a.is_blog_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = (select auth.uid()) and a.is_blog_admin = true
    )
  );
