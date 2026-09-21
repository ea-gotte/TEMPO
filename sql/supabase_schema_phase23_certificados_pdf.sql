-- Fase 23: certificados en PDF adjuntos a la formación / cursos del Perfil
-- profesional. Los archivos van a un bucket PRIVADO de Supabase Storage (no
-- dentro de la fila JSONB del perfil, que se descarga completa para todos en
-- cada carga) y la app los abre con un enlace firmado de corta duración.

-- ============================================================
-- 1. Bucket privado: solo PDF, máx. 10 MB por archivo
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados', 'certificados', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];

-- ============================================================
-- 2. Acceso: cada persona a su propia carpeta (<user_id>/...); el staff
-- (admin/gerente) a la de cualquiera, igual que professional_profiles.
-- ============================================================
drop policy if exists "certificados_select_own_or_staff" on storage.objects;
create policy "certificados_select_own_or_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificados'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff(auth.uid()))
  );

drop policy if exists "certificados_insert_own_or_staff" on storage.objects;
create policy "certificados_insert_own_or_staff" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificados'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff(auth.uid()))
  );

drop policy if exists "certificados_update_own_or_staff" on storage.objects;
create policy "certificados_update_own_or_staff" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'certificados'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff(auth.uid()))
  );

drop policy if exists "certificados_delete_own_or_staff" on storage.objects;
create policy "certificados_delete_own_or_staff" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'certificados'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff(auth.uid()))
  );
