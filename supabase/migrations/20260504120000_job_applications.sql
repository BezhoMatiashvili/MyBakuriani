-- 20260504120000_job_applications.sql
-- New table to capture CV submissions against employment listings (services with category='employment'),
-- plus a private cv-documents bucket for the CV files themselves.
-- Non-destructive: creates new objects only.

create table if not exists public.job_applications (
  id                       uuid primary key default gen_random_uuid(),
  service_id               uuid not null references public.services(id) on delete cascade,
  applicant_user_id        uuid references public.profiles(id) on delete set null,
  full_name                text not null,
  phone                    text not null,
  birth_date               date,
  current_location         text,
  needs_housing            boolean not null default false,
  languages                text[] not null default '{}',
  has_health_certificate   boolean not null default false,
  is_non_smoker            boolean not null default false,
  has_experience           boolean not null default false,
  last_workplace           text,
  desired_salary           numeric,
  cv_path                  text,
  status                   text not null default 'new' check (status in ('new', 'processed')),
  created_at               timestamptz not null default now()
);

create index if not exists idx_job_applications_service on public.job_applications (service_id);
create index if not exists idx_job_applications_service_status on public.job_applications (service_id, status);
create index if not exists idx_job_applications_created_at on public.job_applications (created_at desc);

alter table public.job_applications enable row level security;

-- Anyone (anon or authenticated) may submit. If authenticated, applicant_user_id must
-- match auth.uid() (prevents spoofing someone else's user id).
drop policy if exists "job_applications_public_insert" on public.job_applications;
create policy "job_applications_public_insert" on public.job_applications
  for insert
  with check (
    applicant_user_id is null
    or applicant_user_id = auth.uid()
  );

-- Listing owner sees applications for their listings.
drop policy if exists "job_applications_owner_select" on public.job_applications;
create policy "job_applications_owner_select" on public.job_applications
  for select
  using (
    exists (
      select 1 from public.services s
      where s.id = service_id and s.owner_id = auth.uid()
    )
  );

-- Listing owner may update status (e.g., mark processed).
drop policy if exists "job_applications_owner_update" on public.job_applications;
create policy "job_applications_owner_update" on public.job_applications
  for update
  using (
    exists (
      select 1 from public.services s
      where s.id = service_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.services s
      where s.id = service_id and s.owner_id = auth.uid()
    )
  );

-- Admin all-access.
drop policy if exists "job_applications_admin_all" on public.job_applications;
create policy "job_applications_admin_all" on public.job_applications
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Private bucket for CV files (PDF / DOCX, max 5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-documents',
  'cv-documents',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: anyone may upload (anon submissions allowed); only the listing
-- owner / admin may read.
drop policy if exists "cv_documents_anyone_insert" on storage.objects;
create policy "cv_documents_anyone_insert" on storage.objects
  for insert
  with check (bucket_id = 'cv-documents');

drop policy if exists "cv_documents_owner_select" on storage.objects;
create policy "cv_documents_owner_select" on storage.objects
  for select
  using (
    bucket_id = 'cv-documents'
    and (
      exists (
        select 1
        from public.job_applications a
        join public.services s on s.id = a.service_id
        where a.cv_path = name and s.owner_id = auth.uid()
      )
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
      )
    )
  );
