-- Security: запрет self-escalation привилегий/биллинга на accounts.
-- RLS-политика "users can update own account" гейтит СТРОКУ (auth.uid()=id), но не
-- КОЛОНКИ → залогиненный юзер мог через REST сам себе выставить is_blog_admin /
-- beta_access / plan_tier. В приложении НЕТ записей в accounts с пользовательского
-- клиента (проверено grep'ом; привилегированные апдейты идут через service-role,
-- который column-grants не трогают). Ограничиваем роль authenticated: на accounts
-- ей можно менять ТОЛЬКО display_name; тариф/флаги/счётчики — service-role/админ.
-- Идемпотентно (revoke/grant безопасны при повторном применении).

revoke update on public.accounts from authenticated;
grant update (display_name) on public.accounts to authenticated;
-- anon вообще не пишет в accounts → снимаем и его UPDATE-грант (RLS его и так
-- блокировала, но грант лишний = defense in depth).
revoke update on public.accounts from anon;
