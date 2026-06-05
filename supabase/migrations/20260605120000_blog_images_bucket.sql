-- Public storage bucket for blog images (cover/OG + inline body images).
--
-- Public read so <img> works on the public site. Writes happen ONLY through the
-- uploadBlogImage Server Action (service-role, re-checks is_blog_admin), so no
-- permissive write policy is added — default-deny on storage.objects stands for
-- anon/authenticated. Size + mime are enforced at the bucket AND in the action.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
