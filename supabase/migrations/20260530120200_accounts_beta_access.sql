-- Migration: accounts.beta_access (Phase 1 moat — T8 PR-B)
-- См. план T8 (D6) + Codex-ревью: замок тенанта для Market Brain agency-supplied
-- пути. Прикрывает открытый юр-форк #2 (индемнити/GDPR) для dogfood — ров считается
-- ТОЛЬКО для брендов аккаунтов с beta_access=true. Григорий щёлкает флаг в Supabase
-- для себя + тест-юзеров; новые аккаунты по умолчанию выключены.
--
-- Заменяет идею env-allowlist (гибче, без передеплоя при добавлении тестера).
-- Колонка на accounts (не на brands): доступ к Market Brain — свойство тенанта,
-- не отдельного бренда.

alter table public.accounts
  add column beta_access boolean not null default false;

comment on column public.accounts.beta_access is
  'T8: gate для Market Brain agency-supplied пути. true ⇒ cron считает '
  'market_differentiation для брендов этого аккаунта. Default false. Ставится '
  'руками (Supabase) до ратификации юр-клаузы индемнити/GDPR (юр-форк #2).';
