-- R-27: content_groups.source_version was set to 1 on group creation and never
-- incremented at runtime, so editing the blog source never marked its channel
-- variants stale (isVariantFresh compares generated_from_source_version against
-- it) — the kitchen served stale variants forever. This RPC bumps it atomically;
-- server actions call it after a successful source edit.
--
-- SECURITY INVOKER: the caller's RLS on content_groups ("owner crud") still
-- applies, so a user can only bump versions for groups under their own brands.
-- The content_groups_set_updated_at trigger refreshes updated_at on the UPDATE.
create or replace function public.increment_source_version(p_group_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.content_groups
     set source_version = source_version + 1
   where id = p_group_id;
$$;

revoke execute on function public.increment_source_version(uuid) from public;
grant execute on function public.increment_source_version(uuid) to authenticated;
