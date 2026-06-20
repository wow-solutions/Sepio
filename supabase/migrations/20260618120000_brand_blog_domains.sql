-- ════════════════════════════════════════════════════════════════════
-- brand_blog_domains — map a client's own domain (e.g. blog.24clima.com)
-- to a brand, so the Sepio-hosted blog renders under the CLIENT's domain.
-- This is the universal zero-client-code publishing path for custom sites
-- with no write API: the article already lives in brand_blog_posts; the
-- domain just maps to the brand. The client only adds one DNS CNAME.
-- See plan: Slice 2 — publish to client site, subdomain-hosted.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.brand_blog_domains (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  -- host only, forced lowercase so case-variants can't bypass uniqueness and
  -- collide in the case-insensitive resolver (cross-tenant hijack guard).
  domain text not null check (domain = lower(domain)),
  status text not null default 'pending'
    check (status in ('pending','verifying','active','error')),
  vercel_domain_id text,                      -- id returned by Vercel add-domain (for later automation)
  cname_target text,                          -- value we tell the client to CNAME to
  last_error text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (brand_id),                          -- one blog domain per brand (v1)
  unique (domain)                             -- a domain maps to exactly one brand
);

comment on table public.brand_blog_domains is
  'Маппинг собственного домена клиента (blog.client.com) на бренд для рендера '
  'Sepio-hosted блога под доменом клиента. Zero-client-code путь публикации.';

drop trigger if exists brand_blog_domains_set_updated_at on public.brand_blog_domains;
create trigger brand_blog_domains_set_updated_at before update on public.brand_blog_domains
  for each row execute function public.set_updated_at();

-- ── RLS: owners manage their own rows, but may NOT self-activate. A row only
-- becomes status='active' (which the resolver trusts to render a domain) via
-- the service role after DNS/Vercel verification — otherwise a tenant could
-- claim+activate someone else's domain. No public read (the resolver is a
-- SECURITY DEFINER function returning only active rows).
alter table public.brand_blog_domains enable row level security;

drop policy if exists "users can crud blog domains of own brands" on public.brand_blog_domains;

create policy "owners read own blog domains"
  on public.brand_blog_domains for select
  to authenticated
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

create policy "owners insert non-active blog domains"
  on public.brand_blog_domains for insert
  to authenticated
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
    and status <> 'active'
  );

create policy "owners update non-active blog domains"
  on public.brand_blog_domains for update
  to authenticated
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
    and status <> 'active'
  );

create policy "owners delete own blog domains"
  on public.brand_blog_domains for delete
  to authenticated
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- ── Public host→brand resolver. Anonymous visitors hit the client domain; the
-- renderer needs brandId + locales to render. Exposes ONLY (brand_id, locales)
-- for an ACTIVE domain — no secrets, no full-table scan from the client.
create or replace function public.resolve_blog_domain(p_host text)
returns table (brand_id uuid, brand_name text, primary_locale text, locales text[])
language sql
security definer
set search_path = public
stable
as $$
  select d.brand_id, b.name, b.primary_language, b.additional_languages
  from public.brand_blog_domains d
  join public.brands b on b.id = d.brand_id
  where lower(d.domain) = lower(p_host)
    and d.status = 'active'
  limit 1;
$$;

comment on function public.resolve_blog_domain(text) is
  'Публичный резолвер host→brand для активного клиентского блог-домена. '
  'Возвращает brand_id + локали; вызывается анонимно из рендера _sites.';

grant execute on function public.resolve_blog_domain(text) to anon, authenticated;

-- Reverse lookup: the active blog domain for a brand (or null). Used by the
-- Sepio-hosted /p/<brandId> pages to noindex the duplicate once the brand
-- publishes under its own domain. SECURITY DEFINER so anon crawlers see it
-- (the table itself is owner-only RLS).
create or replace function public.blog_domain_for_brand(p_brand_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select d.domain
  from public.brand_blog_domains d
  where d.brand_id = p_brand_id
    and d.status = 'active'
  limit 1;
$$;

comment on function public.blog_domain_for_brand(uuid) is
  'Активный блог-домен бренда (или null). Для noindex дубликата на sepio.app/p/.';

grant execute on function public.blog_domain_for_brand(uuid) to anon, authenticated;
