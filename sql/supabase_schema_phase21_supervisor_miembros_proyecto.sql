-- Fase 21: el supervisor puede agregar o quitar personas (cualquier
-- persona activa, no solo su propio equipo) en los proyectos donde él
-- mismo figura como miembro — pero SOLO la membresía (member_ids), nada
-- más del proyecto (nombre, cliente, presupuesto, estado, color, etc.
-- siguen siendo de admin/gerente únicamente).

-- 1) Permite la fila: solo si quien actualiza es supervisor y ya figura
--    como miembro del proyecto que está tocando.
create policy "supervisor_update_own_project_members" on public.projects
  for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'supervisor')
    and auth.uid()::text = any(member_ids)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'supervisor')
  );

-- 2) Restringe la columna: si quien actualiza no es staff (admin/gerente),
--    cualquier cambio a columnas que no sean member_ids se descarta y se
--    conserva el valor viejo — mismo patrón que
--    supabase_schema_phase10_fix_profile_privilege_escalation.sql, así un
--    supervisor no puede aprovechar este permiso para tocar presupuesto,
--    estado, cliente, etc.
create or replace function public.enforce_supervisor_project_members_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff(auth.uid()) then
    return new;
  end if;

  new.client_id := old.client_id;
  new.name := old.name;
  new.color := old.color;
  new.status := old.status;
  new.budget_hours := old.budget_hours;
  new.notion_url := old.notion_url;
  new.flight_activity_id := old.flight_activity_id;
  return new;
end;
$$;

drop trigger if exists trg_enforce_supervisor_project_members_only on public.projects;
create trigger trg_enforce_supervisor_project_members_only
  before update on public.projects
  for each row execute function public.enforce_supervisor_project_members_only();
