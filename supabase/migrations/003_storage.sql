-- =====================================================================
-- Mentora — 003 STORAGE (files)
-- Run THIRD.
--  teacher-documents : PRIVATE. Applicants can upload into applications/<random-id>/...
--                      Only admins can read (the admin page creates a 5-minute signed link).
--  teacher-photos    : PUBLIC read (approved profile photos). Only admins upload.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-documents', 'teacher-documents', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-photos', 'teacher-photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anyone (including not-signed-in applicants) may UPLOAD a new file into applications/ — but cannot list, read, overwrite or delete.
create policy "applicants upload documents" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'teacher-documents' and (storage.foldername(name))[1] = 'applications');

create policy "admins read documents" on storage.objects for select to authenticated
  using (bucket_id = 'teacher-documents' and public.is_admin());

create policy "admins manage documents" on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-documents' and public.is_admin());

create policy "public read photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'teacher-photos');

create policy "admins upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'teacher-photos' and public.is_admin());

create policy "admins update photos" on storage.objects for update to authenticated
  using (bucket_id = 'teacher-photos' and public.is_admin());

create policy "admins delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-photos' and public.is_admin());
