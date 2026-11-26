-- Fase 39: la gestión de proyectos deja de ser una demo local.
--
-- Ficha, hitos, entregables, revisiones, tareas, sprints, cambios del cliente, líneas
-- base, riesgos, reuniones y campos personalizados vivían en el navegador de cada persona.
-- Pasan a la base para que todo el equipo vea lo mismo. (El tablero queda para otra fase.)
--
-- Cada tabla guarda una fila por elemento: su id, el proyecto y el elemento completo en
-- `data` (jsonb), tal como lo maneja la app. Así el módulo puede seguir creciendo sin
-- cambiar la base en cada ajuste.
--
-- Quién puede qué:
--   - Ver: admin y gerente, todo. El resto, los proyectos donde participa (es miembro o
--     tiene un rol). Cada persona ve además las tareas que tiene asignadas.
--   - Crear, editar y borrar: admin, gerente y quien tiene un rol de gestión en el proyecto
--     (Project Manager, Coordinador o Líder Funcional).
--   - El responsable de una tarea sin rol de gestión solo puede cambiarle el estado.
--   - Decidir un cambio del cliente (aprobar, diferir, rechazar): admin, gerente o el
--     Project Manager del proyecto.
--   - Campos personalizados globales (sin proyecto): los edita solo admin o gerente.
--
-- Las preguntas "¿en qué proyectos participo?" y "¿cuáles gestiono?" se resuelven una vez
-- por consulta (no por fila), igual que en la fase 38.
-- Requiere las fases 36 y 37. Se puede correr más de una vez.

begin;

-- ============================================================
-- 1. Proyectos de quien consulta
-- ============================================================
create or replace function public.my_project_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.projects p where auth.uid()::text = any(p.member_ids)
  union
  select a.project_id from public.project_role_assignments a where a.user_id = auth.uid();
$$;

create or replace function public.my_managed_project_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select a.project_id from public.project_role_assignments a
  where a.user_id = auth.uid() and a.role_key in ('lider_proyecto', 'coordinador', 'lider_tecnico');
$$;

revoke all on function public.my_project_ids() from public, anon;
revoke all on function public.my_managed_project_ids() from public, anon;
grant execute on function public.my_project_ids() to authenticated;
grant execute on function public.my_managed_project_ids() to authenticated;

-- Quién y cuándo lo cambió lo decide la base, no lo que mande el navegador.
create or replace function public.stamp_project_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.stamp_project_item() from public, anon, authenticated;

