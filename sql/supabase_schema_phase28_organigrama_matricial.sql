-- Fase 28: organigrama matricial (tipo PMI). Columnas = áreas funcionales,
-- cada una con su jefe funcional; filas = proyectos, cada uno con su jefe
-- de proyecto; la celda se arma sola con los miembros del proyecto que
-- pertenecen a esa área (ver src/pages/OrgMatrix.tsx).

-- ============================================================
-- 1. Catálogo de áreas funcionales (departamento / especialidad)
-- ============================================================
create table if not exists public.functional_areas (
  id text primary key,
  name text not null,
  leader_id uuid references public.profiles(id) on delete set null
);

alter table public.functional_areas enable row level security;

create policy "select_functional_areas" on public.functional_areas
  for select to authenticated using (true);

create policy "staff_write_functional_areas" on public.functional_areas
  for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

grant select, insert, update, delete on public.functional_areas to authenticated;
alter publication supabase_realtime add table public.functional_areas;

-- ============================================================
-- 2. Área de cada persona (una sola: su especialidad "de origen")
-- ============================================================
alter table public.profiles
  add column if not exists functional_area_id text references public.functional_areas(id) on delete set null;

-- ============================================================
-- 3. Jefe de proyecto
-- ============================================================
alter table public.projects
  add column if not exists leader_id uuid references public.profiles(id) on delete set null;

-- ============================================================
-- 4. Protección de columnas: un usuario común no puede cambiarse su propia
-- área ni su equipo (España/LATAM decide si puede editar en Calendario y
-- Registro de tiempo). Misma función de la fase 13, con esas dos columnas
-- agregadas a la lista.
-- ============================================================
create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.must_change_password is distinct from old.must_change_password
     or new.online is distinct from old.online
     or new.email is distinct from old.email
     or new.jornada is distinct from old.jornada
     or new.weekly_hours is distinct from old.weekly_hours
     or new.work_days is distinct from old.work_days
     or new.day_start is distinct from old.day_start
     or new.day_end is distinct from old.day_end
     or new.birthday is distinct from old.birthday
     or new.hire_date is distinct from old.hire_date
     or new.supervisor_id is distinct from old.supervisor_id
     or new.team is distinct from old.team
     or new.functional_area_id is distinct from old.functional_area_id
  then
    raise exception 'No tenés permiso para modificar ese campo de tu perfil.';
  end if;

  return new;
end;
$$;

-- El supervisor que edita la membresía de sus proyectos (fase 21) tampoco
-- puede cambiar el jefe de proyecto: se agrega leader_id a las columnas que
-- se restauran.
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
  new.leader_id := old.leader_id;
  return new;
end;
$$;
