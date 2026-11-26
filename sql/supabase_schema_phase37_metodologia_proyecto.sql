-- Fase 37: la metodología de cada proyecto (planificado, plan + correcciones, ágil
-- o híbrido) pasa a la base. Vivía en el navegador de cada persona, con un valor de
-- ejemplo, así que cada uno podía ver una distinta para el mismo proyecto.
--
-- La cambian el staff y el Project Manager de ese proyecto. Un PM con rol "usuario"
-- no tiene permiso de editar la fila del proyecto, por eso el cambio pasa por una
-- función que solo toca esta columna. Se puede correr más de una vez.

alter table public.projects
  add column if not exists management_mode text
  check (management_mode in ('planificado', 'plan_correcciones', 'agil', 'hibrido'));

create or replace function public.set_project_mode(p_project text, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_staff(auth.uid()) or public.is_project_manager(p_project)) then
    raise exception 'Solo un administrador, un gerente o el Project Manager pueden cambiar la metodología del proyecto.'
      using errcode = '42501';
  end if;
  update public.projects set management_mode = p_mode where id = p_project;
  if not found then
    raise exception 'El proyecto no existe.';
  end if;
end;
$$;

revoke all on function public.set_project_mode(text, text) from public, anon;
grant execute on function public.set_project_mode(text, text) to authenticated;

-- Un supervisor puede editar la fila de sus proyectos para cambiar la membresía
-- (fase 21). Este trigger evita que por esa vía también cambie la metodología.
create or replace function public.guard_project_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.management_mode is distinct from old.management_mode
     and not (public.is_staff(auth.uid()) or public.is_project_manager(new.id)) then
    new.management_mode := old.management_mode;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_project_mode() from public, anon, authenticated;

drop trigger if exists trg_guard_project_mode on public.projects;
create trigger trg_guard_project_mode
  before update on public.projects
  for each row execute function public.guard_project_mode();
