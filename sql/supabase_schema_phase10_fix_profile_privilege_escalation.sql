-- P0 de la auditoría de seguridad: la política "Los usuarios pueden actualizar su
-- propio perfil" (supabase_schema.sql) solo exige auth.uid() = id, sin with check
-- ni restricción de columnas. Cualquier usuario autenticado podía ejecutar:
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', session.user.id)
-- y quedaba permitido, porque la política nunca mira la columna "role". Como
-- is_admin()/is_staff() (usadas en TODAS las demás políticas del sistema) leen
-- profiles.role, esto escalaba a control total sobre toda la base.
--
-- RLS por sí sola no alcanza para resolver esto de forma robusta (comparar el
-- valor viejo contra el nuevo dentro de una misma política es propenso a errores
-- de semántica). Se usa un trigger, que sí tiene acceso directo y confiable a
-- OLD y NEW: para quien NO es staff, solo permite tocar calendar_tz/calendar_tz2
-- (las únicas columnas que hoy edita un usuario común, desde Calendario). El
-- staff (admin/supervisor) sigue teniendo edición completa vía la política
-- staff_write_profiles ya existente — este trigger no le agrega restricciones.

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff(auth.uid()) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.must_change_password is distinct from old.must_change_password
     or new.online is distinct from old.online
     or new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.jornada is distinct from old.jornada
     or new.weekly_hours is distinct from old.weekly_hours
     or new.work_days is distinct from old.work_days
     or new.day_start is distinct from old.day_start
     or new.day_end is distinct from old.day_end
     or new.birthday is distinct from old.birthday
     or new.hire_date is distinct from old.hire_date
     or new.supervisor_id is distinct from old.supervisor_id
  then
    raise exception 'No tenés permiso para modificar ese campo de tu perfil.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_self_update on public.profiles;

create trigger trg_guard_profile_self_update
before update on public.profiles
for each row
execute function public.guard_profile_self_update();
