-- Enable Supabase Vault for encrypted secret storage.
-- Used by brand_oauth_tokens.vault_secret_id pointers to vault.secrets.
-- See wiki/architecture/oauth-token-storage.md for the storage strategy.
-- See ADR-0017 D6 deliverable 9.2 for the LinkedIn OAuth flow that consumes this.

create extension if not exists supabase_vault;

-- ════════════════════════════════════════════════════════════════════
-- Public-schema wrappers around vault.* — let supabase-js .rpc() reach Vault.
-- All four are security definer + service_role only (revoke from anon/authenticated).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.vault_create_secret(
  p_secret jsonb,
  p_name text,
  p_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select vault.create_secret(p_secret::text, p_name, p_description) into v_id;
  return v_id;
end;
$$;

create or replace function public.vault_read_secret(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id = p_id;

  if v_secret is null then
    return null;
  end if;

  return v_secret::jsonb;
end;
$$;

create or replace function public.vault_update_secret(
  p_id uuid,
  p_secret jsonb
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  perform vault.update_secret(p_id, p_secret::text);
end;
$$;

create or replace function public.vault_delete_secret(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = p_id;
end;
$$;

-- Lock down: only service_role may call. Never expose to anon/authenticated.
revoke execute on function public.vault_create_secret(jsonb, text, text) from public;
revoke execute on function public.vault_read_secret(uuid) from public;
revoke execute on function public.vault_update_secret(uuid, jsonb) from public;
revoke execute on function public.vault_delete_secret(uuid) from public;

grant execute on function public.vault_create_secret(jsonb, text, text) to service_role;
grant execute on function public.vault_read_secret(uuid) to service_role;
grant execute on function public.vault_update_secret(uuid, jsonb) to service_role;
grant execute on function public.vault_delete_secret(uuid) to service_role;
