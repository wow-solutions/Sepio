-- Explicit target market for keyword research (eng-review slice 2, D2=B).
-- ISO 3166-1 alpha-2 country code; NULL = not set (research falls back to US).
-- Vendor-specific location codes (DataForSEO) are mapped in app code, not stored.
alter table public.brand_configs
  add column if not exists target_market text
  check (target_market is null or target_market ~ '^[A-Z]{2}$');
