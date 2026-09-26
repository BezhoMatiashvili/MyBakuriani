-- 20260926150000_cv_documents_10mb.sql
--
-- Owner decision 2026-09-26: job applicants may attach a CV again (disabled
-- since 20260723000000 "until malware scanning exists"), PDF or DOCX only, at
-- most 10 MB. This raises the cv-documents bucket limit from 5 MiB to 10 MiB.
--
-- Written as the original bucket upsert (20260504120000_job_applications.sql)
-- rather than a bare UPDATE, so a project whose restore lost the bucket row
-- gets it back instead of silently updating nothing. The bucket stays private
-- and keeps the same two content types.
--
-- The storage.objects policies dropped by 20260723000000
-- (cv_documents_anyone_insert, cv_documents_owner_select) stay dropped on
-- purpose: browsers never touch this bucket. Every CV goes through
-- service-role API routes:
--   * POST /api/job-applications      checks size (<= 10 MiB) and the file's
--     magic bytes (%PDF- / a ZIP containing word/document.xml), then stores it
--     at <service_id>/<application_id>.<pdf|docx> with a server-chosen type;
--   * GET  /api/job-applications/[id]/cv  lets only the vacancy owner or an
--     admin download it, via a 60 s signed URL with an attachment filename.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-documents',
  'cv-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
