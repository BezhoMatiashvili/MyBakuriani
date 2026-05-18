-- Storage bucket for admin-managed banner/blog media (images + short videos).
-- 50 MB cap; allowed types limited to common web image + video formats.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-media',
  'landing-media',
  true,
  52428800,
  array[
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone (even anon) can read landing-media objects.
drop policy if exists "landing-media public read" on storage.objects;
create policy "landing-media public read"
  on storage.objects for select
  using (bucket_id = 'landing-media');

-- Admin-only writes. Defense-in-depth alongside the server-side admin gate
-- on the sign-upload API route.
drop policy if exists "landing-media admin insert" on storage.objects;
create policy "landing-media admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'landing-media'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "landing-media admin update" on storage.objects;
create policy "landing-media admin update"
  on storage.objects for update
  using (
    bucket_id = 'landing-media'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "landing-media admin delete" on storage.objects;
create policy "landing-media admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'landing-media'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Add video columns to landing_banners and blog_posts (additive, nullable).
alter table public.landing_banners
  add column if not exists video_url text,
  add column if not exists video_poster_url text;

alter table public.blog_posts
  add column if not exists video_url text,
  add column if not exists video_poster_url text;