-- ============================================================
-- 2. Tablas (todas con la misma forma) y sus reglas
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'project_meta', 'project_milestones', 'project_deliverables', 'project_reviews', 'project_tasks',
    'project_sprints', 'project_changes', 'project_baselines', 'project_risks', 'project_meetings', 'project_fields'
  ] loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key check (char_length(id) between 1 and 80),
        project_id text references public.projects(id) on delete cascade,
        data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
        updated_at timestamptz not null default now(),
        updated_by uuid references public.profiles(id) on delete set null
      )$f$, t);
    execute format('create index if not exists %I on public.%I (project_id)', t || '_project_idx', t);
    -- Solo los campos personalizados pueden no tener proyecto (son los globales)
    if t <> 'project_fields' then
      execute format('alter table public.%I alter column project_id set not null', t);
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using ((select public.is_staff(auth.uid())) or project_id in (select public.my_project_ids()))$f$, t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check ((select public.is_staff(auth.uid())) or project_id in (select public.my_managed_project_ids()))$f$, t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using ((select public.is_staff(auth.uid())) or project_id in (select public.my_managed_project_ids()))
      with check ((select public.is_staff(auth.uid())) or project_id in (select public.my_managed_project_ids()))$f$, t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using ((select public.is_staff(auth.uid())) or project_id in (select public.my_managed_project_ids()))$f$, t || '_delete', t);

    execute format('drop trigger if exists %I on public.%I', 'trg_stamp_' || t, t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.stamp_project_item()', 'trg_stamp_' || t, t);

    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- La ficha es una por proyecto: su id es el del proyecto
alter table public.project_meta drop constraint if exists project_meta_id_is_project;
alter table public.project_meta add constraint project_meta_id_is_project check (id = project_id);

-- ============================================================
-- 3. Campos personalizados globales: los ven todos, los edita el staff
-- ============================================================
drop policy if exists "project_fields_select_global" on public.project_fields;
create policy "project_fields_select_global" on public.project_fields
  for select to authenticated
  using (project_id is null);

-- Los tres campos con los que venía el módulo (mismos ids que en la app)
insert into public.project_fields (id, project_id, data) values
  ('f_fase', null, '{"id":"f_fase","projectId":null,"name":"Fase","type":"seleccion","sortOrder":0,"options":[{"id":"fase_anteproyecto","label":"Anteproyecto","color":"#5b6cff"},{"id":"fase_diseno","label":"Diseño","color":"#12b5a5"},{"id":"fase_modelado","label":"Modelado","color":"#f5a524"},{"id":"fase_coordinacion","label":"Coordinación","color":"#8b5cf6"},{"id":"fase_documentacion","label":"Documentación","color":"#0ea5e9"},{"id":"fase_cierre","label":"Cierre","color":"#f0446c"}]}'::jsonb),
  ('f_disciplina', null, '{"id":"f_disciplina","projectId":null,"name":"Disciplina","type":"seleccion","sortOrder":1,"options":[{"id":"disc_estructuras","label":"Estructuras","color":"#5b6cff"},{"id":"disc_instalaciones","label":"Instalaciones","color":"#12b5a5"},{"id":"disc_arquitectura","label":"Arquitectura","color":"#f5a524"},{"id":"disc_gestion","label":"Gestión BIM","color":"#8b5cf6"}]}'::jsonb),
  ('f_aprobacion', null, '{"id":"f_aprobacion","projectId":null,"name":"Requiere aprobación del cliente","type":"casilla","sortOrder":2,"options":[]}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 4. Tareas: el responsable ve las suyas y puede cambiarles solo el estado
-- ============================================================
alter table public.project_tasks
  add column if not exists assignee_id text generated always as (data ->> 'assigneeId') stored;

create index if not exists project_tasks_assignee_idx on public.project_tasks (assignee_id);

drop policy if exists "project_tasks_select_own" on public.project_tasks;
create policy "project_tasks_select_own" on public.project_tasks
  for select to authenticated
  using (assignee_id = (select auth.uid())::text);

drop policy if exists "project_tasks_update_own" on public.project_tasks;
create policy "project_tasks_update_own" on public.project_tasks
  for update to authenticated
  using (assignee_id = (select auth.uid())::text)
  with check (assignee_id = (select auth.uid())::text);

create or replace function public.guard_project_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Lo único que cambia al mover una tarea de estado (y su orden dentro de la columna)
  status_keys text[] := array['status', 'completedAt', 'archived', 'archivedAt', 'sortOrder'];
begin
  -- Desde el editor SQL o un proceso del servidor no hay usuario: no se restringe
  if auth.uid() is null then
    return new;
  end if;
  if public.is_staff(auth.uid()) or new.project_id in (select public.my_managed_project_ids()) then
    return new;
  end if;
  if new.project_id is distinct from old.project_id
     or (new.data - status_keys) is distinct from (old.data - status_keys) then
    raise exception 'Solo podés cambiar el estado de tus tareas.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_project_task_update() from public, anon, authenticated;

drop trigger if exists trg_guard_project_task_update on public.project_tasks;
create trigger trg_guard_project_task_update
  before update on public.project_tasks
  for each row execute function public.guard_project_task_update();

-- ============================================================
-- 5. Cambios del cliente: los decide el Project Manager (o el staff)
-- ============================================================
create or replace function public.guard_project_change_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_status text := coalesce(new.data ->> 'status', 'pendiente');
  old_status text := case when tg_op = 'UPDATE' then coalesce(old.data ->> 'status', 'pendiente') else 'pendiente' end;
begin
  if auth.uid() is null or new_status = old_status then
    return new;
  end if;
  if not (public.is_staff(auth.uid()) or public.is_project_manager(new.project_id)) then
    raise exception 'Solo el Project Manager, un gerente o un administrador pueden decidir un cambio del cliente.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_project_change_decision() from public, anon, authenticated;

drop trigger if exists trg_guard_project_change_decision on public.project_changes;
create trigger trg_guard_project_change_decision
  before insert or update on public.project_changes
  for each row execute function public.guard_project_change_decision();

commit;
