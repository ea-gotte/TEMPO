-- Fase 30: solo un admin da, quita o neutraliza el rol de administrador.
--
-- Problema (auditoría de seguridad, punto 4): guard_profile_self_update() deja
-- pasar cualquier cambio si quien edita es staff, y staff incluye a gerente.
-- Con la política staff_write_profiles (for all), un gerente podía:
--   update profiles set role = 'admin' where id = <él mismo>
-- y también desactivar o borrar el perfil de un admin.
--
-- Este trigger es independiente del guard de la fase 28 (que sigue igual) y
-- solo mira el rol de administrador:
--   - INSERT con role = 'admin' (salvo upsert de alguien que ya era admin) -> solo admin
--   - UPDATE que da o quita 'admin'                     -> solo admin
--   - UPDATE de active sobre la fila de un admin         -> solo admin
--   - DELETE de la fila de un admin                      -> solo admin
-- Sin sesión (panel de Supabase, handle_new_user, service_role) no se restringe.
-- Un gerente sigue pudiendo asignar usuario / supervisor / gerente.

create or replace function public.guard_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- Equipo guarda con upsert, que dispara este trigger de INSERT aunque la fila
    -- exista: si ya era admin, sigue por el camino de UPDATE (chequeado abajo).
    if new.role = 'admin'
       and not exists (select 1 from public.profiles where id = new.id and role = 'admin') then
      raise exception 'Solo un administrador puede asignar el rol de administrador.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and 'admin' in (new.role, old.role) then
      raise exception 'Solo un administrador puede dar o quitar el rol de administrador.';
    end if;
    if old.role = 'admin' and new.active is distinct from old.active then
      raise exception 'Solo un administrador puede activar o desactivar a otro administrador.';
    end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'admin' then
      raise exception 'Solo un administrador puede borrar a otro administrador.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_admin_role on public.profiles;

create trigger trg_guard_admin_role
before insert or update or delete on public.profiles
for each row
execute function public.guard_admin_role();
