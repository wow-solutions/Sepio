// Supabase Vault helpers. Wraps public.vault_* RPC functions (defined in
// migration 20260517120000) which in turn call vault.* under security definer.
//
// Use ONLY in server contexts (API routes, server actions). The underlying
// RPC requires service_role. The TypeScript guard mirrors service-role.ts —
// throws if called from a client bundle.
//
// See wiki/architecture/oauth-token-storage.md for the storage strategy.

import { z } from "zod";
import { createServiceRoleClient } from "./supabase/service-role";
import type { Json } from "./supabase/database.types";

export class VaultError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

// Shape of LinkedIn OAuth tokens stored in Vault. Extend with other platforms
// later (Twitter / IG / TikTok) by adding optional discriminated variants.
export const LinkedInTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_at: z.string().datetime(),
  scope: z.string(),
});

export type LinkedInToken = z.infer<typeof LinkedInTokenSchema>;

function guardServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new VaultError("vault helpers called from client bundle — server only");
  }
}

export async function createSecret(
  value: Json,
  name: string,
  description = "",
): Promise<string> {
  guardServerOnly();
  const client = createServiceRoleClient();

  const { data, error } = await client.rpc("vault_create_secret", {
    p_secret: value,
    p_name: name,
    p_description: description,
  });

  if (error) {
    throw new VaultError(`vault_create_secret failed: ${error.message}`, error);
  }
  if (typeof data !== "string") {
    throw new VaultError(
      `vault_create_secret returned unexpected type: ${typeof data}`,
    );
  }
  return data;
}

export async function readSecret<T = unknown>(secretId: string): Promise<T | null> {
  guardServerOnly();
  const client = createServiceRoleClient();

  const { data, error } = await client.rpc("vault_read_secret", {
    p_id: secretId,
  });

  if (error) {
    throw new VaultError(`vault_read_secret failed: ${error.message}`, error);
  }
  if (data === null) return null;
  return data as T;
}

export async function readLinkedInToken(secretId: string): Promise<LinkedInToken> {
  const raw = await readSecret(secretId);
  if (raw === null) {
    throw new VaultError(`vault secret ${secretId} not found`);
  }
  const parsed = LinkedInTokenSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VaultError(
      `vault secret ${secretId} has unexpected shape: ${parsed.error.message}`,
      parsed.error,
    );
  }
  return parsed.data;
}

export async function updateSecret(
  secretId: string,
  value: Json,
): Promise<void> {
  guardServerOnly();
  const client = createServiceRoleClient();

  const { error } = await client.rpc("vault_update_secret", {
    p_id: secretId,
    p_secret: value,
  });

  if (error) {
    throw new VaultError(`vault_update_secret failed: ${error.message}`, error);
  }
}

export async function deleteSecret(secretId: string): Promise<void> {
  guardServerOnly();
  const client = createServiceRoleClient();

  const { error } = await client.rpc("vault_delete_secret", {
    p_id: secretId,
  });

  if (error) {
    throw new VaultError(`vault_delete_secret failed: ${error.message}`, error);
  }
}
