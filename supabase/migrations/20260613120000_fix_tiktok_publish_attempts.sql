-- Drift guard: posts.platform CHECK (20260610120000_content_kitchen.sql) добавил
-- 'tiktok', но publish_attempts.platform CHECK (20260609120000_posting_pipeline.sql)
-- остался без него. Любая запись publish_attempts для tiktok-варианта нарушала бы
-- publish_attempts_platform_check на уровне БД. Синхронизируем списки (R-02).
alter table public.publish_attempts drop constraint if exists publish_attempts_platform_check;
alter table public.publish_attempts add constraint publish_attempts_platform_check
  check (platform in ('linkedin','facebook','instagram','x','threads','wordpress','webflow','shopify','telegram','tiktok','blog','custom','hosted'));
