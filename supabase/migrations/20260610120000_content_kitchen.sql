-- ════════════════════════════════════════════════════════════════════
-- Content Kitchen — base article → per-channel variants.
-- ════════════════════════════════════════════════════════════════════
-- One base blog article (platform='hosted', variant_state='source') fans out to
-- channel-specific variant posts (linkedin/x/instagram/...) grouped by a
-- content_group. Each variant is a normal posts row (reuses the publish
-- dispatcher, status lifecycle, per-post Editorial Memory, platform-aware
-- editing). Lazy generation; staleness tracked via source_version.

-- 1 — content_groups: the "kitchen" container for one topic's fan-out.
create table if not exists public.content_groups (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Bumped whenever the SOURCE article changes; variants generated from an older
  -- version are marked 'stale' (never silently regenerated over edits).
  source_version integer not null default 1 check (source_version > 0),
  -- Channels the user selected as publish destinations for this group.
  selected_platforms text[] not null default array['hosted']::text[],
  check (
    selected_platforms <@ array[
      'hosted','linkedin','telegram','instagram','tiktok','threads','x','facebook'
    ]::text[]
  )
);

create index if not exists content_groups_brand_updated_idx
  on public.content_groups(brand_id, updated_at desc);

drop trigger if exists content_groups_set_updated_at on public.content_groups;
create trigger content_groups_set_updated_at before update on public.content_groups
  for each row execute function public.set_updated_at();

alter table public.content_groups enable row level security;

-- Owner-scoped like posts: a brand belongs to an account (= auth user).
drop policy if exists "content_groups owner crud" on public.content_groups;
create policy "content_groups owner crud"
  on public.content_groups for all
  to authenticated
  using (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  )
  with check (
    brand_id in (select id from public.brands where account_id = (select auth.uid()))
  );

-- 2 — posts: variant columns (additive, nullable for existing rows).
alter table public.posts
  add column if not exists content_group_id uuid references public.content_groups(id) on delete set null,
  add column if not exists source_post_id uuid references public.posts(id) on delete set null,
  add column if not exists variant_state text not null default 'synced'
    check (variant_state in ('source','synced','stale','edited','published')),
  add column if not exists generated_from_source_version integer;

comment on column public.posts.content_group_id is
  'Kitchen group this post belongs to. NULL for legacy/standalone posts.';
comment on column public.posts.source_post_id is
  'The base (source) post this variant was generated from. NULL for the source itself.';
comment on column public.posts.variant_state is
  'source = the base article; synced = generated from current source_version; stale = source changed since; edited = user-edited; published.';

-- 3 — posts.platform: add telegram + tiktok as channels (drift guard with
-- publish_attempts left as-is — telegram/blog already allowed there).
alter table public.posts drop constraint if exists posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in (
    'hosted','linkedin','telegram','instagram','tiktok','threads','x','facebook',
    'wordpress','webflow','shopify','custom'
  ));

-- 4 — indexes for variant queries + one-variant-per-channel-per-group.
create index if not exists posts_content_group_idx
  on public.posts(content_group_id, platform);

create index if not exists posts_source_post_idx
  on public.posts(source_post_id);

create unique index if not exists posts_one_variant_per_group_platform_idx
  on public.posts(content_group_id, platform)
  where content_group_id is not null;

create index if not exists posts_stale_variants_idx
  on public.posts(content_group_id, variant_state)
  where source_post_id is not null;
