-- Atomic running-gate (Codex P2, slice 3 diff review): at most one live run
-- per brand, enforced by the database instead of check-then-insert. Stale
-- 'running' rows (crashed workers) are failed by the app before insert.
create unique index ai_visibility_one_running_per_brand
  on public.ai_visibility_runs (brand_id) where status = 'running';
